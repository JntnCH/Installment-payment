# Bot Dashboard Integration

## วัตถุประสงค์

Bot Dashboard แสดงผลของสอง Intent แยกจากกันอย่างชัดเจน เพื่อไม่ให้ยอดรายวัน ยอดบัญชี และผลรวมรายเดือนปะปนในกล่องข้อความเดียว โดย Intent **เช็คยอด** อ่านจาก `GET /api/summary/balance` ส่วน Intent **สรุปรายเดือน** อ่านจาก `GET /api/summary/monthly`

## การตั้งค่า Frontend

ตั้งค่า URL ของ backend ใน environment สำหรับ build ของ Vite โดยห้ามใส่ Google Service Account หรือ token สำหรับ admin ในตัวแปรที่ขึ้นต้นด้วย `VITE_`

```bash
VITE_BACKEND_API_URL=https://api.example.com
```

หลังตั้งค่าแล้ว build ใหม่ด้วยคำสั่งต่อไปนี้

```bash
pnpm build
```

## Intent ที่หน้าเว็บรองรับ

| ส่วนของหน้าจอ | Intent / การทำงาน | API | ผลลัพธ์ที่แสดง |
|---|---|---|---|
| เช็คยอด | ตรวจยอดวันนี้และยอดต่อบัญชี | `GET /api/summary/balance` | รายการวันนี้, รายรับ, รายจ่าย, ยอดคงเหลือรวม, ยอดรายบัญชี |
| สรุปรายเดือน | สรุปผลรวมของเดือน | `GET /api/summary/monthly` | รายรับรายเดือน, รายจ่ายรายเดือน, เงินสุทธิ |
| Intent Console | บันทึกรายรับ/รายจ่าย | `POST /api/operations/transactions` | สถานะการบันทึก แล้วรีเฟรช summary |
| Intent Console | บันทึกการซื้อ/ขายลงทุน | `POST /api/operations/investments` | สถานะการบันทึกรายการลงทุน |
| Intent Console | AI Analyst / QueryExcel | `POST /api/operations/query` | คำตอบที่ได้จาก backend |
| Intent Console | OCR | `POST /api/ocr/scan` | ข้อความหรือสถานะจากการอ่านใบเสร็จ |

## การตั้งค่า Backend ที่จำเป็น

Backend ต้องตั้งค่า Google Sheets credentials และ Spreadsheet ID ตามไฟล์ `.env.example` ของ repository `Income-and-expenses-by-manus` พร้อมอนุญาต origin ของ frontend ใน `CORS_ALLOWED_ORIGINS` เช่น

```bash
CORS_ALLOWED_ORIGINS=https://instalpay-crbqedi3.manus.space
```

> `ADMIN_API_TOKEN` ใช้กับเส้นทาง admin/debug เท่านั้น และ **ไม่ควร** ส่งให้ Bot Dashboard หรือเก็บในตัวแปร `VITE_*` เพราะจะเผยแพร่สู่ browser

## สถานะเมื่อ backend ยังไม่พร้อม

หาก `VITE_BACKEND_API_URL` ยังไม่ถูกตั้งค่า หน้าจอจะแสดงสถานะ “รอเชื่อม Backend” และปิดปุ่มรีเฟรชเพื่อไม่ให้เกิด request ไปยัง origin ของ frontend โดยไม่ได้ตั้งใจ หาก backend ตอบ error เช่น Google Sheets credentials ไม่ครบ หน้าจอจะแสดงข้อความข้อผิดพลาดโดยไม่แสดงข้อมูลลับ
