/**
 * Google Sheets access is intentionally disabled until per-user OAuth
 * credentials and per-user spreadsheet ownership are implemented.
 *
 * The previous implementation used one backend admin key for every signed-in
 * account, which exposed the same financial dataset to all users.
 */

const DISABLED_MESSAGE =
  "Google Sheets ยังไม่พร้อมใช้งาน: ต้องเชื่อมบัญชี Google แยกตามผู้ใช้ก่อน เพื่อป้องกันข้อมูลข้ามบัญชี";

export async function getSheetsBalance(): Promise<never> {
  throw new Error(DISABLED_MESSAGE);
}

export async function listSheetsTransactions(_limit = 100): Promise<never> {
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
}): Promise<never> {
  throw new Error(DISABLED_MESSAGE);
}

export function sheetsProxyConfigured() {
  return false;
}
