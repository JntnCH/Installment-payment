import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("[Contract Migration] DATABASE_URL is required.");

const connection = await mysql.createConnection(databaseUrl);

try {
  const [[databaseRow]] = await connection.query("SELECT DATABASE() AS databaseName");
  const databaseName = databaseRow.databaseName;
  if (!databaseName) throw new Error("[Contract Migration] DATABASE_URL does not select a database.");

  const [tables] = await connection.execute(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'ledger_contracts'",
    [databaseName]
  );
  if (tables.length === 0) throw new Error("[Contract Migration] ledger_contracts table is missing.");

  const [columns] = await connection.execute(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'ledger_contracts'",
    [databaseName]
  );
  const hasDownPayment = columns.some(column => column.COLUMN_NAME === "downPayment");
  if (!hasDownPayment) {
    await connection.query(
      "ALTER TABLE ledger_contracts ADD COLUMN downPayment decimal(15,2) NOT NULL DEFAULT '0.00' AFTER principal"
    );
    console.log("[Contract Migration] Added ledger_contracts.downPayment");
  } else {
    console.log("[Contract Migration] ledger_contracts.downPayment is already present");
  }
} finally {
  await connection.end();
}
