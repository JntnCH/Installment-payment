CREATE TABLE `ledger_payment_schedules` (
	`id` varchar(64) NOT NULL,
	`ownerId` int NOT NULL,
	`partyId` varchar(64) NOT NULL,
	`contractId` varchar(64) NOT NULL,
	`installmentNo` int NOT NULL,
	`dueDate` date NOT NULL,
	`amount` decimal(15,2) NOT NULL,
	`paidAmount` decimal(15,2) NOT NULL DEFAULT '0.00',
	`status` enum('pending','paid','waived') NOT NULL DEFAULT 'pending',
	`paidAt` timestamp,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ledger_payment_schedules_id` PRIMARY KEY(`id`),
	CONSTRAINT `ledger_schedule_contract_installment_uq` UNIQUE(`contractId`,`installmentNo`)
);
--> statement-breakpoint
CREATE TABLE `ledger_contracts` (
	`id` varchar(64) NOT NULL,
	`ownerId` int NOT NULL,
	`partyId` varchar(64) NOT NULL,
	`title` varchar(255) NOT NULL,
	`principal` decimal(15,2) NOT NULL,
	`interestRate` decimal(9,4) NOT NULL DEFAULT '0.0000',
	`installmentCount` int NOT NULL,
	`startDate` date NOT NULL,
	`status` enum('active','completed','cancelled') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ledger_contracts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ledger_transactions` (
	`id` varchar(64) NOT NULL,
	`ownerId` int NOT NULL,
	`partyId` varchar(64) NOT NULL,
	`contractId` varchar(64),
	`scheduleId` varchar(64),
	`type` enum('disbursement','payment','adjustment') NOT NULL,
	`amount` decimal(15,2) NOT NULL,
	`occurredAt` timestamp NOT NULL,
	`source` varchar(64) NOT NULL DEFAULT 'manual',
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ledger_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ledger_parties` (
	`id` varchar(64) NOT NULL,
	`ownerId` int NOT NULL,
	`displayName` varchar(160) NOT NULL,
	`role` enum('debtor','creditor') NOT NULL,
	`phone` varchar(32),
	`note` text,
	`status` enum('active','archived') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ledger_parties_id` PRIMARY KEY(`id`),
	CONSTRAINT `ledger_party_owner_role_name_uq` UNIQUE(`ownerId`,`role`,`displayName`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
--> statement-breakpoint
ALTER TABLE `ledger_payment_schedules` ADD CONSTRAINT `ledger_payment_schedules_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ledger_payment_schedules` ADD CONSTRAINT `ledger_payment_schedules_partyId_ledger_parties_id_fk` FOREIGN KEY (`partyId`) REFERENCES `ledger_parties`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ledger_payment_schedules` ADD CONSTRAINT `ledger_payment_schedules_contractId_ledger_contracts_id_fk` FOREIGN KEY (`contractId`) REFERENCES `ledger_contracts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ledger_contracts` ADD CONSTRAINT `ledger_contracts_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ledger_contracts` ADD CONSTRAINT `ledger_contracts_partyId_ledger_parties_id_fk` FOREIGN KEY (`partyId`) REFERENCES `ledger_parties`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ledger_transactions` ADD CONSTRAINT `ledger_transactions_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ledger_transactions` ADD CONSTRAINT `ledger_transactions_partyId_ledger_parties_id_fk` FOREIGN KEY (`partyId`) REFERENCES `ledger_parties`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ledger_transactions` ADD CONSTRAINT `ledger_transactions_contractId_ledger_contracts_id_fk` FOREIGN KEY (`contractId`) REFERENCES `ledger_contracts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ledger_transactions` ADD CONSTRAINT `ledger_transactions_scheduleId_ledger_payment_schedules_id_fk` FOREIGN KEY (`scheduleId`) REFERENCES `ledger_payment_schedules`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ledger_parties` ADD CONSTRAINT `ledger_parties_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ledger_schedule_contract_due_idx` ON `ledger_payment_schedules` (`contractId`,`dueDate`);--> statement-breakpoint
CREATE INDEX `ledger_schedule_owner_due_idx` ON `ledger_payment_schedules` (`ownerId`,`dueDate`);--> statement-breakpoint
CREATE INDEX `ledger_contract_owner_party_idx` ON `ledger_contracts` (`ownerId`,`partyId`);--> statement-breakpoint
CREATE INDEX `ledger_contract_owner_status_idx` ON `ledger_contracts` (`ownerId`,`status`);--> statement-breakpoint
CREATE INDEX `ledger_transaction_owner_occurred_idx` ON `ledger_transactions` (`ownerId`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `ledger_transaction_contract_occurred_idx` ON `ledger_transactions` (`contractId`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `ledger_transaction_party_occurred_idx` ON `ledger_transactions` (`partyId`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `ledger_party_owner_role_idx` ON `ledger_parties` (`ownerId`,`role`);