CREATE TABLE `auth_identities` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `provider` enum('google','line','telegram') NOT NULL,
  `providerUserId` varchar(255) NOT NULL,
  `email` varchar(320),
  `displayName` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `auth_identities_id` PRIMARY KEY(`id`),
  CONSTRAINT `auth_identities_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_identity_provider_user_uq` ON `auth_identities` (`provider`,`providerUserId`);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_identity_user_provider_uq` ON `auth_identities` (`userId`,`provider`);
--> statement-breakpoint
CREATE INDEX `auth_identity_user_idx` ON `auth_identities` (`userId`);
