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
- [ ] บันทึก checkpoint พร้อมคู่มือ environment และการเชื่อม backend
