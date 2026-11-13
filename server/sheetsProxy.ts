/**
 * Google Sheets access stays disabled until per-user OAuth credentials and
 * per-user spreadsheet ownership are implemented. Never use a shared admin
 * key for multiple signed-in users.
 */

const DISABLED_MESSAGE =
  "Google Sheets ยังไม่พร้อมใช้งาน: ต้องเชื่อมบัญชี Google แยกตามผู้ใช้ก่อน เพื่อป้องกันข้อมูลข้ามบัญชี";

export type SheetsBalance = {
  source: "google-sheets";
  monthlyIncome?: number;
  monthlyExpense?: number;
  balance?: number;
  accountBalances?: Array<{ name: string; amount: number }>;
  [key: string]: unknown;
};

export type SheetsTransactions = {
  source: "google-sheets";
  count: number;
  data: unknown[];
};

export async function getSheetsBalance(): Promise<SheetsBalance> {
  throw new Error(DISABLED_MESSAGE);
}

export async function listSheetsTransactions(_limit = 100): Promise<SheetsTransactions> {
  throw new Error(DISABLED_MESSAGE);
}

export async function createSheetsTransaction(_input: {
  type?: string;
  item?: string;
  amount: number;
  category?: string;
  account?: string;
  recorderName?: string;
  channel?: string;
  note?: string;
}): Promise<Record<string, unknown>> {
  throw new Error(DISABLED_MESSAGE);
}

export function sheetsProxyConfigured(): boolean {
  return false;
}
