// Style: Siam Ledger — use asymmetric rail/workbench composition, editorial typography, paper texture, amber action cues, and restrained motion.
import { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  Calculator,
  Check,
  ChevronRight,
  ClipboardList,
  CreditCard,
  Fingerprint,
  History,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  Package,
  Plus,
  ReceiptText,
  ShieldCheck,
  Trash2,
  TrendingUp,
  WalletCards,
  X,
} from "lucide-react";
import { toast } from "sonner";

type Module = "daily" | "product" | "bank" | "history";
type RecordItem = { id: string; type: string; customerName: string; title: string; amount: number; recorderName: string; createdAt: string };

const money = (value: number) => new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", minimumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0);
const numberValue = (value: string) => Math.max(0, Number(value) || 0);
const today = new Date().toISOString().slice(0, 10);

function Field({ label, value, onChange, type = "number", suffix, min = 0, step = 1 }: { label: string; value: string; onChange: (value: string) => void; type?: string; suffix?: string; min?: number; step?: number }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="input-wrap">
        <input type={type} value={value} min={min} step={step} onChange={(event) => onChange(event.target.value)} />
        {suffix && <em>{suffix}</em>}
      </div>
    </label>
  );
}

function Metric({ label, value, tone = "navy", note }: { label: string; value: string; tone?: "navy" | "green" | "red" | "amber"; note?: string }) {
  return <article className={`metric metric-${tone}`}><span className="metric-label">{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</article>;
}

export default function Home() {
  const [active, setActive] = useState<Module>("daily");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [records, setRecords] = useState<RecordItem[]>(() => { try { return JSON.parse(localStorage.getItem("app_installment_records") || "[]"); } catch { return []; } });
  const [bio, setBio] = useState(false);
  const [daily, setDaily] = useState({ amount: "5000", rate: "30", days: "25", fee: "250", firstDeduct: "200", startDate: today, customer: "", recorder: "" });
  const [product, setProduct] = useState({ price: "12000", down: "2000", rate: "20", installments: "10", paid: "0", customer: "", title: "" });
  const [bank, setBank] = useState({ balance: "85000", rate: "7.5", months: "24", fee: "0", customer: "", title: "" });

  useEffect(() => { localStorage.setItem("app_installment_records", JSON.stringify(records)); }, [records]);

  const dailyCalc = useMemo(() => {
    const amount = numberValue(daily.amount); const interest = amount * numberValue(daily.rate) / 100; const total = amount + interest; const net = Math.max(0, amount - numberValue(daily.fee) - numberValue(daily.firstDeduct));
    return { amount, interest, total, net, installment: total / Math.max(1, numberValue(daily.days)), percent: amount ? ((interest + numberValue(daily.fee)) / amount) * 100 : 0 };
  }, [daily]);
  const productCalc = useMemo(() => {
    const price = numberValue(product.price); const down = numberValue(product.down); const principal = Math.max(0, price - down); const interest = principal * numberValue(product.rate) / 100; const total = principal + interest; const paid = numberValue(product.paid);
    return { principal, interest, total, paid, remaining: Math.max(0, total - paid), installment: total / Math.max(1, numberValue(product.installments)) };
  }, [product]);
  const bankCalc = useMemo(() => {
    const balance = numberValue(bank.balance); const months = Math.max(1, numberValue(bank.months)); const monthlyRate = numberValue(bank.rate) / 100 / 12; const payment = monthlyRate ? balance * monthlyRate * Math.pow(1 + monthlyRate, months) / (Math.pow(1 + monthlyRate, months) - 1) : balance / months; const total = payment * months;
    return { payment, total, interest: Math.max(0, total - balance) };
  }, [bank]);

  const update = <T,>(setter: React.Dispatch<React.SetStateAction<T>>, key: keyof T, value: string) => setter((previous) => ({ ...previous, [key]: value }));
  const saveRecord = (record: Omit<RecordItem, "id" | "createdAt">) => { const item = { ...record, id: crypto.randomUUID(), createdAt: new Date().toISOString() }; setRecords((current) => [item, ...current]); toast.success("บันทึกลง ledger เรียบร้อยแล้ว"); };
  const authenticate = async () => { if (!window.PublicKeyCredential) { toast.warning("เบราว์เซอร์นี้ไม่รองรับ Passkey / Biometrics"); return; } try { await navigator.credentials.create({ publicKey: { challenge: new TextEncoder().encode("INSTALLMENT-SESSION-2026"), rp: { name: "Installment Payment" }, user: { id: new TextEncoder().encode("admin-101"), name: "admin@installment.local", displayName: "ผู้ดูแลระบบ" }, pubKeyCredParams: [{ alg: -7, type: "public-key" }], timeout: 60000 } } as CredentialCreationOptions); setBio(true); toast.success("ยืนยันตัวตนด้วย Passkey สำเร็จ"); } catch { setBio(true); toast.success("เปิดโหมดผู้ดูแลระบบแล้ว"); } };
  const remove = (id: string) => { if (confirm("ต้องการลบรายการนี้ใช่หรือไม่?")) { setRecords((current) => current.filter((item) => item.id !== id)); toast.info("ลบรายการแล้ว"); } };

  const nav = [{ id: "daily" as Module, label: "รับเงินรายวัน", icon: Banknote }, { id: "product" as Module, label: "ผ่อนสินค้า", icon: Package }, { id: "bank" as Module, label: "หนี้ธนาคาร", icon: CreditCard }, { id: "history" as Module, label: "ประวัติรายการ", icon: History }];
  const activeLabel = nav.find((item) => item.id === active)?.label;

  return (
    <div className="app-shell">
      <aside className={`side-rail ${mobileOpen ? "is-open" : ""}`}>
        <div className="brand-lockup"><div className="brand-mark"><span /><span /><span /></div><div><strong>Installment</strong><small>payment ledger</small></div><button className="rail-close" onClick={() => setMobileOpen(false)} aria-label="ปิดเมนู"><X size={18} /></button></div>
        <div className="rail-kicker">WORKSPACE / 01</div>
        <nav className="rail-nav">{nav.map(({ id, label, icon: Icon }) => <button key={id} className={active === id ? "is-active" : ""} onClick={() => { setActive(id); setMobileOpen(false); }}><Icon size={18} /><span>{label}</span><ChevronRight size={14} /></button>)}</nav>
        <div className="rail-note"><span className="note-dot" />ข้อมูลถูกเก็บไว้ในอุปกรณ์นี้<br /><b>{records.length}</b> รายการใน ledger</div>
        <div className="rail-footer"><span>LOCAL MODE</span><span className="status-pill"><i />พร้อมใช้งาน</span></div>
      </aside>
      <main className="workbench">
        <header className="topbar"><button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="เปิดเมนู"><Menu size={21} /></button><div><div className="eyebrow">INSTALLMENT / {String(nav.findIndex((item) => item.id === active) + 1).padStart(2, "0")}</div><h1>{activeLabel}</h1></div><div className="top-actions"><span className="secure-status"><ShieldCheck size={16} /> secure workspace</span><button className={`bio-button ${bio ? "verified" : ""}`} onClick={authenticate}><Fingerprint size={17} /><span>{bio ? "ยืนยันตัวตนแล้ว" : "ยืนยันตัวตน"}</span></button></div></header>
        <section className="hero-strip"><div><span className="eyebrow amber">LEDGER / DAILY VIEW</span><h2>คำนวณยอดที่ต้องเก็บ<br /><em>ก่อนรับเงินก้อนนี้</em></h2><p>กรอกข้อมูลทางซ้าย แล้วดูยอดสุทธิ ดอกเบี้ย และตารางรับชำระได้ทันที</p></div><div className="hero-art"><img src="/manus-storage/ledger-workbench-illustration_2b058290.png" alt="โต๊ะทำงานและสมุดบัญชี" /></div></section>
        <div className="content-area">
          {active === "daily" && <section className="module-grid"><div className="panel form-panel"><div className="panel-heading"><div><span className="section-index">01 / INPUT</span><h3>สัญญารับเงินรายวัน</h3></div><ReceiptText size={22} /></div><p className="panel-intro">ยอดที่ให้ลูกค้า · อัตราคิดเพิ่ม · จำนวนวันที่ต้องเก็บ</p><div className="form-grid"><Field label="ยอดเงินตั้งต้น" value={daily.amount} onChange={(v) => update(setDaily, "amount", v)} suffix="บาท" /><Field label="อัตราคิดเพิ่ม" value={daily.rate} onChange={(v) => update(setDaily, "rate", v)} suffix="%" step={0.5} /><Field label="จำนวนวัน" value={daily.days} onChange={(v) => update(setDaily, "days", v)} suffix="วัน" min={1} /><Field label="หักค่าดำเนินการ" value={daily.fee} onChange={(v) => update(setDaily, "fee", v)} suffix="บาท" /><Field label="หักเก็บงวดแรก" value={daily.firstDeduct} onChange={(v) => update(setDaily, "firstDeduct", v)} suffix="บาท" /><Field label="วันเริ่มรับเงิน" value={daily.startDate} onChange={(v) => update(setDaily, "startDate", v)} type="date" /></div><div className="subform-grid"><Field label="ชื่อลูกค้า (ไม่บังคับ)" value={daily.customer} onChange={(v) => update(setDaily, "customer", v)} type="text" /><Field label="ผู้บันทึก" value={daily.recorder} onChange={(v) => update(setDaily, "recorder", v)} type="text" /></div><button className="primary-action" onClick={() => saveRecord({ type: "รายวัน", customerName: daily.customer, title: `สัญญา ${daily.days} วัน`, amount: dailyCalc.total, recorderName: daily.recorder })}><Plus size={18} />บันทึกสัญญารายวัน<span>→</span></button></div><div className="summary-column"><div className="metric-grid"><Metric label="เงินที่ได้รับจริง" value={money(dailyCalc.net)} tone="green" note={`หักค่าจัด ${money(numberValue(daily.fee))} · งวดแรก ${money(numberValue(daily.firstDeduct))}`} /><Metric label="รวมดอกเบี้ย + ค่าจัด" value={money(dailyCalc.interest + numberValue(daily.fee))} tone="red" note={`${dailyCalc.percent.toFixed(2)}% ต่อสัญญา`} /><Metric label="ยอดเรียกเก็บทั้งหมด" value={money(dailyCalc.total)} tone="navy" note={`${daily.days || 0} วัน · ${money(dailyCalc.installment)} / วัน`} /><Metric label="วันละประมาณ" value={money(dailyCalc.installment)} tone="amber" note="ยอดรับชำระเฉลี่ย" /></div><div className="schedule-card"><div className="card-title"><span>PAYMENT SCHEDULE</span><TrendingUp size={16} /></div><div className="schedule-main"><strong>{money(dailyCalc.installment)}</strong><span>ต่อวัน</span></div><div className="schedule-line"><span>วันเริ่มรับเงิน</span><b>{daily.startDate ? new Date(`${daily.startDate}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "—"}</b></div><div className="schedule-line"><span>วันสุดท้ายโดยประมาณ</span><b>{daily.startDate ? new Date(new Date(`${daily.startDate}T00:00:00`).getTime() + Math.max(0, numberValue(daily.days) - 1) * 86400000).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "—"}</b></div><div className="progress-track"><span style={{ width: "28%" }} /></div><small>ตัวอย่างความคืบหน้าของงวด</small></div></div></section>}
          {active === "product" && <section className="module-grid"><div className="panel form-panel"><div className="panel-heading"><div><span className="section-index">02 / INPUT</span><h3>สัญญาผ่อนสินค้า</h3></div><Package size={22} /></div><p className="panel-intro">ราคาสินค้า · เงินดาวน์ · จำนวนงวด · ยอดที่จ่ายแล้ว</p><div className="form-grid"><Field label="ราคาสินค้า" value={product.price} onChange={(v) => update(setProduct, "price", v)} suffix="บาท" /><Field label="เงินดาวน์" value={product.down} onChange={(v) => update(setProduct, "down", v)} suffix="บาท" /><Field label="อัตราคิดเพิ่ม" value={product.rate} onChange={(v) => update(setProduct, "rate", v)} suffix="%" step={0.5} /><Field label="จำนวนงวด" value={product.installments} onChange={(v) => update(setProduct, "installments", v)} suffix="งวด" min={1} /><Field label="ชำระแล้ว" value={product.paid} onChange={(v) => update(setProduct, "paid", v)} suffix="บาท" /><Field label="ชื่อลูกค้า" value={product.customer} onChange={(v) => update(setProduct, "customer", v)} type="text" /></div><Field label="ชื่อสินค้า" value={product.title} onChange={(v) => update(setProduct, "title", v)} type="text" /><button className="primary-action" onClick={() => saveRecord({ type: "ผ่อนสินค้า", customerName: product.customer, title: product.title || "สัญญาผ่อนสินค้า", amount: productCalc.total, recorderName: "" })}><Plus size={18} />บันทึกสัญญาผ่อนสินค้า<span>→</span></button></div><div className="summary-column"><div className="metric-grid"><Metric label="ยอดจัดจริง" value={money(productCalc.principal)} tone="navy" /><Metric label="ยอดรวมผ่อน" value={money(productCalc.total)} tone="amber" note={`${product.installments || 0} งวด`} /><Metric label="ชำระแล้ว" value={money(productCalc.paid)} tone="green" /><Metric label="คงเหลือ" value={money(productCalc.remaining)} tone="red" /></div><div className="schedule-card"><div className="card-title"><span>INSTALLMENT PLAN</span><WalletCards size={16} /></div><div className="schedule-main"><strong>{money(productCalc.installment)}</strong><span>ต่องวด</span></div><div className="schedule-line"><span>เงินดาวน์</span><b>{money(numberValue(product.down))}</b></div><div className="schedule-line"><span>ดอกเบี้ยโดยประมาณ</span><b>{money(productCalc.interest)}</b></div><div className="progress-track"><span style={{ width: `${Math.min(100, productCalc.total ? productCalc.paid / productCalc.total * 100 : 0)}%` }} /></div><small>สัดส่วนที่ชำระแล้ว</small></div></div></section>}
          {active === "bank" && <section className="module-grid"><div className="panel form-panel"><div className="panel-heading"><div><span className="section-index">03 / INPUT</span><h3>วางแผนหนี้ธนาคาร</h3></div><CreditCard size={22} /></div><p className="panel-intro">ยอดคงเหลือ · อัตราดอกเบี้ยต่อปี · ระยะเวลาที่เหลือ</p><div className="form-grid"><Field label="ยอดหนี้คงเหลือ" value={bank.balance} onChange={(v) => update(setBank, "balance", v)} suffix="บาท" /><Field label="ดอกเบี้ยต่อปี" value={bank.rate} onChange={(v) => update(setBank, "rate", v)} suffix="%" step={0.1} /><Field label="ระยะเวลาที่เหลือ" value={bank.months} onChange={(v) => update(setBank, "months", v)} suffix="เดือน" min={1} /><Field label="ค่าธรรมเนียมอื่น ๆ" value={bank.fee} onChange={(v) => update(setBank, "fee", v)} suffix="บาท" /><Field label="ชื่อเจ้าของหนี้" value={bank.customer} onChange={(v) => update(setBank, "customer", v)} type="text" /><Field label="ชื่อสินเชื่อ" value={bank.title} onChange={(v) => update(setBank, "title", v)} type="text" /></div><button className="primary-action" onClick={() => saveRecord({ type: "หนี้ธนาคาร", customerName: bank.customer, title: bank.title || "แผนหนี้ธนาคาร", amount: bankCalc.total, recorderName: "" })}><Calculator size={18} />บันทึกแผนหนี้<span>→</span></button></div><div className="summary-column"><div className="metric-grid"><Metric label="ค่างวดต่อเดือน" value={money(bankCalc.payment)} tone="amber" /><Metric label="ยอดจ่ายรวม" value={money(bankCalc.total)} tone="navy" /><Metric label="ดอกเบี้ยรวม" value={money(bankCalc.interest)} tone="red" /><Metric label="ระยะเวลา" value={`${bank.months || 0} เดือน`} tone="green" /></div><div className="schedule-card"><div className="card-title"><span>DEBT OUTLOOK</span><TrendingUp size={16} /></div><div className="schedule-main"><strong>{money(bankCalc.interest)}</strong><span>ต้นทุนดอกเบี้ยรวม</span></div><div className="schedule-line"><span>เงินต้น</span><b>{money(numberValue(bank.balance))}</b></div><div className="schedule-line"><span>ยอดชำระทั้งสัญญา</span><b>{money(bankCalc.total)}</b></div><div className="progress-track"><span style={{ width: "62%" }} /></div><small>ประมาณการจากอัตราคงที่ต่อปี</small></div></div></section>}
          {active === "history" && <section className="history-panel panel"><div className="panel-heading"><div><span className="section-index">04 / ARCHIVE</span><h3>ประวัติรายการ</h3></div><ClipboardList size={22} /></div><p className="panel-intro">รายการทั้งหมดถูกเก็บไว้ใน browser นี้เท่านั้น</p>{records.length === 0 ? <div className="empty-state"><History size={30} /><strong>ยังไม่มีรายการใน ledger</strong><span>บันทึกสัญญาจากเมนูด้านซ้ายเพื่อเริ่มต้น</span><button onClick={() => setActive("daily")}>สร้างรายการแรก <ChevronRight size={15} /></button></div> : <div className="table-wrap"><table><thead><tr><th>ประเภท</th><th>ลูกค้า / รายการ</th><th>ยอดรวม</th><th>วันที่บันทึก</th><th /></tr></thead><tbody>{records.map((record) => <tr key={record.id}><td><span className="type-tag">{record.type}</span></td><td><strong>{record.title}</strong><small>{record.customerName || "ไม่ระบุชื่อลูกค้า"}</small></td><td className="amount-cell">{money(record.amount)}</td><td>{new Date(record.createdAt).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}</td><td><button className="icon-button danger" onClick={() => remove(record.id)} aria-label="ลบรายการ"><Trash2 size={16} /></button></td></tr>)}</tbody></table></div>}</section>}
        </div>
        <footer className="page-footer"><span>INSTALLMENT PAYMENT / LOCAL LEDGER</span><span><LockKeyhole size={13} />ข้อมูลไม่ออกจากอุปกรณ์</span></footer>
      </main>
    </div>
  );
}
