ALTER TABLE `ledger_transactions`
  ADD COLUMN `receiptKey` varchar(512) NULL AFTER `note`;
