SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ledger_transactions' AND COLUMN_NAME = 'accountName') = 0,
  'ALTER TABLE `ledger_transactions` ADD COLUMN `accountName` varchar(160) NULL',
  'SELECT 1'
);
PREPARE payment_stmt FROM @ddl;
EXECUTE payment_stmt;
DEALLOCATE PREPARE payment_stmt;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'monthly_bill_payments' AND COLUMN_NAME = 'accountName') = 0,
  CONCAT('ALTER TABLE `monthly_bill_payments` ADD COLUMN `accountName` varchar(160) NOT NULL DEFAULT ', CHAR(39), CHAR(39)),
  'SELECT 1'
);
PREPARE payment_stmt FROM @ddl;
EXECUTE payment_stmt;
DEALLOCATE PREPARE payment_stmt;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'monthly_bill_payments' AND INDEX_NAME = 'monthly_bill_payment_owner_bill_month_uq') > 0,
  'ALTER TABLE `monthly_bill_payments` DROP INDEX `monthly_bill_payment_owner_bill_month_uq`',
  'SELECT 1'
);
PREPARE payment_stmt FROM @ddl;
EXECUTE payment_stmt;
DEALLOCATE PREPARE payment_stmt;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'monthly_bill_payments' AND INDEX_NAME = 'monthly_bill_payment_owner_bill_month_idx') = 0,
  'ALTER TABLE `monthly_bill_payments` ADD INDEX `monthly_bill_payment_owner_bill_month_idx` (`ownerId`, `billId`, `monthKey`)',
  'SELECT 1'
);
PREPARE payment_stmt FROM @ddl;
EXECUTE payment_stmt;
DEALLOCATE PREPARE payment_stmt;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'monthly_bill_payments' AND INDEX_NAME = 'monthly_bill_payment_transaction_uq') = 0,
  'ALTER TABLE `monthly_bill_payments` ADD UNIQUE INDEX `monthly_bill_payment_transaction_uq` (`transactionId`)',
  'SELECT 1'
);
PREPARE payment_stmt FROM @ddl;
EXECUTE payment_stmt;
DEALLOCATE PREPARE payment_stmt;
