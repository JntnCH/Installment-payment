import { date, decimal, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const parties = mysqlTable("ledger_parties", {
  id: varchar("id", { length: 64 }).primaryKey(),
  ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
  displayName: varchar("displayName", { length: 160 }).notNull(),
  role: mysqlEnum("role", ["debtor", "creditor"]).notNull(),
  phone: varchar("phone", { length: 32 }),
  note: text("note"),
  status: mysqlEnum("status", ["active", "archived"]).notNull().default("active"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  ownerRoleIdx: index("ledger_party_owner_role_idx").on(table.ownerId, table.role),
  ownerRoleNameUnique: uniqueIndex("ledger_party_owner_role_name_uq").on(table.ownerId, table.role, table.displayName),
}));

export const contracts = mysqlTable("ledger_contracts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
  partyId: varchar("partyId", { length: 64 }).notNull().references(() => parties.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  principal: decimal("principal", { precision: 15, scale: 2 }).notNull(),
  interestRate: decimal("interestRate", { precision: 9, scale: 4 }).notNull().default("0.0000"),
  installmentCount: int("installmentCount").notNull(),
  startDate: date("startDate", { mode: "string" }).notNull(),
  status: mysqlEnum("status", ["active", "completed", "cancelled"]).notNull().default("active"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  ownerPartyIdx: index("ledger_contract_owner_party_idx").on(table.ownerId, table.partyId),
  ownerStatusIdx: index("ledger_contract_owner_status_idx").on(table.ownerId, table.status),
}));

export const contractPaymentSchedules = mysqlTable("ledger_payment_schedules", {
  id: varchar("id", { length: 64 }).primaryKey(),
  ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
  partyId: varchar("partyId", { length: 64 }).notNull().references(() => parties.id, { onDelete: "cascade" }),
  contractId: varchar("contractId", { length: 64 }).notNull().references(() => contracts.id, { onDelete: "cascade" }),
  installmentNo: int("installmentNo").notNull(),
  dueDate: date("dueDate", { mode: "string" }).notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  paidAmount: decimal("paidAmount", { precision: 15, scale: 2 }).notNull().default("0.00"),
  status: mysqlEnum("status", ["pending", "paid", "waived"]).notNull().default("pending"),
  paidAt: timestamp("paidAt"),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  contractDueIdx: index("ledger_schedule_contract_due_idx").on(table.contractId, table.dueDate),
  ownerDueIdx: index("ledger_schedule_owner_due_idx").on(table.ownerId, table.dueDate),
  contractInstallmentUnique: uniqueIndex("ledger_schedule_contract_installment_uq").on(table.contractId, table.installmentNo),
}));

export const ledgerTransactions = mysqlTable("ledger_transactions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
  partyId: varchar("partyId", { length: 64 }).notNull().references(() => parties.id, { onDelete: "cascade" }),
  contractId: varchar("contractId", { length: 64 }).references(() => contracts.id, { onDelete: "set null" }),
  scheduleId: varchar("scheduleId", { length: 64 }).references(() => contractPaymentSchedules.id, { onDelete: "set null" }),
  type: mysqlEnum("type", ["disbursement", "payment", "adjustment"]).notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  occurredAt: timestamp("occurredAt").notNull(),
  source: varchar("source", { length: 64 }).notNull().default("manual"),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  ownerOccurredIdx: index("ledger_transaction_owner_occurred_idx").on(table.ownerId, table.occurredAt),
  contractOccurredIdx: index("ledger_transaction_contract_occurred_idx").on(table.contractId, table.occurredAt),
  partyOccurredIdx: index("ledger_transaction_party_occurred_idx").on(table.partyId, table.occurredAt),
}));
