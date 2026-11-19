import { randomUUID } from "node:crypto";
import axios from "axios";
import { getGoogleSheetsCredentials } from "./googleSheets";
import { uploadReceiptToGoogleDrive } from "./googleDrive";

const GOOGLE_API = "https://sheets.googleapis.com/v4";
const TRANSACTION_TAB = "รายรับ-รายจ่าย";
const DASHBOARD_TAB = "BotDashboard";

export type SheetsBalance = {
  source: "google-sheets";
  dailyIncome: number;
  dailyExpense: number;
  monthlyIncome: number;
  monthlyExpense: number;
  balance: number;
  accountBalances: Array<{ name: string; amount: number }>;
};

export type SheetsTransactions = {
  source: "google-sheets";
  count: number;
  data: Array<{
    date: string; type: string; item: string; amount: number; category: string;
    account: string; platform: string; recorder: string; transactionId: string;
    receiptUrl?: string;
  }>;
};

function numberValue(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? "").replace(/[,฿\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function sheetsRequest<T>(token: string, method: "GET" | "POST" | "PUT", url: string, data?: unknown): Promise<T> {
  const response = await axios.request<T>({
    method, url, data,
    headers: { Authorization: `Bearer ${token}`, ...(data ? { "Content-Type": "application/json" } : {}) },
    timeout: 20000,
  });
  return response.data;
}

async function getConnection(userId: number) {
  const { accessToken, spreadsheetId } = await getGoogleSheetsCredentials(userId);
  return { token: accessToken, spreadsheetId };
}

export async function getSheetsBalance(userId: number): Promise<SheetsBalance> {
  const { token, spreadsheetId } = await getConnection(userId);
  const range = encodeURIComponent(`'${DASHBOARD_TAB}'!A1:Z50`);
  const result = await sheetsRequest<{ values?: unknown[][] }>(
    token, "GET", `${GOOGLE_API}/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}`,
  );
  const rows = result.values ?? [];
  const valueAt = (row: number, col: number) => numberValue(rows[row]?.[col]);
  const names = rows[1] ?? [];
  const amounts = rows[2] ?? [];
  const accountBalances: Array<{ name: string; amount: number }> = [];
  for (let col = 5; col < Math.max(names.length, amounts.length); col++) {
    const name = String(names[col] ?? "").trim();
    if (name) accountBalances.push({ name, amount: numberValue(amounts[col]) });
  }
  return {
    source: "google-sheets",
    dailyIncome: valueAt(1, 1),
    dailyExpense: valueAt(2, 1),
    monthlyIncome: valueAt(3, 1),
    monthlyExpense: valueAt(4, 1),
    balance: valueAt(5, 1),
    accountBalances,
  };
}

export async function listSheetsTransactions(userId: number, limit = 100): Promise<SheetsTransactions> {
  const { token, spreadsheetId } = await getConnection(userId);
  const range = encodeURIComponent(`'${TRANSACTION_TAB}'!A2:K`);
  const result = await sheetsRequest<{ values?: unknown[][] }>(
    token, "GET", `${GOOGLE_API}/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}`,
  );
  const rows = result.values ?? [];
  const data = rows.map((row, index) => ({
    date: String(row[0] ?? ""),
    type: String(row[1] ?? ""),
    item: String(row[2] ?? ""),
    amount: numberValue(row[3]),
    category: String(row[4] ?? ""),
    account: String(row[5] ?? ""),
    platform: String(row[6] ?? ""),
    recorder: String(row[7] ?? ""),
    transactionId: String(row[8] ?? `sheet-row-${index + 2}`),
    ...(row[9] ? { receiptUrl: String(row[9]) } : {}),
    note: String(row[10] ?? ""),
  })).filter(row => row.date || row.item || row.amount);
  const recent = data.slice(-Math.max(1, Math.min(500, limit))).reverse();
  return { source: "google-sheets", count: recent.length, data: recent };
}

export async function createSheetsTransaction(userId: number, input: {
  type?: string; item?: string; amount: number; category?: string; account?: string;
  recorderName?: string; channel?: string; note?: string; date?: string;
  fileName?: string; mimeType?: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
  base64?: string;
}): Promise<Record<string, unknown>> {
  const { token, spreadsheetId } = await getConnection(userId);
  const date = input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date)
    ? input.date
    : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  let receiptUrl = "";
  if (input.base64) {
    if (!input.fileName || !input.mimeType) throw new Error("ข้อมูลไฟล์หลักฐานไม่ครบ");
    const buffer = Buffer.from(input.base64, "base64");
    if (!buffer.length || buffer.length > 8 * 1024 * 1024) throw new Error("ไฟล์หลักฐานต้องมีขนาดไม่เกิน 8 MB");
    const uploaded = await uploadReceiptToGoogleDrive(userId, date, input.fileName, input.mimeType, buffer);
    receiptUrl = `https://drive.google.com/open?id=${encodeURIComponent(uploaded.fileId)}`;
  }
  const dateLabel = new Date(`${date}T12:00:00+07:00`).toLocaleDateString("en-GB", { timeZone: "Asia/Bangkok" });
  const type = input.type === "รายรับ" || input.type === "income" ? "income" : "expense";
  const transactionId = randomUUID();
  const row = [
    dateLabel, type, input.item?.trim() || "ไม่ระบุรายการ", input.amount,
    input.category || "ทั่วไป", input.account || "เงินสด", input.channel || "Installment Web",
    input.recorderName || "Web", transactionId, receiptUrl, input.note || "",
  ];
  const headerCell = encodeURIComponent(`'${TRANSACTION_TAB}'!J1:K1`);
  const header = await sheetsRequest<{ values?: unknown[][] }>(
    token, "GET", `${GOOGLE_API}/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${headerCell}`,
  );
  const headerValues = header.values?.[0] ?? [];
  if (!headerValues[0] || !headerValues[1]) {
    await sheetsRequest(token, "PUT",
      `${GOOGLE_API}/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${headerCell}?valueInputOption=RAW`,
      { values: [[headerValues[0] || "หลักฐานการชำระ", headerValues[1] || "หมายเหตุ"]] },
    );
  }
  const range = encodeURIComponent(`'${TRANSACTION_TAB}'!A:K`);
  await sheetsRequest(token, "POST",
    `${GOOGLE_API}/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { values: [row] },
  );
  return { success: true, transactionId, receiptUrl };
}

export function sheetsProxyConfigured(): boolean {
  return true;
}
