import axios from "axios";
import { randomUUID } from "node:crypto";
import { getGoogleDriveAccessToken } from "./googleSheets";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const ROOT_FOLDER = "Installment-Payment";
const MONTHS = [
  "01-January", "02-February", "03-March", "04-April",
  "05-May", "06-June", "07-July", "08-August",
  "09-September", "10-October", "11-November", "12-December",
];

async function findOrCreateFolder(token: string, name: string, parentId?: string) {
  const clauses = [
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
    `name = '${name.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`,
  ];
  if (parentId) clauses.push(`'${parentId}' in parents`);
  const found = await axios.get<{ files?: Array<{ id: string }> }>(`${DRIVE_API}/files`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { q: clauses.join(" and "), pageSize: 10, fields: "files(id,name)" },
    timeout: 15000,
  });
  if (found.data.files?.[0]?.id) return found.data.files[0].id;

  const created = await axios.post<{ id: string }>(
    `${DRIVE_API}/files?fields=id`,
    {
      name,
      mimeType: "application/vnd.google-apps.folder",
      ...(parentId ? { parents: [parentId] } : {}),
    },
    { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, timeout: 15000 },
  );
  if (!created.data.id) throw new Error(`Google Drive ไม่สามารถสร้างโฟลเดอร์ ${name} ได้`);
  return created.data.id;
}

export async function uploadReceiptToGoogleDrive(
  ownerId: number,
  paidDate: string,
  fileName: string,
  mimeType: string,
  data: Buffer,
): Promise<{ fileId: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidDate)) throw new Error("วันที่ชำระไม่ถูกต้อง");
  const token = await getGoogleDriveAccessToken(ownerId);
  const [year, month] = paidDate.split("-");
  const monthIndex = Number(month) - 1;
  if (monthIndex < 0 || monthIndex > 11) throw new Error("เดือนที่ชำระไม่ถูกต้อง");

  const rootId = await findOrCreateFolder(token, ROOT_FOLDER, "root");
  const userId = await findOrCreateFolder(token, `User_${ownerId}`, rootId);
  const yearId = await findOrCreateFolder(token, year, userId);
  const monthId = await findOrCreateFolder(token, MONTHS[monthIndex], yearId);

  const boundary = `installment_${randomUUID()}`;
  const metadata = {
    name: `${Date.now()}_${fileName}`,
    mimeType,
    parents: [monthId],
  };
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    data,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const uploaded = await axios.post<{ id?: string }>(
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id`,
    body,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(body.length),
      },
      maxBodyLength: 10 * 1024 * 1024,
      timeout: 30000,
    },
  );
  if (!uploaded.data.id) throw new Error("Google Drive ไม่ส่ง File ID กลับมา");
  return { fileId: uploaded.data.id };
}
