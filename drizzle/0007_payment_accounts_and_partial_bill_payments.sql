ALTER TABLE `ledger_transactions`
  ADD COLUMN `accountName` varchar(160) NULL;

ALTER TABLE `monthly_bill_payments`
  ADD COLUMN `accountName` varchar(160) NOT NULL DEFAULT '';

ALTER TABLE `monthly_bill_payments`
  DROP INDEX `monthly_bill_payment_owner_bill_month_uq`,
  ADD KEY `monthly_bill_payment_owner_bill_month_idx` (`ownerId`, `billId`, `monthKey`),
  ADD UNIQUE KEY `monthly_bill_payment_transaction_uq` (`transactionId`);
