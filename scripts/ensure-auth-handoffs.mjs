import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("[Auth Handoff Migration] DATABASE_URL is required.");

const connection = await mysql.createConnection(databaseUrl);

try {
  const [[databaseRow]] = await connection.query("SELECT DATABASE() AS databaseName");
  const databaseName = databaseRow.databaseName;
  if (!databaseName) throw new Error("[Auth Handoff Migration] DATABASE_URL does not select a database.");

  const [users] = await connection.execute(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'",
    [databaseName],
  );
  if (users.length === 0) {
    throw new Error("[Auth Handoff Migration] Required users table is missing; no changes were made.");
  }

  await connection.query(`
    CREATE TABLE IF NOT EXISTS auth_handoffs (
      codeHash varchar(64) NOT NULL,
      userId int NOT NULL,
      purpose enum('google_oauth','telegram_return') NOT NULL,
      expiresAt timestamp NOT NULL,
      consumedAt timestamp NULL,
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (codeHash),
      KEY auth_handoff_user_idx (userId),
      KEY auth_handoff_expiry_idx (purpose, expiresAt),
      CONSTRAINT auth_handoffs_user_fk
        FOREIGN KEY (userId) REFERENCES users (id)
        ON DELETE CASCADE ON UPDATE NO ACTION
    ) ENGINE=InnoDB
  `);

  const [columns] = await connection.execute(
    "SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'auth_handoffs'",
    [databaseName],
  );
  const actual = new Map(columns.map(column => [column.COLUMN_NAME, column.DATA_TYPE]));
  const expected = {
    codeHash: "varchar",
    userId: "int",
    purpose: "enum",
    expiresAt: "timestamp",
    consumedAt: "timestamp",
    createdAt: "timestamp",
  };
  for (const [name, type] of Object.entries(expected)) {
    if (actual.get(name) !== type) {
      throw new Error(`[Auth Handoff Migration] auth_handoffs.${name} is missing or has an unexpected type. Stopped.`);
    }
  }

  console.log("[Auth Handoff Migration] auth_handoffs table is ready.");
} finally {
  await connection.end();
}
