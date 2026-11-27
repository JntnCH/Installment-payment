import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import axios from "axios";
import { and, asc, eq, lte } from "drizzle-orm";
import { financialAssetSyncOutbox, financialAssets, googleSheetsConnections } from "../drizzle/schema";
import { getDb } from "./db";
import { ENV } from "./_core/env";

const GOOGLE_API = "https://sheets.googleapis.com/v4";

function encryptionKey(): Buffer {
  const value = ENV.googleTokenEncryptionKey;
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error("ต้องตั้งค่า GOOGLE_TOKEN_ENCRYPTION_KEY เป็น Hex 64 ตัวอักษร (32 bytes)");
  }
  return Buffer.from(value, "hex");
}

function encrypt(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("hex"), cipher.getAuthTag().toString("hex"), encrypted.toString("hex")].join(":");
}

function decrypt(value: string): string {
  const [ivHex, tagHex, encryptedHex] = value.split(":");
  if (!ivHex || !tagHex || !encryptedHex) throw new Error("รูปแบบ Google refresh token ไม่ถูกต้อง");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedHex, "hex")), decipher.final()]).toString("utf8");
}

export async function saveGoogleRefreshToken(userId: number, refreshToken: string, email?: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(googleSheetsConnections).where(eq(googleSheetsConnections.userId, userId)).limit(1);
  if (rows[0]) {
    await db.update(googleSheetsConnections).set({
      refreshTokenEncrypted: encrypt(refreshToken),
      connectedEmail: email ?? rows[0].connectedEmail,
    }).where(eq(googleSheetsConnections.userId, userId));
  } else {
    await db.insert(googleSheetsConnections).values({
      userId,
      refreshTokenEncrypted: encrypt(refreshToken),
      connectedEmail: email ?? null,
      spreadsheetId: null,
    });
  }
}

export async function getGoogleSheetsStatus(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select({
    spreadsheetId: googleSheetsConnections.spreadsheetId,
    connectedEmail: googleSheetsConnections.connectedEmail,
  }).from(googleSheetsConnections).where(eq(googleSheetsConnections.userId, userId)).limit(1);
  return {
    connected: Boolean(rows[0]),
    spreadsheetId: rows[0]?.spreadsheetId || "",
    connectedEmail: rows[0]?.connectedEmail ?? null,
    configured: Boolean(rows[0]?.spreadsheetId),
  };
}

export async function configureGoogleSpreadsheet(userId: number, spreadsheetId: string) {
  const normalized = spreadsheetId.trim();
  if (!/^[a-zA-Z0-9_-]{10,}$/.test(normalized)) throw new Error("Spreadsheet ID ไม่ถูกต้อง");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select({ userId: googleSheetsConnections.userId })
    .from(googleSheetsConnections).where(eq(googleSheetsConnections.userId, userId)).limit(1);
  if (!rows[0]) throw new Error("กรุณาเชื่อมต่อ Google Sheets ก่อน");
  const currentToken = await getGoogleDriveAccessToken(userId);
  await axios.get(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(normalized)}?fields=spreadsheetId`, {
    headers: { Authorization: `Bearer ${currentToken}` },
    timeout: 15000,
  });
  await db.update(googleSheetsConnections).set({ spreadsheetId: normalized })
    .where(eq(googleSheetsConnections.userId, userId));
  return getGoogleSheetsStatus(userId);
}

async function accessToken(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(googleSheetsConnections)
    .where(eq(googleSheetsConnections.userId, userId)).limit(1);
  const connection = rows[0];
  if (!connection) throw new Error("ยังไม่ได้เชื่อมต่อ Google Sheets");
  const spreadsheetId = connection.spreadsheetId;
  if (!spreadsheetId) throw new Error("กรุณาระบุ Spreadsheet ID ของบัญชี Google ที่เชื่อมต่อ");
  const response = await axios.post("https://oauth2.googleapis.com/token", new URLSearchParams({
    client_id: ENV.googleClientId,
    client_secret: ENV.googleClientSecret,
    refresh_token: decrypt(connection.refreshTokenEncrypted),
    grant_type: "refresh_token",
  }).toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 15000,
  });
  const token = response.data?.access_token as string | undefined;
  if (!token) throw new Error("Google ไม่ส่ง access token กลับมา");
  return { token, spreadsheetId };
}

export async function getGoogleDriveAccessToken(userId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(googleSheetsConnections)
    .where(eq(googleSheetsConnections.userId, userId)).limit(1);
  const connection = rows[0];
  if (!connection) throw new Error("กรุณาเชื่อมต่อบัญชี Google เดียวกับ Google Sheets ก่อน");
  const response = await axios.post("https://oauth2.googleapis.com/token", new URLSearchParams({
    client_id: ENV.googleClientId,
    client_secret: ENV.googleClientSecret,
    refresh_token: decrypt(connection.refreshTokenEncrypted),
    grant_type: "refresh_token",
  }).toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 15000,
  });
  const token = response.data?.access_token as string | undefined;
  if (!token) throw new Error("Google ไม่ส่ง access token กลับมา");
  return token;
}

export async function getGoogleSheetsCredentials(userId: number): Promise<{ accessToken: string; spreadsheetId: string }> {
  const credentials = await accessToken(userId);
  return { accessToken: credentials.token, spreadsheetId: credentials.spreadsheetId };
}

async function googleRequest<T>(token: string, method: "GET" | "POST" | "PUT", url: string, data?: unknown) {
  const response = await axios.request<T>({
    method, url, data,
    headers: { Authorization: `Bearer ${token}`, ...(data ? { "Content-Type": "application/json" } : {}) },
    timeout: 20000,
  });
  return response.data;
}

const ASSET_TAB_NAME = "ทรัพย์สิน";
const ASSET_HEADERS = ["Asset ID", "ประเภท", "ชื่อทรัพย์สิน", "มูลค่าปัจจุบัน", "หมายเหตุ", "แก้ไขล่าสุด"];

async function syncFinancialAsset(token: string, spreadsheetId: string, assetId: string, action: "upsert" | "delete", userId: number) {
  const meta = await googleRequest<{ sheets?: Array<{ properties?: { title?: string } }> }>(
    token, "GET", `${GOOGLE_API}/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties.title`,
  );
  if (!(meta.sheets ?? []).some(sheet => sheet.properties?.title === ASSET_TAB_NAME)) {
    await googleRequest(token, "POST", `${GOOGLE_API}/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
      requests: [{ addSheet: { properties: { title: ASSET_TAB_NAME } } }],
    });
  }
  const headerRange = encodeURIComponent(`'${ASSET_TAB_NAME}'!A1:F1`);
  const header = await googleRequest<{ values?: unknown[][] }>(
    token, "GET", `${GOOGLE_API}/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${headerRange}`,
  );
  if (!header.values?.length || (header.values[0]?.length ?? 0) < ASSET_HEADERS.length) {
    await googleRequest(token, "PUT",
      `${GOOGLE_API}/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${headerRange}?valueInputOption=RAW`,
      { values: [ASSET_HEADERS] },
    );
  }
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(financialAssets).where(and(
    eq(financialAssets.ownerId, userId), eq(financialAssets.id, assetId),
  )).limit(1);
  const asset = rows[0];
  const idRange = encodeURIComponent(`'${ASSET_TAB_NAME}'!A2:A`);
  const existing = await googleRequest<{ values?: string[][] }>(
    token, "GET", `${GOOGLE_API}/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${idRange}`,
  );
  const index = (existing.values ?? []).findIndex(row => row[0] === assetId);
  if (action === "delete" || !asset) {
    if (index >= 0) {
      const rowNumber = index + 2;
      const range = encodeURIComponent(`'${ASSET_TAB_NAME}'!A${rowNumber}:F${rowNumber}`);
      await googleRequest(token, "POST",
        `${GOOGLE_API}/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}:clear`, {},
      );
    }
    return;
  }
  const categoryLabels: Record<string, string> = {
    cash: "เงินสด", bank: "เงินฝากธนาคาร", vehicle: "รถยนต์ / รถจักรยานยนต์",
    property: "บ้าน / ที่ดิน", gold: "ทองคำ", investment: "หุ้น / กองทุน / การลงทุน", other: "ทรัพย์สินอื่น ๆ",
  };
  const values = [[asset.id, categoryLabels[asset.category] ?? asset.category, asset.name, Number(asset.amount), asset.note ?? "", asset.updatedAt.toISOString()]];
  if (index >= 0) {
    const rowNumber = index + 2;
    const range = encodeURIComponent(`'${ASSET_TAB_NAME}'!A${rowNumber}:F${rowNumber}`);
    await googleRequest(token, "PUT",
      `${GOOGLE_API}/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}?valueInputOption=USER_ENTERED`,
      { values },
    );
  } else {
    const range = encodeURIComponent(`'${ASSET_TAB_NAME}'!A:F`);
    await googleRequest(token, "POST",
      `${GOOGLE_API}/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      { values },
    );
  }
}

let assetQueueRunning = false;
async function processFinancialAssetSyncQueue() {
  if (assetQueueRunning) return;
  assetQueueRunning = true;
  try {
    const db = await getDb();
    if (!db) return;
    const pending = await db.select().from(financialAssetSyncOutbox)
      .where(and(eq(financialAssetSyncOutbox.status, "pending"), lte(financialAssetSyncOutbox.nextRetryAt, new Date())))
      .orderBy(asc(financialAssetSyncOutbox.createdAt)).limit(20);
    for (const job of pending) {
      const claim = await db.update(financialAssetSyncOutbox).set({ status: "processing" })
        .where(and(eq(financialAssetSyncOutbox.id, job.id), eq(financialAssetSyncOutbox.status, "pending")));
      const affectedRows = Array.isArray(claim)
        ? Number((claim[0] as { affectedRows?: number })?.affectedRows)
        : Number((claim as unknown as { affectedRows?: number })?.affectedRows);
      if (Number.isFinite(affectedRows) && affectedRows === 0) continue;
      try {
        const credentials = await accessToken(job.ownerId);
        await syncFinancialAsset(credentials.token, credentials.spreadsheetId, job.assetId, job.action, job.ownerId);
        await db.update(financialAssetSyncOutbox).set({ status: "done", lastError: null })
          .where(eq(financialAssetSyncOutbox.id, job.id));
      } catch (error) {
        const attempts = job.attempts + 1;
        const delayMinutes = Math.min(360, 2 ** Math.min(attempts, 8));
        await db.update(financialAssetSyncOutbox).set({
          status: "pending", attempts,
          nextRetryAt: new Date(Date.now() + delayMinutes * 60_000),
          lastError: (error instanceof Error ? error.message : String(error)).slice(0, 2000),
        }).where(eq(financialAssetSyncOutbox.id, job.id));
        console.error("[Financial asset sync] Retry scheduled:", job.id, error);
      }
    }
  } finally {
    assetQueueRunning = false;
  }
}

export async function startMonthlyBillSyncWorker() {
  const db = await getDb();
  if (!db) {
    console.warn("[Google Sheets sync] Database unavailable; worker not started");
    return;
  }
  // Monthly bills are recorded in the existing transaction ledger. Do not create
  // or maintain a separate "บิลรายเดือน" Google Sheets tab.
  await db.update(financialAssetSyncOutbox).set({ status: "pending" })
    .where(eq(financialAssetSyncOutbox.status, "processing"));
  void processFinancialAssetSyncQueue();
  const timer = setInterval(() => {
    void processFinancialAssetSyncQueue();
  }, 30_000);
  timer.unref?.();
}
