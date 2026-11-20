import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { financialAssets } from "../drizzle/schema";
import { getDb } from "./db";
import { getDashboardStats } from "./ledger";

const toAsset = (row: typeof financialAssets.$inferSelect) => ({
  id: row.id,
  category: row.category,
  name: row.name,
  amount: Number(row.amount),
  note: row.note ?? "",
  updatedAt: row.updatedAt.toISOString(),
});

export async function listFinancialAssets(ownerId: number) {
  const db = await getDb();
  if (!db) throw new Error("ฐานข้อมูลยังไม่พร้อมใช้งาน");
  const rows = await db.select().from(financialAssets)
    .where(eq(financialAssets.ownerId, ownerId))
    .orderBy(asc(financialAssets.category), asc(financialAssets.name));
  return rows.map(toAsset);
}

export async function saveFinancialAsset(ownerId: number, input: {
  id?: string;
  category: "cash" | "bank" | "vehicle" | "property" | "gold" | "investment" | "other";
  name: string;
  amount: number;
  note?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("ฐานข้อมูลยังไม่พร้อมใช้งาน");
  const values = {
    category: input.category,
    name: input.name.trim(),
    amount: input.amount.toFixed(2),
    note: input.note?.trim() || null,
  };
  if (input.id) {
    const existing = await db.select({ id: financialAssets.id }).from(financialAssets)
      .where(and(eq(financialAssets.id, input.id), eq(financialAssets.ownerId, ownerId))).limit(1);
    if (!existing[0]) throw new Error("ไม่พบรายการทรัพย์สิน");
    await db.update(financialAssets).set(values).where(and(eq(financialAssets.id, input.id), eq(financialAssets.ownerId, ownerId)));
    const rows = await db.select().from(financialAssets)
      .where(and(eq(financialAssets.id, input.id), eq(financialAssets.ownerId, ownerId))).limit(1);
    return rows[0] ? toAsset(rows[0]) : null;
  }
  const id = randomUUID();
  await db.insert(financialAssets).values({ id, ownerId, ...values });
  const rows = await db.select().from(financialAssets).where(eq(financialAssets.id, id)).limit(1);
  return rows[0] ? toAsset(rows[0]) : null;
}

export async function deleteFinancialAsset(ownerId: number, id: string) {
  const db = await getDb();
  if (!db) throw new Error("ฐานข้อมูลยังไม่พร้อมใช้งาน");
  await db.delete(financialAssets).where(and(eq(financialAssets.id, id), eq(financialAssets.ownerId, ownerId)));
  return { success: true };
}

export async function getFinancialHealth(ownerId: number) {
  const [assets, debtStats] = await Promise.all([
    listFinancialAssets(ownerId),
    getDashboardStats(ownerId),
  ]);
  const totalAssets = assets.reduce((sum, item) => sum + item.amount, 0);
  const cashAssets = assets.filter(item => item.category === "cash" || item.category === "bank")
    .reduce((sum, item) => sum + item.amount, 0);
  const totalLiabilities = Math.max(0, debtStats.creditorOutstanding || 0);
  const netWorth = totalAssets - totalLiabilities;
  const debtToAsset = totalAssets > 0 ? totalLiabilities / totalAssets : null;
  const debtScore = debtToAsset === null ? 0 : Math.max(0, 60 * (1 - Math.min(1, debtToAsset)));
  const liquidityScore = totalAssets > 0 ? 40 * Math.min(1, cashAssets / totalAssets) : 0;
  const score = Math.round(debtScore + liquidityScore);
  return {
    assets,
    totalAssets,
    cashAssets,
    totalLiabilities,
    netWorth,
    debtToAsset,
    score,
    scoreStatus: totalAssets > 0 ? "available" as const : "insufficient-data" as const,
    assetCount: assets.length,
  };
}
