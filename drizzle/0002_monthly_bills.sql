CREATE TABLE `monthly_bills` (
  `id` varchar(64) NOT NULL,
  `ownerId` int NOT NULL,
  `billName` varchar(160) NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `dueDate` date NOT NULL,
  `status` enum('pending','paid') NOT NULL DEFAULT 'pending',
  `note` text,
  `deletedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `monthly_bill_owner_due_idx` (`ownerId`,`dueDate`),
  KEY `monthly_bill_owner_status_idx` (`ownerId`,`status`),
  CONSTRAINT `monthly_bills_owner_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `monthly_bill_sync_outbox` (
  `id` varchar(64) NOT NULL,
  `ownerId` int NOT NULL,
  `billId` varchar(64) NOT NULL,
  `action` enum('upsert','delete') NOT NULL,
  `status` enum('pending','processing','done') NOT NULL DEFAULT 'pending',
  `attempts` int NOT NULL DEFAULT 0,
  `nextRetryAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `lastError` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `monthly_bill_outbox_retry_idx` (`status`,`nextRetryAt`),
  KEY `monthly_bill_outbox_bill_idx` (`ownerId`,`billId`,`createdAt`),
  CONSTRAINT `monthly_bill_outbox_owner_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
