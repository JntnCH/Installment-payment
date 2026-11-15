ALTER TABLE `monthly_bills`
  ADD COLUMN `paidAt` timestamp NULL,
  ADD COLUMN `paidAmount` decimal(15,2) NULL,
  ADD COLUMN `receiptKey` varchar(512) NULL;
