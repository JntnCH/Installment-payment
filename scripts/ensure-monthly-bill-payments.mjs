import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("[Monthly Bill Payments Migration] DATABASE_URL is required.");

const connection = await mysql.createConnection(databaseUrl);

try {
  const [[databaseRow]] = await connection.query("SELECT DATABASE() AS databaseName");
  const databaseName = databaseRow.databaseName;
  if (!databaseName) throw new Error("[Monthly Bill Payments Migration] DATABASE_URL does not select a database.");

  const [tables] = await connection.execute(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('users', 'monthly_bills')",
    [databaseName]
  );
  const existingTables = new Set(tables.map(row => row.TABLE_NAME));
  if (!existingTables.has("users") || !existingTables.has("monthly_bills")) {
    throw new Error("[Monthly Bill Payments Migration] users or monthly_bills table is missing; no changes were made.");
  }

  await connection.query(`CREATE TABLE IF NOT EXISTS monthly_bill_payments (
    id varchar(64) NOT NULL,
    ownerId int NOT NULL,
    billId varchar(64) NOT NULL,
    monthKey varchar(7) NOT NULL,
    paidAmount decimal(15,2) NOT NULL,
    paidAt timestamp NOT NULL,
    receiptKey varchar(512),
    transactionId varchar(128) NOT NULL,
    accountName varchar(160) NOT NULL DEFAULT '',
    createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY monthly_bill_payment_owner_bill_month_idx (ownerId, billId, monthKey),
    UNIQUE KEY monthly_bill_payment_transaction_uq (transactionId),
    KEY monthly_bill_payment_owner_paid_at_idx (ownerId, paidAt),
    KEY monthly_bill_payment_bill_month_idx (billId, monthKey),
    CONSTRAINT monthly_bill_payments_owner_fk FOREIGN KEY (ownerId) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT monthly_bill_payments_bill_fk FOREIGN KEY (billId) REFERENCES monthly_bills (id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);

  const [ledgerColumns] = await connection.execute(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'ledger_transactions'",
    [databaseName]
  );
  if (!ledgerColumns.some(row => row.COLUMN_NAME === "accountName")) {
    await connection.query("ALTER TABLE ledger_transactions ADD COLUMN accountName varchar(160) NULL");
  }

  const [paymentColumns] = await connection.execute(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'monthly_bill_payments'",
    [databaseName]
  );
  if (!paymentColumns.some(row => row.COLUMN_NAME === "accountName")) {
    await connection.query("ALTER TABLE monthly_bill_payments ADD COLUMN accountName varchar(160) NOT NULL DEFAULT ''");
  }

  const [paymentIndexes] = await connection.execute(
    "SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'monthly_bill_payments'",
    [databaseName]
  );
  const indexNames = new Set(paymentIndexes.map(row => row.INDEX_NAME));
  if (indexNames.has("monthly_bill_payment_owner_bill_month_uq")) {
    await connection.query("ALTER TABLE monthly_bill_payments DROP INDEX monthly_bill_payment_owner_bill_month_uq");
  }
  if (!indexNames.has("monthly_bill_payment_owner_bill_month_idx")) {
    await connection.query("ALTER TABLE monthly_bill_payments ADD INDEX monthly_bill_payment_owner_bill_month_idx (ownerId, billId, monthKey)");
  }
  if (!indexNames.has("monthly_bill_payment_transaction_uq")) {
    await connection.query("ALTER TABLE monthly_bill_payments ADD UNIQUE INDEX monthly_bill_payment_transaction_uq (transactionId)");
  }

  await connection.query(`INSERT IGNORE INTO monthly_bill_payments
    (id, ownerId, billId, monthKey, paidAmount, paidAt, receiptKey, transactionId, createdAt, updatedAt)
    SELECT UUID(), ownerId, id, DATE_FORMAT(paidAt, '%Y-%m'),
      COALESCE(paidAmount, amount), paidAt, receiptKey,
      CONCAT('monthly-bill:', id, ':', DATE_FORMAT(paidAt, '%Y-%m')),
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM monthly_bills
    WHERE status = 'paid' AND paidAt IS NOT NULL`);

  console.log("[Monthly Bill Payments Migration] Monthly payment history table is ready.");
} finally {
  await connection.end();
}
