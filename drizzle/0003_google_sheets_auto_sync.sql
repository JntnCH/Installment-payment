CREATE TABLE `google_sheets_connections` (
  `userId` int NOT NULL,
  `refreshTokenEncrypted` text NOT NULL,
  `spreadsheetId` varchar(255),
  `connectedEmail` varchar(320),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`userId`),
  CONSTRAINT `google_sheets_connections_user_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
