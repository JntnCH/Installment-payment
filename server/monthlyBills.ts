import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { monthlyBillSyncOutbox, monthlyBills } from "../drizzle/schema";
import { getDb } from "./db";
import { uploadReceiptToGoogleDrive } from "./googleDrive";

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

export async function uploadMonthlyBillReceipt(ownerId: number, billId: string, paidDate: string, fileName: string, mimeType: string, base64: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select({ id: monthlyBills.id }).from(monthlyBills).where(and(
    eq(monthlyBills.ownerId, ownerId), eq(monthlyBills.id, billId), isNull(monthlyBills.deletedAt),
  )).limit(1);
  if (!rows[0]) throw new Error("ไม่พบบิลรายเดือน");
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "receipt";
  const data = Buffer.from(base64, "base64");
  if (!data.length || data.length > 8 * 1024 * 1024) throw new Error("ไฟล์ต้องมีขนาดไม่เกิน 8 MB");
  const uploaded = await uploadReceiptToGoogleDrive(ownerId, paidDate, safeName, mimeType, data);
  return { receiptKey: uploaded.fileId };
}

export async function recordMonthlyBillPayment(ownerId: number, input: { id: string; paidAmount: number; paidAt: string; receiptKey?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(monthlyBills).where(and(
    eq(monthlyBills.ownerId, ownerId), eq(monthlyBills.id, input.id), isNull(monthlyBills.deletedAt),
  )).limit(1);
  if (!rows[0]) throw new Error("ไม่พบบิลรายเดือน");
  if (input.receiptKey && !/^[a-zA-Z0-9_-]{10,}$/.test(input.receiptKey)) throw new Error("ไฟล์หลักฐานไม่ถูกต้อง");
  await db.transaction(async tx => {
    await tx.update(monthlyBills).set({ status: "paid", paidAmount: input.paidAmount.toFixed(2), paidAt: new Date(input.paidAt), receiptKey: input.receiptKey ?? null })
      .where(and(eq(monthlyBills.ownerId, ownerId), eq(monthlyBills.id, input.id)));
    await enqueue(tx, ownerId, input.id, "upsert");
  });
  const updated = await db.select().from(monthlyBills).where(and(eq(monthlyBills.ownerId, ownerId), eq(monthlyBills.id, input.id))).limit(1);
  return updated[0];
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
