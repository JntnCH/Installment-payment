import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("[Migration] DATABASE_URL is required.");

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
  { name: "auth_identity_provider_user_uq", columns: ["provider", "providerUserId"], unique: true },
  { name: "auth_identity_user_provider_uq", columns: ["userId", "provider"], unique: true },
  { name: "auth_identity_user_idx", columns: ["userId"], unique: false },
];

try {
  const [[databaseRow]] = await connection.query("SELECT DATABASE() AS databaseName");
  const databaseName = databaseRow.databaseName;
  if (!databaseName) throw new Error("[Migration] DATABASE_URL does not select a database.");

  const [userTables] = await connection.execute(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'",
    [databaseName]
  );
  if (userTables.length === 0) {
    throw new Error("[Migration] Required users table was not found. No changes were made.");
  }

  const [existingTables] = await connection.execute(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'auth_identities'",
    [databaseName]
  );

  if (existingTables.length === 0) {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS auth_identities (
        id int NOT NULL AUTO_INCREMENT,
        userId int NOT NULL,
        provider enum('google','line','telegram') NOT NULL,
        providerUserId varchar(255) NOT NULL,
        email varchar(320) DEFAULT NULL,
        displayName text,
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY auth_identity_provider_user_uq (provider, providerUserId),
        UNIQUE KEY auth_identity_user_provider_uq (userId, provider),
        KEY auth_identity_user_idx (userId),
        CONSTRAINT auth_identities_userId_users_id_fk
          FOREIGN KEY (userId) REFERENCES users (id)
          ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);
    console.log("[Migration] Created auth_identities table.");
  } else {
    console.log("[Migration] auth_identities already exists; checking its schema.");
  }

  const [columns] = await connection.execute(
    "SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'auth_identities'",
    [databaseName]
  );
  const actualColumns = new Map(columns.map(column => [column.COLUMN_NAME, column.DATA_TYPE]));

  for (const [name, type] of Object.entries(expectedColumns)) {
    if (actualColumns.get(name) !== type) {
      throw new Error(`[Migration] auth_identities.${name} is missing or has an unexpected type. Stopped without altering its schema.`);
    }
  }

  const [indexRows] = await connection.execute(
    "SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'auth_identities' ORDER BY INDEX_NAME, SEQ_IN_INDEX",
    [databaseName]
  );

  const indexes = new Map();
  for (const row of indexRows) {
    if (!indexes.has(row.INDEX_NAME)) {
      indexes.set(row.INDEX_NAME, { unique: row.NON_UNIQUE === 0, columns: [] });
    }
    indexes.get(row.INDEX_NAME).columns.push(row.COLUMN_NAME);
  }

  for (const expected of expectedIndexes) {
    const namedIndex = indexes.get(expected.name);
    if (namedIndex) {
      if (namedIndex.unique !== expected.unique || namedIndex.columns.join(",") !== expected.columns.join(",")) {
        throw new Error(`[Migration] Index ${expected.name} exists with an unexpected definition.`);
      }
      continue;
    }

    const equivalentIndex = [...indexes.values()].some(index =>
      index.unique === expected.unique && index.columns.join(",") === expected.columns.join(",")
    );

    if (!equivalentIndex) {
      const columnsSql = expected.columns.join(", ");
      const indexSql = expected.unique ? "ADD UNIQUE INDEX" : "ADD INDEX";
      await connection.query(
        `ALTER TABLE auth_identities ${indexSql} ${expected.name} (${columnsSql})`
      );
    }
  }

  const [foreignKeys] = await connection.execute(
    "SELECT COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'auth_identities' AND REFERENCED_TABLE_NAME IS NOT NULL",
    [databaseName]
  );

  const userIdForeignKey = foreignKeys.find(key => key.COLUMN_NAME === "userId");
  if (userIdForeignKey) {
    if (userIdForeignKey.REFERENCED_TABLE_NAME !== "users" || userIdForeignKey.REFERENCED_COLUMN_NAME !== "id") {
      throw new Error("[Migration] userId has an unexpected foreign key. Stopped.");
    }
  } else {
    await connection.query(`
      ALTER TABLE auth_identities
      ADD CONSTRAINT auth_identities_userId_users_id_fk
      FOREIGN KEY (userId) REFERENCES users (id)
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  console.log("[Migration] auth_identities schema verified successfully.");

  const [partyTables] = await connection.execute(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'ledger_parties'",
    [databaseName]
  );

  if (partyTables.length === 0) {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS ledger_parties (
        id varchar(64) NOT NULL,
        ownerId int NOT NULL,
        displayName varchar(160) NOT NULL,
        role enum('debtor','creditor') NOT NULL,
        phone varchar(32) DEFAULT NULL,
        note text,
        status enum('active','archived') NOT NULL DEFAULT 'active',
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY ledger_party_owner_role_name_uq (ownerId, role, displayName),
        KEY ledger_party_owner_role_idx (ownerId, role),
        CONSTRAINT ledger_parties_ownerId_users_id_fk
          FOREIGN KEY (ownerId) REFERENCES users (id)
          ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);
    console.log("[Migration] Created ledger_parties table.");
  } else {
    console.log("[Migration] ledger_parties already exists; checking its schema.");
  }

  const [partyColumns] = await connection.execute(
    "SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'ledger_parties'",
    [databaseName]
  );
  const actualPartyColumns = new Map(partyColumns.map(column => [column.COLUMN_NAME, column.DATA_TYPE]));
  const expectedPartyColumns = {
    id: "varchar",
    ownerId: "int",
    displayName: "varchar",
    role: "enum",
    phone: "varchar",
    note: "text",
    status: "enum",
    createdAt: "timestamp",
    updatedAt: "timestamp",
  };

  for (const [name, type] of Object.entries(expectedPartyColumns)) {
    if (actualPartyColumns.get(name) !== type) {
      throw new Error(`[Migration] ledger_parties.${name} is missing or has an unexpected type. Stopped without altering existing data.`);
    }
  }

  const [partyIndexes] = await connection.execute(
    "SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'ledger_parties' ORDER BY INDEX_NAME, SEQ_IN_INDEX",
    [databaseName]
  );
  const partyIndexMap = new Map();
  for (const row of partyIndexes) {
    if (!partyIndexMap.has(row.INDEX_NAME)) {
      partyIndexMap.set(row.INDEX_NAME, { unique: row.NON_UNIQUE === 0, columns: [] });
    }
    partyIndexMap.get(row.INDEX_NAME).columns.push(row.COLUMN_NAME);
  }

  const expectedPartyIndexes = [
    { name: "ledger_party_owner_role_name_uq", columns: ["ownerId", "role", "displayName"], unique: true },
    { name: "ledger_party_owner_role_idx", columns: ["ownerId", "role"], unique: false },
  ];

  for (const expected of expectedPartyIndexes) {
    const existing = partyIndexMap.get(expected.name);
    if (existing) {
      if (existing.unique !== expected.unique || existing.columns.join(",") !== expected.columns.join(",")) {
        throw new Error(`[Migration] Index ${expected.name} has an unexpected definition. Stopped.`);
      }
      continue;
    }
    const equivalent = [...partyIndexMap.values()].some(index =>
      index.unique === expected.unique && index.columns.join(",") === expected.columns.join(",")
    );
    if (!equivalent) {
      const columnsSql = expected.columns.join(", ");
      const indexSql = expected.unique ? "ADD UNIQUE INDEX" : "ADD INDEX";
      await connection.query(`ALTER TABLE ledger_parties ${indexSql} ${expected.name} (${columnsSql})`);
    }
  }

  const [partyForeignKeys] = await connection.execute(
    "SELECT COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'ledger_parties' AND REFERENCED_TABLE_NAME IS NOT NULL",
    [databaseName]
  );
  const ownerForeignKey = partyForeignKeys.find(key => key.COLUMN_NAME === "ownerId");
  if (ownerForeignKey) {
    if (ownerForeignKey.REFERENCED_TABLE_NAME !== "users" || ownerForeignKey.REFERENCED_COLUMN_NAME !== "id") {
      throw new Error("[Migration] ledger_parties.ownerId has an unexpected foreign key. Stopped.");
    }
  } else {
    await connection.query(`
      ALTER TABLE ledger_parties
      ADD CONSTRAINT ledger_parties_ownerId_users_id_fk
      FOREIGN KEY (ownerId) REFERENCES users (id)
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  console.log("[Migration] ledger_parties schema verified successfully.");
} finally {
  await connection.end();
}
