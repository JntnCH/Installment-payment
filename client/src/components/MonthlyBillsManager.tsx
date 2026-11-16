import React, { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, ChevronDown, Pencil, Plus, Trash2, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type Bill = { id: string; billName: string; amount: string | number; dueDate: string; status: "pending" | "paid"; note: string | null; paidAt?: Date | string | null; paidAmount?: string | number | null; receiptKey?: string | null };
const today = () => new Date().toISOString().slice(0, 10);

export default function MonthlyBillsManager() {
  const utils = trpc.useUtils();
  const billsQuery = trpc.monthlyBills.list.useQuery();
  const sheetsStatus = trpc.monthlyBills.googleStatus.useQuery();
  const configureSheets = trpc.monthlyBills.configureGoogleSpreadsheet.useMutation({
    onSuccess: async () => { await sheetsStatus.refetch(); toast.success("บันทึกการเชื่อมต่อ Google Sheets แล้ว"); },
    onError: error => toast.error(error.message),
  });
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [sheetsExpanded, setSheetsExpanded] = useState(false);
  useEffect(() => {
    if (sheetsStatus.data?.spreadsheetId) setSpreadsheetId(sheetsStatus.data.spreadsheetId);
  }, [sheetsStatus.data?.spreadsheetId]);
  const createBill = trpc.monthlyBills.create.useMutation({ onSuccess: async () => { await utils.monthlyBills.list.invalidate(); toast.success("บันทึกบิลแล้ว"); reset(); } });
  const updateBill = trpc.monthlyBills.update.useMutation({ onSuccess: async () => { await utils.monthlyBills.list.invalidate(); toast.success("แก้ไขบิลแล้ว"); reset(); } });
  const deleteBill = trpc.monthlyBills.delete.useMutation({ onSuccess: async () => { await utils.monthlyBills.list.invalidate(); toast.success("ลบบิลแล้ว"); } });
  const uploadReceipt = trpc.monthlyBills.uploadReceipt.useMutation();
  const recordPayment = trpc.monthlyBills.recordPayment.useMutation({ onSuccess: async () => { await utils.monthlyBills.list.invalidate(); setPaymentBill(null); setReceiptFile(null); toast.success("บันทึกการชำระบิลแล้ว"); }, onError: error => toast.error(error.message) });
  const [paymentBill, setPaymentBill] = useState<Bill | null>(null);
  const [paidAmount, setPaidAmount] = useState("");
  const [paidDate, setPaidDate] = useState(today());
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [editing, setEditing] = useState<Bill | null>(null);
  const [billName, setBillName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(today());
  const [status, setStatus] = useState<"pending" | "paid">("pending");
  const [note, setNote] = useState("");
  const reset = () => { setEditing(null); setBillName(""); setAmount(""); setDueDate(today()); setStatus("pending"); setNote(""); };
  const bills = billsQuery.data ?? [];
  const totalPending = useMemo(() => bills.filter(b => b.status === "pending").reduce((sum, b) => sum + Number(b.amount), 0), [bills]);
  const submitPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!paymentBill || !(Number(paidAmount) > 0)) { toast.error("กรอกยอดที่ชำระจริงให้ถูกต้อง"); return; }
    try {
      let receiptKey: string | undefined;
      if (receiptFile) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
          reader.onerror = () => reject(new Error("อ่านไฟล์หลักฐานไม่สำเร็จ"));
          reader.readAsDataURL(receiptFile);
        });
        const uploaded = await uploadReceipt.mutateAsync({ billId: paymentBill.id, paidDate, fileName: receiptFile.name, mimeType: receiptFile.type as "image/jpeg" | "image/png" | "image/webp" | "application/pdf", base64 });
        receiptKey = uploaded.receiptKey;
      }
      await recordPayment.mutateAsync({ id: paymentBill.id, paidAmount: Number(paidAmount), paidAt: new Date(paidDate + "T12:00:00").toISOString(), receiptKey });
    } catch (error) { toast.error(error instanceof Error ? error.message : "บันทึกการชำระไม่สำเร็จ"); }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = { billName, amount: Number(amount), dueDate, status, note };
    if (!billName.trim() || !(Number(amount) > 0)) { toast.error("กรอกชื่อบิลและจำนวนเงินให้ถูกต้อง"); return; }
    try { if (editing) await updateBill.mutateAsync({ id: editing.id, ...payload }); else await createBill.mutateAsync(payload); }
    catch (error) { toast.error(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ"); }
  };
  const startEdit = (bill: Bill) => { setEditing(bill); setBillName(bill.billName); setAmount(String(bill.amount)); setDueDate(bill.dueDate); setStatus(bill.status); setNote(bill.note ?? ""); };
  return <div className="space-y-6">
    <div className="flex items-start justify-between gap-3">
      <div><div className="text-xs tracking-widest text-stone-500">MONTHLY BILL TRACKER</div><h1 className="text-2xl font-bold mt-1">บิลรายเดือน</h1><p className="text-sm text-stone-500 mt-1">บันทึกวันครบกำหนดและติดตามยอดที่ต้องชำระ</p></div>
      <div className="rounded-xl bg-white border p-3 min-w-32"><div className="text-xs text-stone-500">ยอดค้างชำระ</div><div className="font-bold text-lg">฿{totalPending.toLocaleString("th-TH")}</div></div>
    </div>
    <section className="rounded-2xl border bg-white overflow-hidden">
      <button
        type="button"
        aria-expanded={sheetsExpanded}
        onClick={() => setSheetsExpanded(value => !value)}
        className="w-full p-4 flex items-center justify-between gap-3 text-left"
      >
        <span className="min-w-0">
          <span className="block font-semibold">Google Sheets Auto Sync</span>
          <span className="block text-xs text-stone-500 mt-1">
            {sheetsStatus.data?.connected ? "เชื่อมต่อ Google แล้ว" : "ยังไม่ได้เชื่อมต่อ Google"}
            {sheetsStatus.data?.configured ? " · ตั้งค่า Spreadsheet แล้ว" : " · ยังไม่ได้ตั้งค่า Spreadsheet ID"}
          </span>
        </span>
        <ChevronDown size={18} className={`shrink-0 transition-transform ${sheetsExpanded ? "rotate-180" : ""}`} />
      </button>
      {sheetsExpanded && <div className="px-4 pb-4 pt-1 border-t space-y-3">
        <p className="text-sm text-stone-500">
          {sheetsStatus.data?.connected ? `เชื่อมต่อแล้ว ${sheetsStatus.data.connectedEmail ? "· " + sheetsStatus.data.connectedEmail : ""}` : "ยังไม่ได้อนุญาต Google Sheets"}
        </p>
        <button type="button" onClick={() => window.location.assign("/api/auth/google?intent=link")} className="rounded-lg border px-3 py-2 text-sm">
          {sheetsStatus.data?.connected ? "เชื่อมต่อ Google ใหม่ / อนุญาตสิทธิ์ Sheets" : "เชื่อมต่อ Google Sheets"}
        </button>
        {!sheetsStatus.data?.configured && <div className="flex flex-col sm:flex-row gap-2">
          <input value={spreadsheetId} onChange={event => setSpreadsheetId(event.target.value)} className="min-w-0 flex-1 border rounded-lg p-2.5 text-sm" placeholder="วาง Google Spreadsheet ID" />
          <button type="button" disabled={!sheetsStatus.data?.connected || configureSheets.isPending || !spreadsheetId.trim()} onClick={() => configureSheets.mutate({ spreadsheetId })} className="rounded-lg bg-stone-900 px-4 py-2.5 text-sm text-white disabled:opacity-50">
            บันทึก Spreadsheet
          </button>
        </div>}
        {sheetsStatus.data?.configured && <p className="text-xs text-emerald-700">ใช้ Spreadsheet ID จาก Environment Variable: GOOGLE_SPREADSHEET_ID</p>}
        <p className="text-xs text-stone-500">ระบบจะซิงก์อัตโนมัติทุกครั้งที่เพิ่ม แก้ไข ลบ หรือเปลี่ยนสถานะ และจะลองใหม่เมื่อ Google Sheets ใช้งานไม่ได้</p>
      </div>}
    </section>
    <form onSubmit={submit} className="rounded-2xl border bg-white p-4 sm:p-5 space-y-3">
      <div className="font-semibold">{editing ? "แก้ไขบิล" : "เพิ่มบิลรายเดือน"}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-sm space-y-1"><span>ชื่อบิล</span><input className="w-full border rounded-lg p-2.5" value={billName} onChange={e=>setBillName(e.target.value)} placeholder="เช่น ค่าไฟฟ้า" required /></label>
        <label className="text-sm space-y-1"><span>จำนวนเงิน (บาท)</span><input className="w-full border rounded-lg p-2.5" type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" required /></label>
        <label className="text-sm space-y-1"><span>วันครบกำหนด</span><input className="w-full border rounded-lg p-2.5" type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} required /></label>
        <div className="text-sm space-y-1"><span className="block">สถานะ</span><div className="border rounded-lg p-2.5 text-stone-600">{editing?.status === "paid" ? "ชำระแล้ว" : "รอชำระ (ใช้ปุ่มชำระบิลเพื่อบันทึก)"}</div></div>
      </div>
      <label className="text-sm space-y-1 block"><span>หมายเหตุ</span><input className="w-full border rounded-lg p-2.5" value={note} onChange={e=>setNote(e.target.value)} placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)" /></label>
      <div className="flex gap-2"><button disabled={createBill.isPending || updateBill.isPending} className="rounded-lg bg-stone-900 text-white px-4 py-2.5 text-sm flex items-center gap-2"><Plus size={16}/>{editing ? "บันทึกการแก้ไข" : "เพิ่มบิล"}</button>{editing && <button type="button" onClick={reset} className="rounded-lg border px-4 py-2.5 text-sm flex items-center gap-2"><X size={16}/>ยกเลิก</button>}</div>
    </form>
    <section className="rounded-2xl border bg-white overflow-hidden">
      <div className="p-4 border-b font-semibold flex items-center justify-between"><span>รายการบิลทั้งหมด</span><span className="text-xs text-stone-500">{bills.length} รายการ</span></div>
      {billsQuery.isLoading ? <div className="p-8 text-center text-stone-500">กำลังโหลด...</div> : bills.length === 0 ? <div className="p-8 text-center text-stone-500"><CalendarDays className="mx-auto mb-2" />ยังไม่มีบิลรายเดือน</div> :
      <div className="divide-y">{bills.map((bill: Bill)=><div key={bill.id} className="p-4 flex flex-wrap items-center gap-3 justify-between">
        <div className="min-w-0 flex-1"><div className="font-semibold">{bill.billName}</div><div className="text-xs text-stone-500 mt-1">ครบกำหนด {new Date(bill.dueDate+"T00:00:00").toLocaleDateString("th-TH")} {bill.note ? "· "+bill.note : ""}</div></div>
        <div className="text-right"><div className="font-semibold">฿{Number(bill.amount).toLocaleString("th-TH",{minimumFractionDigits:2})}</div><span className={bill.status==="paid"?"text-emerald-700":"text-amber-700"}>{bill.status==="paid"?"ชำระแล้ว":"รอชำระ"}</span>{bill.status==="paid" && <div className="text-xs text-stone-500 mt-1">จ่ายจริง ฿{Number(bill.paidAmount ?? bill.amount).toLocaleString("th-TH",{minimumFractionDigits:2})}{bill.paidAt ? " · "+(bill.paidAt instanceof Date ? bill.paidAt : new Date(bill.paidAt)).toLocaleDateString("th-TH") : ""}</div>}{bill.receiptKey && <a className="text-xs text-blue-700 underline block mt-1" href={"/manus-storage/"+bill.receiptKey} target="_blank" rel="noreferrer">ดูหลักฐาน</a>}</div>
        <div className="flex gap-1">{bill.status !== "paid" && <button onClick={()=>{setPaymentBill(bill);setPaidAmount(String(bill.amount));setPaidDate(today());setReceiptFile(null);}} className="rounded-lg bg-emerald-700 text-white px-3 py-2 text-xs flex items-center gap-1"><CheckCircle2 size={15}/>ชำระบิล</button>}<button onClick={()=>startEdit(bill)} className="p-2 rounded-lg border" aria-label="แก้ไข"><Pencil size={16}/></button><button onClick={()=>{if(confirm("ยืนยันลบบิลนี้?")) deleteBill.mutate({id:bill.id});}} className="p-2 rounded-lg border text-red-600" aria-label="ลบ"><Trash2 size={16}/></button></div>
      </div>)}</div>}
    </section>
    {paymentBill && <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="บันทึกการชำระบิล">
      <form onSubmit={submitPayment} className="w-full max-w-md rounded-2xl bg-white p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between"><h2 className="text-lg font-bold">บันทึกการชำระบิล</h2><button type="button" onClick={()=>setPaymentBill(null)} className="p-2 rounded-lg border" aria-label="ปิด"><X size={18}/></button></div>
        <div className="rounded-lg bg-stone-50 p-3"><div className="font-semibold">{paymentBill.billName}</div><div className="text-sm text-stone-500">ยอดตามบิล ฿{Number(paymentBill.amount).toLocaleString("th-TH",{minimumFractionDigits:2})}</div></div>
        <label className="block text-sm space-y-1"><span>ยอดที่ชำระจริง (บาท)</span><input className="w-full border rounded-lg p-2.5" type="number" min="0.01" step="0.01" value={paidAmount} onChange={e=>setPaidAmount(e.target.value)} required /></label>
        <label className="block text-sm space-y-1"><span>วันที่ชำระ</span><input className="w-full border rounded-lg p-2.5" type="date" value={paidDate} onChange={e=>setPaidDate(e.target.value)} required /></label>
        <label className="block text-sm space-y-1"><span>แนบสลิป / หลักฐาน (ไม่บังคับ)</span><input className="w-full border rounded-lg p-2.5 text-sm" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e=>setReceiptFile(e.target.files?.[0] ?? null)} />{receiptFile && <span className="text-xs text-stone-500">{receiptFile.name} · {(receiptFile.size/1024/1024).toFixed(2)} MB</span>}<span className="block text-xs text-stone-500">รองรับ JPG, PNG, WEBP หรือ PDF ขนาดไม่เกิน 8 MB</span></label>
        <div className="flex gap-2"><button type="submit" disabled={recordPayment.isPending || uploadReceipt.isPending} className="flex-1 rounded-lg bg-emerald-700 text-white px-4 py-2.5 text-sm disabled:opacity-50">{recordPayment.isPending || uploadReceipt.isPending ? "กำลังบันทึก..." : "ยืนยันการชำระ"}</button><button type="button" onClick={()=>setPaymentBill(null)} className="rounded-lg border px-4 py-2.5 text-sm">ยกเลิก</button></div>
      </form>
    </div>}
    <p className="text-xs text-stone-500">ข้อมูลหลักบันทึกใน Railway Database และระบบจะส่งไปยังแท็บ “บิลรายเดือน” ใน Google Sheets อัตโนมัติ</p>
  </div>;
}
