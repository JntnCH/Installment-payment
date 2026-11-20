import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("[Financial Assets Migration] DATABASE_URL is required.");

const connection = await mysql.createConnection(databaseUrl);
try {
  const [[databaseRow]] = await connection.query("SELECT DATABASE() AS databaseName");
  const databaseName = databaseRow.databaseName;
  if (!databaseName) throw new Error("[Financial Assets Migration] DATABASE_URL does not select a database.");

  const [users] = await connection.execute(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'",
    [databaseName]
  );
  if (users.length === 0) throw new Error("[Financial Assets Migration] users table is missing; no changes were made.");

  await connection.query(`CREATE TABLE IF NOT EXISTS financial_assets (
    id varchar(64) NOT NULL,
    ownerId int NOT NULL,
    category enum('cash','bank','vehicle','property','gold','investment','other') NOT NULL,
    name varchar(160) NOT NULL,
    amount decimal(15,2) NOT NULL,
    note text,
    createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY financial_asset_owner_category_idx (ownerId, category),
    CONSTRAINT financial_assets_owner_fk FOREIGN KEY (ownerId) REFERENCES users (id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);

  await connection.query(`CREATE TABLE IF NOT EXISTS financial_asset_sync_outbox (
    id varchar(64) NOT NULL,
    ownerId int NOT NULL,
    assetId varchar(64) NOT NULL,
    action enum('upsert','delete') NOT NULL,
    status enum('pending','processing','done') NOT NULL DEFAULT 'pending',
    attempts int NOT NULL DEFAULT 0,
    nextRetryAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lastError text,
    createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY financial_asset_outbox_retry_idx (status, nextRetryAt),
    KEY financial_asset_outbox_asset_idx (ownerId, assetId, createdAt),
    CONSTRAINT financial_asset_outbox_owner_fk FOREIGN KEY (ownerId) REFERENCES users (id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);

  const [columns] = await connection.execute(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'financial_assets'",
    [databaseName]
  );
  const expected = ["id", "ownerId", "category", "name", "amount", "note", "createdAt", "updatedAt"];
  const actual = new Set(columns.map(column => column.COLUMN_NAME));
  const missing = expected.filter(column => !actual.has(column));
  if (missing.length) throw new Error(`[Financial Assets Migration] Incompatible financial_assets schema; missing: ${missing.join(", ")}.`);
  console.log("[Financial Assets Migration] financial_assets table is ready.");
} finally {
  await connection.end();
}
