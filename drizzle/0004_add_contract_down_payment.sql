ALTER TABLE `ledger_contracts`
  ADD COLUMN `downPayment` decimal(15,2) NOT NULL DEFAULT '0.00' AFTER `principal`;
