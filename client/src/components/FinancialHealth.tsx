import React, { useMemo, useState } from "react";
import { Activity, Landmark, Pencil, Plus, ShieldCheck, Trash2, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const categories = [
  { value: "cash", label: "เงินสด" },
  { value: "bank", label: "เงินฝากธนาคาร" },
  { value: "vehicle", label: "รถยนต์ / รถจักรยานยนต์" },
  { value: "property", label: "บ้าน / ที่ดิน" },
  { value: "gold", label: "ทองคำ" },
  { value: "investment", label: "หุ้น / กองทุน / การลงทุน" },
  { value: "other", label: "ทรัพย์สินอื่น ๆ" },
] as const;
type Category = typeof categories[number]["value"];
type Asset = { id: string; category: Category; name: string; amount: number; note: string };
const money = (value: number) => "฿" + value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function FinancialHealth() {
  const utils = trpc.useUtils();
  const health = trpc.wealth.getHealth.useQuery();
  const save = trpc.wealth.saveAsset.useMutation({
    onSuccess: async () => { await utils.wealth.getHealth.invalidate(); reset(); toast.success("บันทึกทรัพย์สินแล้ว"); },
    onError: error => toast.error(error.message),
  });
  const remove = trpc.wealth.deleteAsset.useMutation({
    onSuccess: async () => { await utils.wealth.getHealth.invalidate(); toast.success("ลบรายการแล้ว"); },
    onError: error => toast.error(error.message),
  });
  const [editing, setEditing] = useState<Asset | null>(null);
  const [category, setCategory] = useState<Category>("cash");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const reset = () => { setEditing(null); setCategory("cash"); setName(""); setAmount(""); setNote(""); };
  const data = health.data;
  const assets = data?.assets ?? [];
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(amount);
    if (!name.trim() || !Number.isFinite(value) || value <= 0) { toast.error("กรอกชื่อและมูลค่าทรัพย์สินให้ถูกต้อง"); return; }
    save.mutate({ ...(editing ? { id: editing.id } : {}), category, name: name.trim(), amount: value, note });
  };
  const startEdit = (asset: Asset) => { setEditing(asset); setCategory(asset.category); setName(asset.name); setAmount(String(asset.amount)); setNote(asset.note ?? ""); };
  const scoreLabel = useMemo(() => {
    if (!data || data.scoreStatus !== "available") return "ยังประเมินคะแนนไม่ได้";
    if (data.score >= 80) return "สุขภาพการเงินดี";
    if (data.score >= 60) return "สุขภาพการเงินปานกลาง";
    if (data.score >= 40) return "ควรปรับปรุง";
    return "ควรเร่งจัดการ";
  }, [data]);
  return <div className="space-y-6">
    <header>
      <div className="text-xs tracking-widest text-slate-500">PERSONAL FINANCIAL HEALTH</div>
      <h1 className="mt-1 text-2xl font-bold">สุขภาพทางการเงิน</h1>
      <p className="mt-1 text-sm text-slate-500">บันทึกมูลค่าทรัพย์สินและติดตามความมั่งคั่งสุทธิของคุณ</p>
    </header>
    {health.isLoading ? <div className="rounded-2xl border bg-white p-8 text-center text-slate-500">กำลังโหลดข้อมูล...</div> : <>
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="rounded-2xl border bg-white p-4"><div className="flex items-center gap-2 text-sm text-slate-500"><Wallet size={17}/>สินทรัพย์รวม</div><div className="mt-2 text-xl font-bold">{money(data?.totalAssets ?? 0)}</div></div>
        <div className="rounded-2xl border bg-white p-4"><div className="flex items-center gap-2 text-sm text-slate-500"><Wallet size={17}/>เงินสด</div><div className="mt-2 text-xl font-bold">{data?.sheetBalances?.available ? money(data.sheetBalances.cash) : "—"}</div><div className="mt-1 text-xs text-slate-400">{data?.sheetBalances?.available ? "ยอดจริงจาก Google Sheets" : "ยังอ่านยอดจาก Google Sheets ไม่ได้"}</div></div>
        <div className="rounded-2xl border bg-white p-4"><div className="flex items-center gap-2 text-sm text-slate-500"><Landmark size={17}/>เงินฝาก</div><div className="mt-2 text-xl font-bold">{data?.sheetBalances?.available ? money(data.sheetBalances.bank) : "—"}</div><div className="mt-1 text-xs text-slate-400">{data?.sheetBalances?.available ? "รวมบัญชีธนาคารทั้งหมดจาก Google Sheets" : "ยังอ่านยอดจาก Google Sheets ไม่ได้"}</div></div>
        <div className="rounded-2xl border bg-white p-4"><div className="flex items-center gap-2 text-sm text-slate-500"><Landmark size={17}/>หนี้สินคงเหลือ</div><div className="mt-2 text-xl font-bold">{money(data?.totalLiabilities ?? 0)}</div><div className="mt-1 text-xs text-slate-400">อ้างอิงยอดหนี้ที่มีในระบบสัญญา</div></div>
        <div className="rounded-2xl border bg-white p-4"><div className="flex items-center gap-2 text-sm text-slate-500"><Activity size={17}/>ความมั่งคั่งสุทธิ</div><div className={`mt-2 text-xl font-bold ${(data?.netWorth ?? 0) < 0 ? "text-rose-600" : "text-emerald-700"}`}>{money(data?.netWorth ?? 0)}</div><div className="mt-1 text-xs text-slate-400">สินทรัพย์รวม − หนี้สินรวม</div></div>
        <div className="rounded-2xl border bg-white p-4"><div className="flex items-center gap-2 text-sm text-slate-500"><ShieldCheck size={17}/>คะแนนสุขภาพการเงิน</div><div className="mt-2 text-xl font-bold">{data?.scoreStatus === "available" ? `${data.score}/100` : "—"}</div><div className="mt-1 text-xs text-slate-500">{scoreLabel}</div></div>
      </section>
      <section className="rounded-2xl border bg-white p-4 sm:p-5 space-y-3">
        <div className="font-semibold">{editing ? "แก้ไขทรัพย์สิน" : "เพิ่มทรัพย์สิน"}</div>
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm space-y-1"><span className="block">ประเภททรัพย์สิน</span><select value={category} onChange={e=>setCategory(e.target.value as Category)} className="w-full rounded-lg border p-2.5">{categories.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="text-sm space-y-1"><span className="block">ชื่อรายการ</span><input value={name} onChange={e=>setName(e.target.value)} className="w-full rounded-lg border p-2.5" placeholder="เช่น เงินสดในกระเป๋า / รถยนต์" required maxLength={160}/></label>
          <label className="text-sm space-y-1"><span className="block">มูลค่าปัจจุบัน (บาท)</span><input type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} className="w-full rounded-lg border p-2.5" placeholder="0.00" required/></label>
          <label className="text-sm space-y-1"><span className="block">หมายเหตุ (ไม่บังคับ)</span><input value={note} onChange={e=>setNote(e.target.value)} className="w-full rounded-lg border p-2.5" placeholder="รายละเอียดเพิ่มเติม" maxLength={1000}/></label>
          <div className="sm:col-span-2 flex flex-wrap gap-2"><button disabled={save.isPending} className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"><Plus size={16} className="inline mr-1"/>{save.isPending ? "กำลังบันทึก..." : editing ? "บันทึกการแก้ไข" : "เพิ่มทรัพย์สิน"}</button>{editing && <button type="button" onClick={reset} className="rounded-lg border px-4 py-2.5 text-sm"><X size={16} className="inline mr-1"/>ยกเลิก</button>}</div>
        </form>
      </section>
      <section className="rounded-2xl border bg-white overflow-hidden">
        <div className="flex items-center justify-between border-b p-4"><h2 className="font-semibold">รายการทรัพย์สิน</h2><span className="text-xs text-slate-500">{assets.length} รายการ</span></div>
        {assets.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">ยังไม่มีข้อมูลทรัพย์สิน เพิ่มรายการแรกด้านบน</div> : <div className="divide-y">{assets.map((asset: Asset)=><div key={asset.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="min-w-0 flex-1"><div className="font-medium">{asset.name}</div><div className="mt-1 text-xs text-slate-500">{categories.find(item=>item.value===asset.category)?.label}{asset.note ? " · "+asset.note : ""}</div></div><div className="font-semibold">{money(asset.amount)}</div><div className="flex gap-1"><button type="button" onClick={()=>startEdit(asset)} className="rounded-lg border p-2" aria-label="แก้ไข"><Pencil size={16}/></button><button type="button" onClick={()=>{if(confirm("ยืนยันลบรายการทรัพย์สินนี้?")) remove.mutate({id:asset.id});}} className="rounded-lg border p-2 text-rose-600" aria-label="ลบ"><Trash2 size={16}/></button></div></div>)}</div>}
      </section>
      <section className="rounded-xl border border-sky-100 bg-sky-50 p-4 text-xs leading-relaxed text-sky-900 space-y-1">
        <div className="font-semibold">เกณฑ์คะแนน 0–100 (ประเมินเบื้องต้น)</div>
        <p>สัดส่วนหนี้ต่อสินทรัพย์: สูงสุด 60 คะแนน และสัดส่วนเงินสด/เงินฝากต่อสินทรัพย์: สูงสุด 40 คะแนน</p>
        <p>คะแนนนี้ยังไม่รวมอัตราการออมและเงินสำรองฉุกเฉิน จึงเป็นคะแนนเบื้องต้น ไม่ใช่คำแนะนำการลงทุน</p>
        <p>หนี้สินคำนวณจากยอดหนี้คงเหลือฝั่งเจ้าหนี้ในระบบสัญญา หากมีหนี้ที่บันทึกนอกระบบ ต้องเพิ่มข้อมูลหนี้ส่วนนั้นในระบบก่อนเพื่อให้ยอดครบถ้วน</p>
      </section>
    </>}
  </div>;
}
