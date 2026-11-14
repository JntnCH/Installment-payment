import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("[Migration] DATABASE_URL is required.");
}

const connection = await mysql.createConnection(databaseUrl);

const expectedColumns = {
  id: "int",
  userId: "int",
  provider: "enum",
  providerUserId: "varchar",
  email: "varchar",
  displayName: "text",
  createdAt: "timestamp",
  updatedAt: "timestamp",
};

const expectedIndexes = [
  {
    name: "auth_identity_provider_user_uq",
    columns: ["provider", "providerUserId"],
    unique: true,
  },
  {
    name: "auth_identity_user_provider_uq",
    columns: ["userId", "provider"],
    unique: true,
  },
  {
    name: "auth_identity_user_idx",
    columns: ["userId"],
    unique: false,
  },
];

try {
  const [[databaseRow]] = await connection.query(
    "SELECT DATABASE() AS databaseName"
  );
  const databaseName = databaseRow.databaseName;

  if (!databaseName) {
    throw new Error("[Migration] DATABASE_URL does not select a database.");
  }

  const [userTables] = await connection.execute(
    `SELECT TABLE_NAME
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'`,
    [databaseName]
  );

  if (userTables.length === 0) {
    throw new Error("[Migration] Required users table was not found. No changes were made.");
  }

  const [existingTables] = await connection.execute(
    `SELECT TABLE_NAME
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'auth_identities'`,
    [databaseName]
  );

  if (existingTables.length === 0) {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS `auth_identities` (
        `id` int NOT NULL AUTO_INCREMENT,
        `userId` int NOT NULL,
        `provider` enum('google','line','telegram') NOT NULL,
        `providerUserId` varchar(255) NOT NULL,
        `email` varchar(320) DEFAULT NULL,
        `displayName` text,
        `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        UNIQUE KEY `auth_identity_provider_user_uq` (`provider`, `providerUserId`),
        UNIQUE KEY `auth_identity_user_provider_uq` (`userId`, `provider`),
        KEY `auth_identity_user_idx` (`userId`),
        CONSTRAINT `auth_identities_userId_users_id_fk`
          FOREIGN KEY (`userId`) REFERENCES `users` (`id`)
          ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);
    console.log("[Migration] Created auth_identities table.");
  } else {
    console.log("[Migration] auth_identities already exists; checking its schema.");
  }

  const [columns] = await connection.execute(
    `SELECT COLUMN_NAME, DATA_TYPE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'auth_identities'`,
    [databaseName]
  );

  const actualColumns = new Map(
    columns.map(column => [column.COLUMN_NAME, column.DATA_TYPE])
  );

  for (const [name, type] of Object.entries(expectedColumns)) {
    if (actualColumns.get(name) !== type) {
      throw new Error(
        `[Migration] auth_identities.${name} is missing or has an unexpected type. Stopped without altering its schema.`
      );
    }
  }

  const [indexRows] = await connection.execute(
    `SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'auth_identities'
     ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
    [databaseName]
  );

  const indexes = new Map();
  for (const row of indexRows) {
    if (!indexes.has(row.INDEX_NAME)) {
      indexes.set(row.INDEX_NAME, {
        unique: row.NON_UNIQUE === 0,
        columns: [],
      });
    }
    indexes.get(row.INDEX_NAME).columns.push(row.COLUMN_NAME);
  }

  for (const expected of expectedIndexes) {
    const namedIndex = indexes.get(expected.name);
    if (namedIndex) {
      if (
        namedIndex.unique !== expected.unique ||
        namedIndex.columns.join(",") !== expected.columns.join(",")
      ) {
        throw new Error(`[Migration] Index ${expected.name} exists with an unexpected definition.`);
      }
      continue;
    }

    const equivalentIndex = [...indexes.values()].some(index =>
      index.unique === expected.unique &&
      index.columns.join(",") === expected.columns.join(",")
    );

    if (!equivalentIndex) {
      const columnsSql = expected.columns.map(column => `\`${column}\``).join(", ");
      const indexSql = expected.unique ? "ADD UNIQUE INDEX" : "ADD INDEX";
      await connection.query(
        `ALTER TABLE `auth_identities` ${indexSql} \`${expected.name}\` (${columnsSql})`
      );
    }
  }

  const [foreignKeys] = await connection.execute(
    `SELECT COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'auth_identities'
       AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [databaseName]
  );

  const userIdForeignKey = foreignKeys.find(key => key.COLUMN_NAME === "userId");
  if (userIdForeignKey) {
    if (
      userIdForeignKey.REFERENCED_TABLE_NAME !== "users" ||
      userIdForeignKey.REFERENCED_COLUMN_NAME !== "id"
    ) {
      throw new Error("[Migration] userId has an unexpected foreign key. No changes were made.");
    }
  } else {
    await connection.query(`
      ALTER TABLE `auth_identities`
      ADD CONSTRAINT `auth_identities_userId_users_id_fk`
      FOREIGN KEY (`userId`) REFERENCES `users` (`id`)
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  console.log("[Migration] auth_identities schema verified successfully.");
} finally {
  await connection.end();
}
