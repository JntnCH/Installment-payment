# ตัวอย่างการส่งข้อมูลจาก Installment-payment ไป Backend

## หลักการ

หน้าบ้านจะส่งข้อมูลไปยัง backend ผ่าน `POST /api/transactions` เท่านั้น หน้าบ้านไม่ควรมี Google API key, service-account private key หรือ credential ของ Google อยู่ใน JavaScript ที่ deploy แล้ว

ไฟล์ตัวอย่างที่ให้ไว้คือ `client/public/backend-api.js` ซึ่งเปิดฟังก์ชัน `window.InstallmentBackend.postTransaction()` สำหรับเรียกใช้จากหน้า legacy เดิม

## ตั้งค่า URL ของ Backend

ก่อนโหลด client ให้กำหนด URL ของ backend ที่ deploy แล้ว เช่นใน `client/index.html` ก่อน `backend-api.js`:

```html
<script>
  window.INSTALLMENT_BACKEND_URL = "https://your-backend-domain.example.com";
</script>
<script src="/backend-api.js"></script>
```

URL นี้ไม่ใช่ secret แต่ต้องเป็น HTTPS และ backend ต้องอนุญาต origin ของหน้าเว็บผ่าน CORS

## ตัวอย่างเรียกใช้กับปุ่มบันทึก

```javascript
async function saveDailyDebtToBackend() {
  const button = document.querySelector("#daily-save-btn");
  button.disabled = true;

  try {
    const result = await window.InstallmentBackend.postTransaction({
      type: "daily_debt",
      customerName: document.querySelector("#d-customer-name").value.trim(),
      recorderName: document.querySelector("#d-recorder-name").value.trim(),
      amount: document.querySelector("#d-amount").value,
      paymentAmount: document.querySelector("#d-daily-payment").value,
      interest: document.querySelector("#d-interest").value,
      fee: document.querySelector("#d-fee").value,
      account: document.querySelector("#d-account").value,
      channel: "หน้าเว็บ",
      transactionDate: new Date().toISOString(),
      note: "บันทึกจากโมดูลกู้รายวัน"
    });

    showToast(result.message || "บันทึกลง Google Sheets สำเร็จ", "success");
  } catch (error) {
    showToast(error.message || "ไม่สามารถบันทึกข้อมูลได้", "error");
  } finally {
    button.disabled = false;
  }
}
```

ถ้าต้องการให้ปุ่มเดิมเรียกฟังก์ชันนี้ ให้เปลี่ยน handler จาก `saveDailyDebt()` เป็น `saveDailyDebtToBackend()` หรือเรียก API ต่อท้ายฟังก์ชันเดิมหลังจากตรวจสอบข้อมูลผ่านแล้ว

## Payload ที่ส่งไป Backend

```json
{
  "type": "daily_debt",
  "customerName": "สมศักดิ์ ขยัน",
  "recorderName": "พนักงาน A",
  "amount": 4000,
  "paymentAmount": 200,
  "interest": 1450,
  "fee": 250,
  "account": "กสิกร",
  "channel": "หน้าเว็บ",
  "transactionDate": "2026-08-16T10:30:00.000Z",
  "note": "บันทึกจากโมดูลกู้รายวัน"
}
```

Backend ควรตรวจสอบชนิดข้อมูล, จำนวนเงินที่ต้องไม่ติดลบ, ฟิลด์ที่จำเป็น และกำหนดค่า `transactionId` ฝั่ง server ก่อน append ลงชีต `รายรับ-รายจ่าย` โดยเก็บ `Account` ไว้ในคอลัมน์ H ตามโครงสร้างข้อมูลของระบบ

## Response ที่หน้าบ้านคาดหวัง

เมื่อสำเร็จ:

```json
{
  "ok": true,
  "message": "บันทึกลง Google Sheets สำเร็จ",
  "transactionId": "txn_01J..."
}
```

เมื่อผิดพลาด:

```json
{
  "ok": false,
  "message": "ข้อมูลไม่ครบถ้วน"
}
```

Backend ต้องไม่ส่ง Google credential กลับมาใน response และควรใช้ status code เช่น `201` เมื่อบันทึกสำเร็จ, `400` เมื่อ payload ไม่ถูกต้อง, `401/403` เมื่อไม่ผ่านการยืนยันตัวตน และ `500` เมื่อเกิดข้อผิดพลาดจาก Google Sheets API

## ข้อควรระวัง

การมีเพียง URL ของ backend ในหน้าเว็บไม่ถือเป็นการยืนยันตัวตน ดังนั้น backend ควรมีวิธีตรวจสอบ request เช่น session, OAuth, signed token หรือ API gateway policy ห้ามใช้ Google service-account key เป็น bearer token ในหน้าเว็บโดยตรง เพราะจะทำให้ credential หลุดสู่ผู้ใช้ทุกคน

หาก backend อยู่คนละ domain ต้องตั้งค่า CORS ให้จำกัดเฉพาะ production origin ของ `Installment-payment` และไม่ควรเปิด `Access-Control-Allow-Origin: *` พร้อม credential
