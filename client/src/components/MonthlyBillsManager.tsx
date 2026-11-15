import React, { useMemo, useState } from "react";
import { CalendarDays, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type Bill = { id: string; billName: string; amount: string | number; dueDate: string; status: "pending" | "paid"; note: string | null };
const today = () => new Date().toISOString().slice(0, 10);

export default function MonthlyBillsManager() {
  const utils = trpc.useUtils();
  const billsQuery = trpc.monthlyBills.list.useQuery();
  const createBill = trpc.monthlyBills.create.useMutation({ onSuccess: async () => { await utils.monthlyBills.list.invalidate(); toast.success("บันทึกบิลแล้ว"); reset(); } });
  const updateBill = trpc.monthlyBills.update.useMutation({ onSuccess: async () => { await utils.monthlyBills.list.invalidate(); toast.success("แก้ไขบิลแล้ว"); reset(); } });
  const deleteBill = trpc.monthlyBills.delete.useMutation({ onSuccess: async () => { await utils.monthlyBills.list.invalidate(); toast.success("ลบบิลแล้ว"); } });
  const [editing, setEditing] = useState<Bill | null>(null);
  const [billName, setBillName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(today());
  const [status, setStatus] = useState<"pending" | "paid">("pending");
  const [note, setNote] = useState("");
  const reset = () => { setEditing(null); setBillName(""); setAmount(""); setDueDate(today()); setStatus("pending"); setNote(""); };
  const bills = billsQuery.data ?? [];
  const totalPending = useMemo(() => bills.filter(b => b.status === "pending").reduce((sum, b) => sum + Number(b.amount), 0), [bills]);
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
    <form onSubmit={submit} className="rounded-2xl border bg-white p-4 sm:p-5 space-y-3">
      <div className="font-semibold">{editing ? "แก้ไขบิล" : "เพิ่มบิลรายเดือน"}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-sm space-y-1"><span>ชื่อบิล</span><input className="w-full border rounded-lg p-2.5" value={billName} onChange={e=>setBillName(e.target.value)} placeholder="เช่น ค่าไฟฟ้า" required /></label>
        <label className="text-sm space-y-1"><span>จำนวนเงิน (บาท)</span><input className="w-full border rounded-lg p-2.5" type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" required /></label>
        <label className="text-sm space-y-1"><span>วันครบกำหนด</span><input className="w-full border rounded-lg p-2.5" type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} required /></label>
        <label className="text-sm space-y-1"><span>สถานะ</span><select className="w-full border rounded-lg p-2.5" value={status} onChange={e=>setStatus(e.target.value as "pending"|"paid")}><option value="pending">รอชำระ</option><option value="paid">ชำระแล้ว</option></select></label>
      </div>
      <label className="text-sm space-y-1 block"><span>หมายเหตุ</span><input className="w-full border rounded-lg p-2.5" value={note} onChange={e=>setNote(e.target.value)} placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)" /></label>
      <div className="flex gap-2"><button disabled={createBill.isPending || updateBill.isPending} className="rounded-lg bg-stone-900 text-white px-4 py-2.5 text-sm flex items-center gap-2"><Plus size={16}/>{editing ? "บันทึกการแก้ไข" : "เพิ่มบิล"}</button>{editing && <button type="button" onClick={reset} className="rounded-lg border px-4 py-2.5 text-sm flex items-center gap-2"><X size={16}/>ยกเลิก</button>}</div>
    </form>
    <section className="rounded-2xl border bg-white overflow-hidden">
      <div className="p-4 border-b font-semibold flex items-center justify-between"><span>รายการบิลทั้งหมด</span><span className="text-xs text-stone-500">{bills.length} รายการ</span></div>
      {billsQuery.isLoading ? <div className="p-8 text-center text-stone-500">กำลังโหลด...</div> : bills.length === 0 ? <div className="p-8 text-center text-stone-500"><CalendarDays className="mx-auto mb-2" />ยังไม่มีบิลรายเดือน</div> :
      <div className="divide-y">{bills.map((bill: Bill)=><div key={bill.id} className="p-4 flex flex-wrap items-center gap-3 justify-between">
        <div className="min-w-0 flex-1"><div className="font-semibold">{bill.billName}</div><div className="text-xs text-stone-500 mt-1">ครบกำหนด {new Date(bill.dueDate+"T00:00:00").toLocaleDateString("th-TH")} {bill.note ? "· "+bill.note : ""}</div></div>
        <div className="text-right"><div className="font-semibold">฿{Number(bill.amount).toLocaleString("th-TH",{minimumFractionDigits:2})}</div><span className={bill.status==="paid"?"text-emerald-700":"text-amber-700"}>{bill.status==="paid"?"ชำระแล้ว":"รอชำระ"}</span></div>
        <div className="flex gap-1"><button onClick={()=>startEdit(bill)} className="p-2 rounded-lg border" aria-label="แก้ไข"><Pencil size={16}/></button><button onClick={()=>{if(confirm("ยืนยันลบบิลนี้?")) deleteBill.mutate({id:bill.id});}} className="p-2 rounded-lg border text-red-600" aria-label="ลบ"><Trash2 size={16}/></button></div>
      </div>)}</div>}
    </section>
    <p className="text-xs text-stone-500">ข้อมูลบันทึกใน Railway Database และเข้าคิวรอซิงก์ Google Sheets (ระบบซิงก์อัตโนมัติจะทำงานหลังตั้งค่าการเชื่อมต่อ Google)</p>
  </div>;
}
