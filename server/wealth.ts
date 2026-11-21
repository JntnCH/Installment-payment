import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { financialAssetSyncOutbox, financialAssets } from "../drizzle/schema";
import { getDb } from "./db";
import { getDashboardStats } from "./ledger";
import { getSheetsBalance } from "./sheetsProxy";

async function enqueueAssetSync(tx: any, ownerId: number, assetId: string, action: "upsert" | "delete") {
  await tx.insert(financialAssetSyncOutbox).values({
    id: randomUUID(), ownerId, assetId, action, status: "pending", attempts: 0, nextRetryAt: new Date(),
  });
}

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
    await db.transaction(async tx => {
      await tx.update(financialAssets).set(values).where(and(eq(financialAssets.id, input.id!), eq(financialAssets.ownerId, ownerId)));
      await enqueueAssetSync(tx, ownerId, input.id!, "upsert");
    });
    const rows = await db.select().from(financialAssets)
      .where(and(eq(financialAssets.id, input.id), eq(financialAssets.ownerId, ownerId))).limit(1);
    return rows[0] ? toAsset(rows[0]) : null;
  }
  const id = randomUUID();
  await db.transaction(async tx => {
    await tx.insert(financialAssets).values({ id, ownerId, ...values });
    await enqueueAssetSync(tx, ownerId, id, "upsert");
  });
  const rows = await db.select().from(financialAssets).where(and(eq(financialAssets.id, id), eq(financialAssets.ownerId, ownerId))).limit(1);
  return rows[0] ? toAsset(rows[0]) : null;
}

export async function deleteFinancialAsset(ownerId: number, id: string) {
  const db = await getDb();
  if (!db) throw new Error("ฐานข้อมูลยังไม่พร้อมใช้งาน");
  await db.transaction(async tx => {
    const rows = await tx.select({ id: financialAssets.id }).from(financialAssets)
      .where(and(eq(financialAssets.id, id), eq(financialAssets.ownerId, ownerId))).limit(1);
    if (!rows[0]) throw new Error("ไม่พบรายการทรัพย์สิน");
    await tx.delete(financialAssets).where(and(eq(financialAssets.id, id), eq(financialAssets.ownerId, ownerId)));
    await enqueueAssetSync(tx, ownerId, id, "delete");
  });
  return { success: true };
}

export async function getFinancialHealth(ownerId: number) {
  const [assets, debtStats, sheetsBalance] = await Promise.all([
    listFinancialAssets(ownerId),
    getDashboardStats(ownerId),
    getSheetsBalance(ownerId).catch(() => null),
  ]);

  const sheetAccounts = sheetsBalance?.accountBalances ?? [];
  const isCashAccount = (name: string) => {
    const normalized = name.trim().toLowerCase();
    return normalized === "เงินสด" || normalized === "cash";
  };
  const sheetCash = sheetAccounts
    .filter(account => isCashAccount(account.name))
    .reduce((sum, account) => sum + account.amount, 0);
  const sheetBank = sheetAccounts
    .filter(account => !isCashAccount(account.name))
    .reduce((sum, account) => sum + account.amount, 0);
  const hasSheetBalances = sheetsBalance !== null;

  // Google Sheets is the source of truth for cash and bank balances.
  // Exclude manually entered cash/bank assets when live sheet balances are available.
  const nonLiquidAssets = assets
    .filter(item => item.category !== "cash" && item.category !== "bank")
    .reduce((sum, item) => sum + item.amount, 0);
  const manualLiquidAssets = assets
    .filter(item => item.category === "cash" || item.category === "bank")
    .reduce((sum, item) => sum + item.amount, 0);
  const cashAssets = hasSheetBalances ? sheetCash + sheetBank : manualLiquidAssets;
  const totalAssets = nonLiquidAssets + cashAssets;
  const totalLiabilities = Math.max(0, debtStats.creditorOutstanding || 0);
  const netWorth = totalAssets - totalLiabilities;
  const debtToAsset = totalAssets > 0 ? totalLiabilities / totalAssets : null;
  const debtScore = debtToAsset === null ? 0 : Math.max(0, 60 * (1 - Math.min(1, debtToAsset)));
  const liquidityScore = totalAssets > 0 ? 40 * Math.min(1, cashAssets / totalAssets) : 0;
  const score = Math.round(debtScore + liquidityScore);
  return {
    assets,
    sheetBalances: {
      available: hasSheetBalances,
      cash: sheetCash,
      bank: sheetBank,
      accounts: sheetAccounts,
    },
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
