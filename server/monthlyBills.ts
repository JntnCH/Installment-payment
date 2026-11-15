import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { monthlyBillSyncOutbox, monthlyBills } from "../drizzle/schema";
import { getDb } from "./db";

export type MonthlyBillInput = {
  billName: string;
  amount: number;
  dueDate: string;
  status?: "pending" | "paid";
  note?: string;
};

async function enqueue(tx: any, ownerId: number, billId: string, action: "upsert" | "delete") {
  await tx.insert(monthlyBillSyncOutbox).values({
    id: crypto.randomUUID(),
    ownerId,
    billId,
    action,
    status: "pending",
    attempts: 0,
    nextRetryAt: new Date(),
  });
}

export async function listMonthlyBills(ownerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select().from(monthlyBills)
    .where(and(eq(monthlyBills.ownerId, ownerId), isNull(monthlyBills.deletedAt)))
    .orderBy(asc(monthlyBills.dueDate), desc(monthlyBills.createdAt));
}

export async function createMonthlyBill(ownerId: number, input: MonthlyBillInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const id = crypto.randomUUID();
  await db.transaction(async tx => {
    await tx.insert(monthlyBills).values({
      id, ownerId, billName: input.billName.trim(), amount: input.amount.toFixed(2),
      dueDate: input.dueDate, status: input.status ?? "pending", note: input.note?.trim() || null,
    });
    await enqueue(tx, ownerId, id, "upsert");
  });
  const rows = await db.select().from(monthlyBills).where(and(eq(monthlyBills.ownerId, ownerId), eq(monthlyBills.id, id))).limit(1);
  return rows[0];
}

export async function updateMonthlyBill(ownerId: number, id: string, input: MonthlyBillInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.transaction(async tx => {
    const rows = await tx.select({ id: monthlyBills.id }).from(monthlyBills)
      .where(and(eq(monthlyBills.ownerId, ownerId), eq(monthlyBills.id, id), isNull(monthlyBills.deletedAt))).limit(1);
    if (!rows[0]) throw new Error("ไม่พบบิลรายเดือน");
    await tx.update(monthlyBills).set({
      billName: input.billName.trim(), amount: input.amount.toFixed(2), dueDate: input.dueDate,
      status: input.status ?? "pending", note: input.note?.trim() || null,
    }).where(and(eq(monthlyBills.ownerId, ownerId), eq(monthlyBills.id, id)));
    await enqueue(tx, ownerId, id, "upsert");
  });
  const rows = await db.select().from(monthlyBills).where(and(eq(monthlyBills.ownerId, ownerId), eq(monthlyBills.id, id))).limit(1);
  return rows[0];
}

export async function deleteMonthlyBill(ownerId: number, id: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.transaction(async tx => {
    const rows = await tx.select({ id: monthlyBills.id }).from(monthlyBills)
      .where(and(eq(monthlyBills.ownerId, ownerId), eq(monthlyBills.id, id), isNull(monthlyBills.deletedAt))).limit(1);
    if (!rows[0]) throw new Error("ไม่พบบิลรายเดือน");
    await tx.update(monthlyBills).set({ deletedAt: new Date() })
      .where(and(eq(monthlyBills.ownerId, ownerId), eq(monthlyBills.id, id)));
    await enqueue(tx, ownerId, id, "delete");
  });
  return { success: true };
}
