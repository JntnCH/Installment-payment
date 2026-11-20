import { randomUUID } from "node:crypto";
import { uploadReceiptToGoogleDrive } from "./googleDrive";
import { incomeExpensesApiRequest } from "./incomeExpensesAdmin";

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
    date: string;
    type: string;
    item: string;
    amount: number;
    category: string;
    account: string;
    platform: string;
    recorder: string;
    transactionId: string;
    receiptUrl?: string;
    note?: string;
  }>;
};

function numberValue(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? "").replace(/[,฿\\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

type BackendResponse<T> = {
  success?: boolean;
  source?: string;
  count?: number;
  data?: T;
  message?: string;
};

export async function getSheetsBalance(_userId: number): Promise<SheetsBalance> {
  const response = await incomeExpensesApiRequest<BackendResponse<Omit<SheetsBalance, "source">>>(
    "GET",
    "/api/balance",
  );
  if (!response?.success || !response.data) {
    throw new Error(response?.message || "อ่านยอดจาก Backend ไม่สำเร็จ");
  }
  return {
    source: "google-sheets",
    dailyIncome: numberValue(response.data.dailyIncome),
    dailyExpense: numberValue(response.data.dailyExpense),
    monthlyIncome: numberValue(response.data.monthlyIncome),
    monthlyExpense: numberValue(response.data.monthlyExpense),
    balance: numberValue(response.data.balance),
    accountBalances: Array.isArray(response.data.accountBalances)
      ? response.data.accountBalances.map(account => ({
          name: String(account.name ?? ""),
          amount: numberValue(account.amount),
        }))
      : [],
  };
}

export async function listSheetsTransactions(_userId: number, limit = 100): Promise<SheetsTransactions> {
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  const response = await incomeExpensesApiRequest<BackendResponse<Array<Record<string, unknown>>>>(
    "GET",
    `/api/transactions?limit=${safeLimit}`,
  );
  if (!response?.success || !Array.isArray(response.data)) {
    throw new Error(response?.message || "อ่านรายการจาก Backend ไม่สำเร็จ");
  }
  const data = response.data.map((row, index) => ({
    date: String(row.date ?? ""),
    type: String(row.type ?? ""),
    item: String(row.item ?? ""),
    amount: numberValue(row.amount),
    category: String(row.category ?? ""),
    account: String(row.account ?? ""),
    platform: String(row.platform ?? ""),
    recorder: String(row.recorder ?? ""),
    transactionId: String(row.transactionId ?? `backend-row-${index}`),
    ...(row.receiptUrl ? { receiptUrl: String(row.receiptUrl) } : {}),
    ...(row.note ? { note: String(row.note) } : {}),
  }));
  return { source: "google-sheets", count: data.length, data };
}

export async function createSheetsTransaction(_userId: number, input: {
  transactionId?: string;
  type?: string;
  item?: string;
  amount: number;
  category?: string;
  account?: string;
  recorderName?: string;
  channel?: string;
  note?: string;
  date?: string;
  fileName?: string;
  mimeType?: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
  base64?: string;
}): Promise<Record<string, unknown>> {
  let receiptUrl = "";
  if (input.base64) {
    if (!input.fileName || !input.mimeType) throw new Error("ข้อมูลไฟล์หลักฐานไม่ครบ");
    const buffer = Buffer.from(input.base64, "base64");
    if (!buffer.length || buffer.length > 8 * 1024 * 1024) throw new Error("ไฟล์หลักฐานต้องมีขนาดไม่เกิน 8 MB");
    const uploaded = await uploadReceiptToGoogleDrive(_userId, input.date || new Date().toISOString().slice(0, 10), input.fileName, input.mimeType, buffer);
    receiptUrl = `https://drive.google.com/open?id=${encodeURIComponent(uploaded.fileId)}`;
  }

  const transactionId = input.transactionId?.trim() || randomUUID();
  const result = await incomeExpensesApiRequest<Record<string, unknown>>(
    "POST",
    "/api/transactions",
    {
      transactionId,
      type: input.type === "รายรับ" || input.type === "income" ? "income" : "expense",
      item: input.item?.trim() || "ไม่ระบุรายการ",
      amount: input.amount,
      category: input.category || "ทั่วไป",
      account: input.account || "เงินสด",
      recorderName: input.recorderName || "Web",
      channel: input.channel || "Installment Web",
      note: [input.note, receiptUrl].filter(Boolean).join("\\n"),
      date: input.date,
      receiptUrl,
    },
  );
  return { ...result, transactionId, receiptUrl };
}

export function sheetsProxyConfigured(): boolean {
  return true;
}
