import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { monthlyBillPayments, monthlyBills } from "../drizzle/schema";
import { getDb } from "./db";
import { uploadReceiptToGoogleDrive } from "./googleDrive";
import { incomeExpensesApiRequest } from "./incomeExpensesAdmin";

export type MonthlyBillInput = {
  billName: string;
  amount: number;
  dueDate: string;
  status?: "pending" | "paid";
  note?: string;
};

export async function listMonthlyBills(ownerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select().from(monthlyBills)
    .where(and(eq(monthlyBills.ownerId, ownerId), isNull(monthlyBills.deletedAt)))
    .orderBy(asc(monthlyBills.dueDate), desc(monthlyBills.createdAt));
}

export async function listMonthlyBillPayments(ownerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select().from(monthlyBillPayments)
    .where(eq(monthlyBillPayments.ownerId, ownerId))
    .orderBy(desc(monthlyBillPayments.paidAt));
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
  });
  const rows = await db.select().from(monthlyBills).where(and(eq(monthlyBills.ownerId, ownerId), eq(monthlyBills.id, id))).limit(1);
  return rows[0];
}

export async function updateMonthlyBill(ownerId: number, id: string, input: MonthlyBillInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.transaction(async tx => {
    const rows = await tx.select().from(monthlyBills)
      .where(and(eq(monthlyBills.ownerId, ownerId), eq(monthlyBills.id, id), isNull(monthlyBills.deletedAt))).limit(1);
    const existing = rows[0];
    if (!existing) throw new Error("ไม่พบบิลรายเดือน");
    // Editing bill details must never erase or reset the actual payment record.
    await tx.update(monthlyBills).set({
      billName: input.billName.trim(), amount: input.amount.toFixed(2), dueDate: input.dueDate,
      status: existing.status, note: input.note?.trim() || null,
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
  const bill = rows[0];
  if (!bill) throw new Error("ไม่พบบิลรายเดือน");
  if (input.receiptKey && !/^[a-zA-Z0-9_-]{10,}$/.test(input.receiptKey)) throw new Error("ไฟล์หลักฐานไม่ถูกต้อง");

  const paidAt = new Date(input.paidAt);
  if (Number.isNaN(paidAt.getTime())) throw new Error("วันที่ชำระไม่ถูกต้อง");
  const monthKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit",
  }).format(paidAt);
  const paidDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(paidAt);
  const transactionId = `monthly-bill:${bill.id}:${monthKey}`;

  await db.transaction(async tx => {
    await tx.insert(monthlyBillPayments).values({
      id: crypto.randomUUID(),
      ownerId,
      billId: bill.id,
      monthKey,
      paidAmount: input.paidAmount.toFixed(2),
      paidAt,
      receiptKey: input.receiptKey ?? null,
      transactionId,
    }).onDuplicateKeyUpdate({
      set: {
        paidAmount: input.paidAmount.toFixed(2),
        paidAt,
        receiptKey: input.receiptKey ?? null,
        transactionId,
        updatedAt: new Date(),
      },
    });
    await tx.update(monthlyBills).set({
      status: "paid",
      paidAmount: input.paidAmount.toFixed(2),
      paidAt,
      receiptKey: input.receiptKey ?? null,
    }).where(and(eq(monthlyBills.ownerId, ownerId), eq(monthlyBills.id, input.id)));
  });

  try {
    await incomeExpensesApiRequest("POST", "/api/transactions", {
      transactionId,
      type: "expense",
      item: bill.billName,
      amount: input.paidAmount,
      category: "บิลรายเดือน",
      account: "เงินสด",
      recorderName: "Installment Web",
      channel: "Installment Web",
      date: paidDate,
      receiptUrl: input.receiptKey ? `https://drive.google.com/open?id=${encodeURIComponent(input.receiptKey)}` : "",
      note: `ชำระบิลรายเดือน | Bill ID: ${bill.id} | เดือน: ${monthKey}`,
    });
  } catch (error) {
    console.error("[Monthly bill transaction sync] Failed:", error);
    throw new Error("บันทึกยอดชำระแล้ว แต่ส่งรายการไปชีตธุรกรรมไม่สำเร็จ สามารถกดยืนยันซ้ำเพื่อส่งข้อมูลอีกครั้งได้");
  }

  const updated = await db.select().from(monthlyBills)
    .where(and(eq(monthlyBills.ownerId, ownerId), eq(monthlyBills.id, input.id))).limit(1);
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
  });
  return { success: true };
}
