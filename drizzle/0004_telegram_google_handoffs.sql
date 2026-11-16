CREATE TABLE `auth_handoffs` (
  `codeHash` varchar(64) NOT NULL,
  `userId` int NOT NULL,
  `purpose` enum('google_oauth','telegram_return') NOT NULL,
  `expiresAt` timestamp NOT NULL,
  `consumedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `auth_handoffs_codeHash` PRIMARY KEY(`codeHash`),
  CONSTRAINT `auth_handoffs_user_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX `auth_handoff_user_idx` ON `auth_handoffs` (`userId`);
--> statement-breakpoint
CREATE INDEX `auth_handoff_expiry_idx` ON `auth_handoffs` (`purpose`,`expiresAt`);
