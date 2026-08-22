# Individual Ledger Sync

## วัตถุประสงค์

หน้า **Individual Ledger** แยกข้อมูลลูกหนี้และเจ้าหนี้ตาม `partyId` ก่อนให้ผู้ใช้เลือก `contractId` ของบุคคลนั้น ตารางด้านล่างจะแสดงเฉพาะธุรกรรมที่ระบุ `contractId` ตรงกัน จึงไม่รวมรายการจากสัญญาอื่นหรือบุคคลอื่น

## Environment ของ Frontend

กำหนดค่า build-time environment ใน `Installment-payment` ดังนี้ โดยต้องใช้ HTTPS เมื่อเผยแพร่จริง

```bash
VITE_BACKEND_API_URL=https://your-income-expenses-backend.example
```

> ห้ามเก็บ Google Service Account, `ADMIN_API_TOKEN` หรือ write token ใด ๆ ใน frontend เพราะค่า `VITE_*` จะถูกส่งไปยัง browser ตอน build

## API ที่หน้าเว็บอ่าน

| Endpoint | วัตถุประสงค์ | เงื่อนไขการแยกข้อมูล |
|---|---|---|
| `GET /api/ledger/parties?role=debtor` | รายชื่อลูกหนี้ | อ่านเฉพาะ role `debtor` |
| `GET /api/ledger/parties?role=creditor` | รายชื่อเจ้าหนี้ | อ่านเฉพาะ role `creditor` |
| `GET /api/ledger/parties/:partyId` | สัญญาทั้งหมดของบุคคล | filter ด้วย `partyId` |
| `GET /api/ledger/contracts/:contractId` | ตารางชำระและธุรกรรมของสัญญา | filter ด้วย `contractId` |

## การเชื่อมธุรกรรมใหม่

เมื่อผู้ใช้เลือกบุคคลและสัญญาแล้ว Intent Console จะส่ง metadata ต่อไปนี้ไปกับการบันทึกรายรับหรือรายจ่าย:

```json
{
  "partyId": "debtor-001",
  "contractId": "contract-001"
}
```

Backend ต้องตรวจให้มีทั้งสองค่า หรือไม่รับ metadata นี้เลย การส่งเพียงค่าใดค่าหนึ่งต้องถูกปฏิเสธ เพื่อป้องกันการสร้างธุรกรรมที่ไม่สามารถระบุเจ้าของได้ หลังบันทึกสำเร็จ frontend จะ refresh ตารางสัญญาที่เลือกโดยอัตโนมัติ

## การตั้งค่า Google Sheets

สร้าง spreadsheet **สำหรับทดสอบก่อนเสมอ** และแชร์ให้ Service Account เป็น Editor จากนั้นกำหนดข้อมูล Google Sheets ที่ backend เท่านั้นตาม `.env.example` ของ repository `Income-and-expenses-by-manus`  ตารางที่ใช้ต้องรักษา headers ตาม `docs/individual-ledger-schema.md` ของ backend เพื่อให้การ map คอลัมน์และการ filter ทำงานถูกต้อง

## การตรวจรับก่อนเผยแพร่

ให้ตรวจให้ครบทั้งสี่กรณี: ลูกหนี้คนเดียวหลายสัญญา, เจ้าหนี้คนเดียวหลายสัญญา, สัญญาคนละบุคคล และธุรกรรมที่ไม่ผูกสัญญา  ต้องยืนยันว่าตารางของสัญญาที่เลือกไม่แสดงรายการจากอีกสามกรณี และตรวจว่า backend ส่ง `503` พร้อม `LEDGER_UNAVAILABLE` อย่างปลอดภัยเมื่อ Google Sheets ยังไม่ตั้งค่า
