import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("[Monthly Bills Migration] DATABASE_URL is required.");

const connection = await mysql.createConnection(databaseUrl);

const createStatements = [
  `CREATE TABLE IF NOT EXISTS monthly_bills (
    id varchar(64) NOT NULL,
    ownerId int NOT NULL,
    billName varchar(160) NOT NULL,
    amount decimal(15,2) NOT NULL,
    dueDate date NOT NULL,
    status enum('pending','paid') NOT NULL DEFAULT 'pending',
    note text,
    deletedAt timestamp NULL,
    createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY monthly_bill_owner_due_idx (ownerId, dueDate),
    KEY monthly_bill_owner_status_idx (ownerId, status),
    CONSTRAINT monthly_bills_owner_fk FOREIGN KEY (ownerId) REFERENCES users (id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS monthly_bill_sync_outbox (
    id varchar(64) NOT NULL,
    ownerId int NOT NULL,
    billId varchar(64) NOT NULL,
    action enum('upsert','delete') NOT NULL,
    status enum('pending','processing','done') NOT NULL DEFAULT 'pending',
    attempts int NOT NULL DEFAULT 0,
    nextRetryAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lastError text,
    createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY monthly_bill_outbox_retry_idx (status, nextRetryAt),
    KEY monthly_bill_outbox_bill_idx (ownerId, billId, createdAt),
    CONSTRAINT monthly_bill_outbox_owner_fk FOREIGN KEY (ownerId) REFERENCES users (id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS google_sheets_connections (
    userId int NOT NULL,
    refreshTokenEncrypted text NOT NULL,
    spreadsheetId varchar(255),
    connectedEmail varchar(320),
    createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (userId),
    CONSTRAINT google_sheets_connections_user_fk FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
];

const expectedColumns = {
  monthly_bills: ["id", "ownerId", "billName", "amount", "dueDate", "status", "note", "deletedAt", "createdAt", "updatedAt"],
  monthly_bill_sync_outbox: ["id", "ownerId", "billId", "action", "status", "attempts", "nextRetryAt", "lastError", "createdAt"],
  google_sheets_connections: ["userId", "refreshTokenEncrypted", "spreadsheetId", "connectedEmail", "createdAt", "updatedAt"],
};

try {
  const [[databaseRow]] = await connection.query("SELECT DATABASE() AS databaseName");
  const databaseName = databaseRow.databaseName;
  if (!databaseName) throw new Error("[Monthly Bills Migration] DATABASE_URL does not select a database.");

  const [users] = await connection.execute(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'",
    [databaseName]
  );
  if (users.length === 0) throw new Error("[Monthly Bills Migration] users table is missing; no changes were made.");

  for (const statement of createStatements) await connection.query(statement);

  for (const [tableName, required] of Object.entries(expectedColumns)) {
    const [columns] = await connection.execute(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?",
      [databaseName, tableName]
    );
    const actual = new Set(columns.map(column => column.COLUMN_NAME));
    const missing = required.filter(column => !actual.has(column));
    if (missing.length) {
      throw new Error(`[Monthly Bills Migration] ${tableName} has an incompatible schema; missing: ${missing.join(", ")}. No existing data was changed.`);
    }
  }

  console.log("[Monthly Bills Migration] Monthly bill and Google Sheets sync tables are ready.");
} finally {
  await connection.end();
}
