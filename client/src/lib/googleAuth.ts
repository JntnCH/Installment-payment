import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from "firebase/auth";
import firebaseConfig from "../../../firebase-applet-config.json";

export const GOOGLE_WORKSPACE_SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
];

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
GOOGLE_WORKSPACE_SCOPES.forEach((scope) => {
  provider.addScope(scope);
});

let isSigningIn = false;
let cachedAccessToken: string | null = null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{
  user: User;
  accessToken: string;
} | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error("ไม่ได้รับ Access Token จากการเข้าสู่ระบบ Google");
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error("Sign in error:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

// --- Google Drive & Sheets API Utilities ---

export interface GoogleDriveFile {
  id: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string;
}

/**
 * List Google Spreadsheets from user's Drive
 */
export async function listGoogleSpreadsheets(
  accessToken: string
): Promise<GoogleDriveFile[]> {
  const query = encodeURIComponent(
    "mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false"
  );
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime,webViewLink)&orderBy=modifiedTime desc&pageSize=30`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData?.error?.message || `เรียกดู Google Sheets ไม่สำเร็จ (${response.status})`
    );
  }

  const data = await response.json();
  return data.files || [];
}

/**
 * Create a new Google Spreadsheet formatted for Debt & Installment Ledger
 */
export async function createLedgerSpreadsheet(
  accessToken: string,
  title?: string
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const sheetTitle =
    title ||
    `สมุดบัญชีสัญญาและการผ่อนชำระ - ${new Date().toISOString().slice(0, 10)}`;

  const createBody = {
    properties: {
      title: sheetTitle,
    },
    sheets: [
      { properties: { title: "ภาพรวมพอร์ต (Summary)" } },
      { properties: { title: "คู่สัญญา (Parties)" } },
      { properties: { title: "รายการสัญญา (Contracts)" } },
      { properties: { title: "ตารางงวดชำระ (Schedules)" } },
      { properties: { title: "ประวัติธุรกรรม (Transactions)" } },
    ],
  };

  const response = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(createBody),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData?.error?.message || `สร้าง Google Sheet ไม่สำเร็จ (${response.status})`
    );
  }

  const data = await response.json();
  return {
    spreadsheetId: data.spreadsheetId,
    spreadsheetUrl: data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`,
  };
}

/**
 * Export and sync application data into a designated Google Spreadsheet
 */
export async function exportLedgerToGoogleSheet(
  accessToken: string,
  spreadsheetId: string,
  ledgerData: {
    summary?: any;
    parties?: any[];
    contracts?: any[];
    schedules?: any[];
    transactions?: any[];
  }
): Promise<{ updatedCount: number }> {
  const nowStr = new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });

  // 1. Summary Sheet Data
  const summaryValues = [
    ["ระบบสมุดบัญชีสัญญาและสินเชื่อผ่อนชำระ (Debt & Installment Ledger)"],
    [`อัปเดตล่าสุด: ${nowStr}`],
    [""],
    ["รายการสรุปภาพรวม", "มูลค่า (บาท / รายการ)"],
    ["ยอดลูกหนี้คงค้างรวม (Receivables)", ledgerData.summary?.totalReceivableBalance || 0],
    ["ยอดเจ้าหนี้คงค้างรวม (Payables)", ledgerData.summary?.totalPayableBalance || 0],
    ["ส่วนต่างสุทธิที่รอรับ (Net Position)", ledgerData.summary?.netPosition || 0],
    ["จำนวนงวดที่เกินกำหนด (Overdue Count)", ledgerData.summary?.overdueCount || 0],
    ["ยอดเงินค้างชำระเกินกำหนด (Overdue Amount)", ledgerData.summary?.overdueAmount || 0],
    ["งวดที่ครบกำหนดชำระวันนี้ (Due Today Count)", ledgerData.summary?.dueTodayCount || 0],
    ["ยอดเงินครบกำหนดวันนี้ (Due Today Amount)", ledgerData.summary?.dueTodayAmount || 0],
    ["จำนวนคู่สัญญาทั้งหมด (Total Parties)", ledgerData.parties?.length || 0],
    ["จำนวนสัญญาทั้งหมด (Total Contracts)", ledgerData.contracts?.length || 0],
    ["จำนวนธุรกรรมทั้งหมด (Total Transactions)", ledgerData.transactions?.length || 0],
  ];

  // 2. Parties Sheet Data
  const partiesValues = [
    ["รหัสคู่สัญญา (Party ID)", "ชื่อ-นามสกุล / ชื่อร้าน", "สถานะบทบาท (Role)", "เบอร์โทรศัพท์", "วงเงินคงค้าง (บาท)", "หมายเหตุ"],
    ...(ledgerData.parties || []).map((p) => [
      p.partyId || "",
      p.displayName || "",
      p.role === "debtor" ? "ลูกหนี้ (ให้ยืม/ผ่อน)" : "เจ้าหนี้ (กู้ยืม/ค้างจ่าย)",
      p.phone || "-",
      p.totalBalance || 0,
      p.note || "",
    ]),
  ];

  // 3. Contracts Sheet Data
  const contractsValues = [
    ["รหัสสัญญา (Contract ID)", "ชื่อสัญญา / รายการ", "คู่สัญญา", "เงินต้น (Principal)", "ดอกเบี้ย (%)", "จำนวนงวด", "วันเริ่มสัญญา", "สถานะ", "สร้างเมื่อ"],
    ...(ledgerData.contracts || []).map((c) => [
      c.contractId || "",
      c.title || "",
      c.partyName || c.partyId || "",
      c.principal || 0,
      c.interestRate || 0,
      c.installmentCount || 0,
      c.startDate ? c.startDate.slice(0, 10) : "",
      c.status === "active" ? "ใช้งานอยู่" : c.status === "completed" ? "ปิดยอดแล้ว" : c.status,
      c.createdAt ? new Date(c.createdAt).toLocaleString("th-TH") : "",
    ]),
  ];

  // 4. Schedules Sheet Data
  const schedulesValues = [
    ["รหัสงวด (Schedule ID)", "รหัสสัญญา", "งวดที่", "วันครบกำหนด", "ยอดที่ต้องชำระ (บาท)", "ยอดที่จ่ายแล้ว (บาท)", "สถานะงวด", "วันที่จ่ายจริง", "บันทึก"],
    ...(ledgerData.schedules || []).map((s) => [
      s.scheduleId || "",
      s.contractId || "",
      s.installmentNo || 0,
      s.dueDate ? s.dueDate.slice(0, 10) : "",
      s.amount || 0,
      s.paidAmount || 0,
      s.status === "paid" ? "ชำระแล้ว" : s.status === "overdue" ? "เกินกำหนด" : s.status === "partial" ? "ชำระบางส่วน" : "รอชำระ",
      s.paidAt ? new Date(s.paidAt).toLocaleDateString("th-TH") : "-",
      s.note || "",
    ]),
  ];

  // 5. Transactions Sheet Data
  const transactionsValues = [
    ["รหัสธุรกรรม (Tx ID)", "ประเภท", "จำนวนเงิน (บาท)", "คู่สัญญา", "สัญญา", "วันที่ทำรายการ", "ช่องทางชำระ", "เลขอ้างอิง", "หมายเหตุ"],
    ...(ledgerData.transactions || []).map((t) => [
      t.transactionId || "",
      t.type === "repayment" ? "รับชำระค่างวด" : t.type === "disbursement" ? "จ่ายเงินกู้/ปล่อยกู้" : t.type === "borrow" ? "กู้ยืมเงินมา" : t.type === "expense" ? "ค่าใช้จ่าย" : t.type,
      t.amount || 0,
      t.partyName || t.partyId || "",
      t.contractTitle || t.contractId || "",
      t.occurredAt ? new Date(t.occurredAt).toLocaleString("th-TH") : "",
      t.channel || "เงินสด / โอน",
      t.reference || "-",
      t.note || "",
    ]),
  ];

  const dataPayload = [
    {
      range: "'ภาพรวมพอร์ต (Summary)'!A1",
      values: summaryValues,
    },
    {
      range: "'คู่สัญญา (Parties)'!A1",
      values: partiesValues,
    },
    {
      range: "'รายการสัญญา (Contracts)'!A1",
      values: contractsValues,
    },
    {
      range: "'ตารางงวดชำระ (Schedules)'!A1",
      values: schedulesValues,
    },
    {
      range: "'ประวัติธุรกรรม (Transactions)'!A1",
      values: transactionsValues,
    },
  ];

  // First check if tabs exist or create them
  try {
    const details = await getSpreadsheetDetails(accessToken, spreadsheetId);
    const existingTitles = new Set(details.sheets.map((s) => s.title));
    const requiredSheets = [
      "ภาพรวมพอร์ต (Summary)",
      "คู่สัญญา (Parties)",
      "รายการสัญญา (Contracts)",
      "ตารางงวดชำระ (Schedules)",
      "ประวัติธุรกรรม (Transactions)",
    ];

    const missingSheets = requiredSheets.filter((title) => !existingTitles.has(title));
    if (missingSheets.length > 0) {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            requests: missingSheets.map((title) => ({
              addSheet: {
                properties: { title },
              },
            })),
          }),
        }
      );
    }
  } catch (err) {
    console.warn("Could not inspect/create tabs, attempting direct update:", err);
  }

  const batchResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        valueInputOption: "USER_ENTERED",
        data: dataPayload,
      }),
    }
  );

  if (!batchResponse.ok) {
    const err = await batchResponse.json().catch(() => ({}));
    throw new Error(
      err?.error?.message || "ไม่สามารถอัปเดตข้อมูลลงแท็บ Google Sheets ได้"
    );
  }

  const result = await batchResponse.json();
  return { updatedCount: result.totalUpdatedRows || 5 };
}

/**
 * Get spreadsheet details and list of sheets/tabs
 */
export async function getSpreadsheetDetails(
  accessToken: string,
  spreadsheetId: string
): Promise<{
  title: string;
  sheets: { title: string; sheetId: number; rowCount?: number }[];
}> {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties(sheetId,title,gridProperties.rowCount)`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData?.error?.message ||
        `ไม่สามารถอ่านข้อมูล Google Sheet ได้ (${response.status})`
    );
  }

  const data = await response.json();
  return {
    title: data.properties?.title || "Google Spreadsheet",
    sheets: (data.sheets || []).map((s: any) => ({
      title: s.properties?.title || "Sheet1",
      sheetId: s.properties?.sheetId || 0,
      rowCount: s.properties?.gridProperties?.rowCount,
    })),
  };
}

/**
 * Read raw values from a specific range or sheet
 */
export async function readSpreadsheetValues(
  accessToken: string,
  spreadsheetId: string,
  range: string = "A1:Z5000"
): Promise<string[][]> {
  const encodedRange = encodeURIComponent(range);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?valueRenderOption=FORMATTED_VALUE`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData?.error?.message ||
        `ไม่สามารถอ่านแถวข้อมูลจาก Google Sheet ได้ (${response.status})`
    );
  }

  const data = await response.json();
  return data.values || [];
}

/**
 * Append a single record row to a sheet
 */
export async function appendSpreadsheetRow(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string,
  rowValues: (string | number)[]
): Promise<boolean> {
  const range = `${sheetName ? `'${sheetName}'!` : ""}A1`;
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      range
    )}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        values: [rowValues],
      }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData?.error?.message ||
        `ไม่สามารถเพิ่มแถวลง Google Sheet ได้ (${response.status})`
    );
  }

  return true;
}

export interface DialogflowSheetRow {
  rowIndex: number; // 1-based row index in Google Sheet
  date: string;
  itemType: "income" | "expense" | string;
  list: string;
  amount: number;
  rawAmount: string;
  note?: string;
  rawValues: string[];
}

/**
 * Parse rows from Dialogflow sheet into structured items
 */
export function parseDialogflowSheetRows(rawRows: string[][]): {
  headers: string[];
  records: DialogflowSheetRow[];
  totalIncome: number;
  totalExpense: number;
} {
  if (!rawRows || rawRows.length === 0) {
    return { headers: [], records: [], totalIncome: 0, totalExpense: 0 };
  }

  const headers = rawRows[0] || ["Date", "item type", "list", "Amount"];
  const records: DialogflowSheetRow[] = [];
  let totalIncome = 0;
  let totalExpense = 0;

  for (let i = 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || row.length === 0) continue;

    const dateVal = (row[0] || "").toString().trim();
    const typeVal = (row[1] || "").toString().trim().toLowerCase();
    const listVal = (row[2] || "").toString().trim();
    const amountValRaw = (row[3] || "").toString().trim();
    const noteVal = (row[4] || "").toString().trim();

    // Skip summary / ledger system headers if they were appended at bottom
    if (
      dateVal.includes("ระบบสมุดบัญชี") ||
      dateVal.includes("อัปเดตล่าสุด") ||
      dateVal.includes("รายการสรุปภาพรวม") ||
      dateVal.includes("Receivables") ||
      dateVal.includes("Payables") ||
      dateVal.includes("Total")
    ) {
      continue;
    }

    if (!dateVal && !listVal && !amountValRaw) continue;

    // Parse amount
    const cleanNumStr = amountValRaw.replace(/,/g, "").replace(/[^0-9.-]/g, "");
    const parsedAmount = parseFloat(cleanNumStr) || 0;

    let normalizedType: "income" | "expense" | string = "expense";
    if (
      typeVal === "income" ||
      typeVal === "รายรับ" ||
      typeVal === "รับ" ||
      listVal.startsWith("รับเงิน")
    ) {
      normalizedType = "income";
      totalIncome += parsedAmount;
    } else {
      normalizedType = "expense";
      totalExpense += parsedAmount;
    }

    records.push({
      rowIndex: i + 1,
      date: dateVal,
      itemType: normalizedType,
      list: listVal || "-",
      amount: parsedAmount,
      rawAmount: amountValRaw,
      note: noteVal,
      rawValues: row,
    });
  }

  return {
    headers,
    records,
    totalIncome,
    totalExpense,
  };
}

