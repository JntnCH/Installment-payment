CREATE TABLE `monthly_bill_payments` (
  `id` varchar(64) NOT NULL,
  `ownerId` int NOT NULL,
  `billId` varchar(64) NOT NULL,
  `monthKey` varchar(7) NOT NULL,
  `paidAmount` decimal(15,2) NOT NULL,
  `paidAt` timestamp NOT NULL,
  `receiptKey` varchar(512),
  `transactionId` varchar(128) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `monthly_bill_payment_owner_bill_month_uq` (`ownerId`,`billId`,`monthKey`),
  KEY `monthly_bill_payment_owner_paid_at_idx` (`ownerId`,`paidAt`),
  KEY `monthly_bill_payment_bill_month_idx` (`billId`,`monthKey`),
  CONSTRAINT `monthly_bill_payments_owner_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `monthly_bill_payments_bill_fk` FOREIGN KEY (`billId`) REFERENCES `monthly_bills`(`id`) ON DELETE CASCADE
);

INSERT INTO `monthly_bill_payments`
  (`id`, `ownerId`, `billId`, `monthKey`, `paidAmount`, `paidAt`, `receiptKey`, `transactionId`, `createdAt`, `updatedAt`)
SELECT
  UUID(),
  `ownerId`,
  `id`,
  DATE_FORMAT(`paidAt`, '%Y-%m'),
  COALESCE(`paidAmount`, `amount`),
  `paidAt`,
  `receiptKey`,
  CONCAT('monthly-bill:', `id`, ':', DATE_FORMAT(`paidAt`, '%Y-%m')),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM `monthly_bills`
WHERE `status` = 'paid' AND `paidAt` IS NOT NULL;
