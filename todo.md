# Manus Reserved hosting setup

- [x] ยืนยันโปรเจกต์ `Income-and-expenses-by-manus`
- [x] ยืนยันการใช้ Reserved hosting และรับทราบค่าใช้จ่ายโดยประมาณ
- [ ] เปิด Reserved hosting ผ่าน Settings → General → Hosting mode
- [ ] ตรวจสอบว่า backend process ทำงานต่อเนื่องและมี health check
- [ ] ทดสอบ endpoint ของ Bot หลายรอบเพื่อวัดเวลาตอบกลับ
- [ ] สรุปสถานะและขั้นตอนทดสอบหลังเปิดใช้งาน

## Backend test: Income-and-expenses-by-manus

- [x] Clone และตรวจสอบโครงสร้าง repository backend
- [x] ระบุ routes, services, integrations และชุดทดสอบที่มีอยู่
- [x] รันทดสอบ automated smoke tests และตรวจสอบข้อจำกัดของ dependency/lockfile
- [x] ทดสอบ API endpoints ที่เปิดใช้งานได้โดยไม่ใช้ข้อมูลลับ
- [x] ตรวจสอบเงื่อนไขและข้อจำกัดของ Google Sheets integration
- [x] สรุปผลผ่าน/ไม่ผ่าน พร้อมหลักฐานและแนวทางแก้ไข

## Backend hardening & release readiness

- [ ] ทำให้ dependency lockfile และคำสั่งทดสอบทำงานได้ใน environment สะอาด
- [ ] เพิ่มการบันทึกรายการลงทุนและเชื่อม intents ซื้อ/ขาย
- [ ] ป้องกัน admin/debug endpoints และจำกัด CORS
- [ ] ปรับ validation และ error handling สำหรับการอัปโหลด OCR
- [ ] เตรียม Spreadsheet ทดสอบและ secrets สำหรับ Google Sheets E2E
- [ ] ตรวจรับ API หลัง deploy และจัดทำ release report

## Bot Dashboard intent separation

- [x] กำหนด structured API contracts สำหรับเช็คยอด สรุปรายเดือน และ operation results
- [x] เพิ่ม backend endpoints และ tests สำหรับเช็คยอด สรุปรายเดือน และ actions ที่ frontend เรียก
- [x] สร้าง Bot Dashboard แยกการ์ดเช็คยอดกับสรุปรายเดือน
- [x] เพิ่ม Intent Console สำหรับรายรับ รายจ่าย ซื้อ ขาย AI Analyst และ OCR
- [x] ทดสอบ API, TypeScript, production build และ responsive UI
- [x] บันทึก checkpoint พร้อมคู่มือ environment และการเชื่อม backend

## Individual debtor-creditor ledger sync

- [x] กำหนด schema สำหรับคู่สัญญา สัญญา และธุรกรรมพร้อม test fixtures
- [x] เพิ่ม backend APIs สำหรับรายชื่อลูกหนี้/เจ้าหนี้ สัญญา และกำหนดชำระเฉพาะสัญญา
- [x] ทำให้ Dialogflow และ operations เขียน partyId/contractId อย่างปลอดภัย
- [x] สร้าง individual ledger, contract selector และตารางกำหนดชำระเฉพาะธุรกรรมบน frontend
- [x] เชื่อม API, refresh หลังบันทึก และตรวจสอบข้อมูลใหม่จาก backend
- [x] ทดสอบ isolation, error states, responsive UI และจัดทำคู่มือตั้งค่า
- [x] บันทึก checkpoint ของ frontend หลังตรวจรับ

## Delinquency status and due-date alerts

- [x] กำหนดเกณฑ์สถานะตรงเวลา ใกล้ครบกำหนด และค้างชำระจากกำหนดชำระเฉพาะสัญญา
- [x] เพิ่มตัวกรองสถานะและแผงสรุปการแจ้งเตือนใน Individual Ledger
- [x] ตรวจสอบตรรกะสำหรับกรณีเลยกำหนด วันนี้ ภายใน 3 วัน และชำระแล้วผ่าน TypeScript check และ production build
- [x] ตรวจ responsive UI บนเดสก์ท็อปและมือถือ
- [x] สร้าง checkpoint, เผยแพร่ และซิงก์โค้ดขึ้น GitHub

## Persistent database for Installment-payment

- [x] ยกระดับโปรเจกต์จาก static frontend เป็น full-stack พร้อมฐานข้อมูลถาวร
- [x] ออกแบบและสร้างตารางคู่สัญญา สัญญา ธุรกรรม และงวดชำระ พร้อมความสัมพันธ์และข้อจำกัดข้อมูล
- [x] สร้าง API ฝั่ง server สำหรับบันทึก อ่าน และอัปเดตข้อมูล Individual Ledger อย่างปลอดภัย
- [x] เชื่อมหน้าเว็บกับฐานข้อมูลแทนการเก็บข้อมูลเฉพาะในอุปกรณ์
- [x] ตรวจ TypeScript, unit tests, production build ตารางฐานข้อมูลจริง และหน้า UI ที่ต้องเข้าสู่ระบบก่อนเข้าถึงข้อมูลถาวร
- [ ] ทดสอบ E2E หลังยืนยันตัวตน: สร้าง อ่าน แก้ไข และรีเฟรชเพื่อยืนยันว่าข้อมูลผู้ใช้คงอยู่
- [ ] จัดทำ checkpoint เผยแพร่ และซิงก์ GitHub

## Read-only persistent API verification

- [x] ทดสอบ API แบบไม่ยืนยันตัวตนว่าปฏิเสธการเข้าถึงข้อมูล Ledger อย่างถูกต้อง
- [x] ตรวจ schema และ endpoint แบบอ่านอย่างเดียวโดยไม่สร้างหรือแก้ไขข้อมูลของผู้ใช้
- [x] จัดทำเอกสารสรุปผลการตรวจ API แบบไม่เปลี่ยนข้อมูล
