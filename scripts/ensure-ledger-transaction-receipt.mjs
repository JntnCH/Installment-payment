import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("[Ledger Receipt Migration] DATABASE_URL is required.");

const connection = await mysql.createConnection(databaseUrl);

try {
  const [[databaseRow]] = await connection.query("SELECT DATABASE() AS databaseName");
  const databaseName = databaseRow.databaseName;
  if (!databaseName) throw new Error("[Ledger Receipt Migration] DATABASE_URL does not select a database.");

  const [tables] = await connection.execute(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'ledger_transactions'",
    [databaseName]
  );
  if (tables.length === 0) throw new Error("[Ledger Receipt Migration] ledger_transactions table is missing.");

  const [columns] = await connection.execute(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'ledger_transactions'",
    [databaseName]
  );
  const hasReceiptKey = columns.some(column => column.COLUMN_NAME === "receiptKey");
  if (!hasReceiptKey) {
    await connection.query(
      "ALTER TABLE ledger_transactions ADD COLUMN receiptKey varchar(512) NULL AFTER note"
    );
    console.log("[Ledger Receipt Migration] Added ledger_transactions.receiptKey");
  } else {
    console.log("[Ledger Receipt Migration] ledger_transactions.receiptKey is already present");
  }
} finally {
  await connection.end();
}
