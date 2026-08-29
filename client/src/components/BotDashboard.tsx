// Style: Siam Ledger — ink-and-paper financial console with explicit intent boundaries, sharp editorial hierarchy, amber signals, and no fabricated balances.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Bot,
  Camera,
  CircleDollarSign,
  DatabaseZap,
  FileText,
  Landmark,
  LoaderCircle,
  Plus,
  RefreshCw,
  ScanLine,
  Send,
  TrendingDown,
  TrendingUp,
  Upload,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import "./bot-dashboard.css";
import IndividualLedger, { type LedgerLink } from "./IndividualLedger";

type TodayItem = { item: string; type: "รายรับ" | "รายจ่าย"; amount: number };
type AccountBalance = { name: string; amount: number };
type BalanceData = {
  formattedDate: string;
  summarySheet: string;
  todayItems: TodayItem[];
  dailyIncome: number;
  dailyExpense: number;
  accountBalances: AccountBalance[];
  balance: number;
};
type MonthlyData = { month: string; monthlyIncome: number; monthlyExpense: number; netMonthly: number };
type Intent = "income" | "expense" | "buy" | "sell" | "query" | "ocr" | null;

const money = (amount: number) => new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", minimumFractionDigits: 2 }).format(Number(amount || 0));

function IntentButton({ active, icon: Icon, label, caption, onClick }: { active: boolean; icon: typeof Bot; label: string; caption: string; onClick: () => void }) {
  return <button className={`intent-button ${active ? "is-selected" : ""}`} onClick={onClick}><Icon size={17} /><span><b>{label}</b><small>{caption}</small></span></button>;
}

export default function BotDashboard() {
  const [customApiUrl, setCustomApiUrl] = useState<string>(() => {
    return (
      localStorage.getItem("bot_backend_url") ||
      import.meta.env.VITE_BACKEND_API_URL ||
      "https://income-expense-docker-274212739997.asia-southeast3.run.app"
    );
  });
  const [authToken, setAuthToken] = useState<string>(() => {
    return localStorage.getItem("bot_auth_token") || "";
  });
  const [showConfig, setShowConfig] = useState(false);

  const apiBase = customApiUrl.replace(/\/$/, "");

  const apiRequest = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const headers: Record<string, string> = {
        ...(init?.headers as Record<string, string>),
      };
      if (authToken) {
        headers["Authorization"] = authToken.startsWith("Bearer ")
          ? authToken
          : `Bearer ${authToken}`;
      }
      const response = await fetch(`${apiBase}${path}`, {
        ...init,
        headers,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error("403 Forbidden: Cloud Run ต้องการ Invoker Permission หรือ Bearer ID Token");
        }
        throw new Error(payload.error || `HTTP ${response.status}: ระบบหลังบ้านไม่สามารถตอบกลับได้`);
      }
      return payload as T;
    },
    [apiBase, authToken]
  );

  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [monthly, setMonthly] = useState<MonthlyData | null>(null);
  const [intent, setIntent] = useState<Intent>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [entry, setEntry] = useState({ item: "", amount: "", category: "ทั่วไป", account: "เงินสด" });
  const [investment, setInvestment] = useState({ assetName: "", assetType: "หุ้น", quantity: "", pricePerUnit: "", account: "เงินสด", note: "" });
  const [query, setQuery] = useState("");
  const [ocrFile, setOcrFile] = useState<File | null>(null);
  const [ledgerLink, setLedgerLink] = useState<LedgerLink | null>(null);
  const [ledgerRefreshSignal, setLedgerRefreshSignal] = useState(0);

  const disconnected = !apiBase;
  const accountTotal = useMemo(() => (balance?.accountBalances || []).reduce((sum, account) => sum + Number(account.amount || 0), 0), [balance]);

  const loadSummaries = useCallback(async () => {
    if (disconnected) return;
    setIsLoading(true); setError("");
    const [balanceResult, monthlyResult] = await Promise.allSettled([
      apiRequest<{ data: BalanceData }>("/api/summary/balance"),
      apiRequest<{ data: MonthlyData }>("/api/summary/monthly"),
    ]);
    if (balanceResult.status === "fulfilled") setBalance(balanceResult.value.data);
    if (monthlyResult.status === "fulfilled") setMonthly(monthlyResult.value.data);
    const failure = balanceResult.status === "rejected" ? balanceResult.reason : monthlyResult.status === "rejected" ? monthlyResult.reason : null;
    if (failure) setError(failure instanceof Error ? failure.message : "ไม่สามารถโหลดข้อมูลจาก BotDashboard ได้");
    setIsLoading(false);
  }, [disconnected, apiRequest]);

  useEffect(() => { void loadSummaries(); }, [loadSummaries]);

  const saveConfig = (url: string, token: string) => {
    setCustomApiUrl(url);
    setAuthToken(token);
    localStorage.setItem("bot_backend_url", url);
    localStorage.setItem("bot_auth_token", token);
    toast.success("บันทึกการตั้งค่า Backend URL แล้ว");
  };

  const openIntent = (next: Intent) => { setIntent(next); setNotice(""); setError(""); };
  const runOperation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (disconnected) { setError("ตั้งค่า VITE_BACKEND_API_URL ก่อนเชื่อมต่อคำสั่ง Bot"); return; }
    try {
      setIsLoading(true); setError("");
      if (intent === "income" || intent === "expense") {
        const result = await apiRequest<{ message: string }>("/api/operations/transactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...entry, type: intent, amount: Number(entry.amount), partyId: ledgerLink?.partyId, contractId: ledgerLink?.contractId }) });
        setNotice(result.message); setEntry({ item: "", amount: "", category: "ทั่วไป", account: "เงินสด" });
        if (ledgerLink) setLedgerRefreshSignal((signal) => signal + 1);
      }
      if (intent === "buy" || intent === "sell") {
        const result = await apiRequest<{ message: string }>("/api/operations/investments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...investment, action: intent === "buy" ? "ซื้อ" : "ขาย", quantity: Number(investment.quantity), pricePerUnit: Number(investment.pricePerUnit) }) });
        setNotice(result.message); setInvestment({ assetName: "", assetType: "หุ้น", quantity: "", pricePerUnit: "", account: "เงินสด", note: "" });
      }
      if (intent === "query") {
        const result = await apiRequest<{ answer: string }>("/api/operations/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
        setNotice(result.answer); setQuery("");
      }
      if (intent === "ocr") {
        if (!ocrFile) throw new Error("กรุณาเลือกไฟล์รูปใบเสร็จก่อนส่ง");
        const form = new FormData(); form.append("image", ocrFile);
        const result = await apiRequest<{ message?: string; text?: string }>("/api/ocr/scan", { method: "POST", body: form });
        setNotice(result.message || result.text || "OCR ประมวลผลเสร็จแล้ว"); setOcrFile(null);
      }
      toast.success("ส่งคำสั่งไปยัง Bot เรียบร้อย");
      await loadSummaries();
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "ไม่สามารถส่งคำสั่งได้";
      setError(message); toast.error(message);
    } finally { setIsLoading(false); }
  };

  return <section className="bot-dashboard">
    <div className="bot-intro">
      <div><span className="section-index">05 / BOT CONTROL</span><h2>Bot Dashboard</h2><p>แยกผลลัพธ์ตาม Intent ชัดเจน: <b>เช็คยอด</b> สำหรับสถานะวันนี้และบัญชี, <b>สรุปรายเดือน</b> สำหรับผลรวมของเดือน</p></div>
      <div className={`connection-chip ${disconnected ? "is-offline" : ""}`}><i />{disconnected ? "รอเชื่อม Backend" : "เชื่อม Backend API"}</div>
    </div>

    <div className="summary-toolbar">
      <div>
        <b>ข้อมูลจาก {balance?.summarySheet || "BotDashboard"}</b>
        <small>{balance?.formattedDate || "รอข้อมูลจาก Google Sheets"}</small>
        <span style={{ marginLeft: 8, fontSize: 11, opacity: 0.7, fontFamily: "monospace" }}>
          ({customApiUrl})
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          className="refresh-button"
          onClick={() => setShowConfig(!showConfig)}
          style={{ background: showConfig ? "#2C2927" : undefined }}
        >
          <Bot size={16} />
          {showConfig ? "ปิดตั้งค่า URL" : "ตั้งค่า Service URL"}
        </button>
        <button className="refresh-button" onClick={() => void loadSummaries()} disabled={isLoading || disconnected}>
          {isLoading ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}
          รีเฟรชข้อมูล
        </button>
      </div>
    </div>

    {showConfig && (
      <div style={{ padding: 16, background: "rgba(0,0,0,0.04)", borderRadius: 12, marginBottom: 16, display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, alignItems: "flex-end" }}>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: "bold", marginBottom: 4 }}>Backend API URL (Cloud Run / Docker):</label>
          <input
            type="text"
            value={customApiUrl}
            onChange={(e) => setCustomApiUrl(e.target.value)}
            placeholder="https://income-expense-docker-274212739997.asia-southeast3.run.app"
            style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.15)", fontSize: 12, fontFamily: "monospace" }}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: "bold", marginBottom: 4 }}>Bearer ID Token (ถ้า Cloud Run ปิด Public):</label>
          <input
            type="password"
            value={authToken}
            onChange={(e) => setAuthToken(e.target.value)}
            placeholder="Bearer token หรือเว้นว่าง"
            style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.15)", fontSize: 12, fontFamily: "monospace" }}
          />
        </div>
        <button
          type="button"
          onClick={() => {
            saveConfig(customApiUrl, authToken);
            void loadSummaries();
          }}
          style={{ height: 36, padding: "0 16px", background: "#1C1917", color: "#fff", borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer", border: "none" }}
        >
          บันทึก & รีเฟรช
        </button>
      </div>
    )}

    {error && <div className="bot-alert"><b>การเชื่อมต่อยังไม่พร้อม</b><span>{error}</span>{disconnected && <code>VITE_BACKEND_API_URL=https://your-backend.example</code>}</div>}

    <div className="intent-summary-grid">
      <article className="intent-summary-card balance-card">
        <div className="intent-card-heading"><div><span>INTENT / เช็คยอด</span><h3>ยอดวันนี้และยอดคงเหลือ</h3></div><WalletCards size={22} /></div>
        {balance ? <><div className="daily-metrics"><div><small>รายรับวันนี้</small><strong className="income">{money(balance.dailyIncome)}</strong></div><div><small>รายจ่ายวันนี้</small><strong className="expense">{money(balance.dailyExpense)}</strong></div></div><div className="today-ledger"><div className="ledger-heading"><span>รายการวันนี้</span><b>{balance.todayItems.length} รายการ</b></div>{balance.todayItems.length ? balance.todayItems.map((item, index) => <div className="ledger-row" key={`${item.item}-${index}`}><span className={item.type === "รายรับ" ? "row-income" : "row-expense"}>{item.type === "รายรับ" ? "+" : "−"}</span><b>{item.item}</b><strong>{money(item.amount)}</strong></div>) : <p>ยังไม่มีรายการในวันนี้</p>}</div><div className="account-strip"><div><Landmark size={16} /><span>ยอดรวมทุกบัญชี</span></div><strong>{money(balance.balance || accountTotal)}</strong></div><div className="account-list">{balance.accountBalances.map((account) => <span key={account.name}>{account.name}<b>{money(account.amount)}</b></span>)}</div></> : <div className="summary-empty"><WalletCards size={27} /><b>ยังไม่มีข้อมูลเช็คยอด</b><span>เชื่อม Google Sheets แล้วกดรีเฟรชเพื่อแสดงรายการวันนี้และยอดแต่ละบัญชี</span></div>}
      </article>

      <article className="intent-summary-card monthly-card">
        <div className="intent-card-heading"><div><span>INTENT / สรุปรายเดือน</span><h3>ภาพรวมรายรับและรายจ่าย</h3></div><BarChart3 size={22} /></div>
        {monthly ? <><div className="month-label">{monthly.month}</div><div className="monthly-flow"><div><span className="flow-icon income"><TrendingUp size={17} /></span><div><small>รายรับเดือนนี้</small><strong>{money(monthly.monthlyIncome)}</strong></div></div><div><span className="flow-icon expense"><TrendingDown size={17} /></span><div><small>รายจ่ายเดือนนี้</small><strong>{money(monthly.monthlyExpense)}</strong></div></div></div><div className={`net-total ${monthly.netMonthly >= 0 ? "positive" : "negative"}`}><span>เงินสุทธิเดือนนี้</span><strong>{money(monthly.netMonthly)}</strong></div><p className="intent-note">หน้านี้ไม่แสดงรายการรายวันหรือยอดบัญชี เพื่อให้ Intent <b>สรุปรายเดือน</b> สื่อสารผลรวมของเดือนโดยเฉพาะ</p></> : <div className="summary-empty"><BarChart3 size={27} /><b>ยังไม่มีข้อมูลสรุปรายเดือน</b><span>ข้อมูลจะแสดงเมื่อ Backend อ่าน sheet BotDashboard ได้สำเร็จ</span></div>}
      </article>
    </div>

    <IndividualLedger onLinkChange={setLedgerLink} refreshSignal={ledgerRefreshSignal} />

    <section className="intent-console"><div className="console-heading"><div><span className="section-index">COMMANDS / ALL INTENTS</span><h3>Intent Console</h3><p>ส่งคำสั่งที่รองรับทั้งหมดผ่าน API โดยไม่เปิดเผย Google credentials ใน browser</p></div><DatabaseZap size={23} /></div><div className="intent-button-grid"><IntentButton active={intent === "income"} icon={CircleDollarSign} label="บันทึกรายรับ" caption="Income" onClick={() => openIntent("income")} /><IntentButton active={intent === "expense"} icon={TrendingDown} label="บันทึกรายจ่าย" caption="Expense" onClick={() => openIntent("expense")} /><IntentButton active={intent === "buy"} icon={TrendingUp} label="บันทึกการซื้อ" caption="Buy investment" onClick={() => openIntent("buy")} /><IntentButton active={intent === "sell"} icon={TrendingDown} label="บันทึกการขาย" caption="Sell investment" onClick={() => openIntent("sell")} /><IntentButton active={intent === "query"} icon={Bot} label="AI Analyst" caption="QueryExcel" onClick={() => openIntent("query")} /><IntentButton active={intent === "ocr"} icon={ScanLine} label="อ่านใบเสร็จ" caption="OCR scan" onClick={() => openIntent("ocr")} /></div>
      {intent && <form className="intent-form" onSubmit={runOperation}><div className="form-command-title"><span>{intent === "income" ? "บันทึกรายรับ" : intent === "expense" ? "บันทึกรายจ่าย" : intent === "buy" ? "บันทึกการซื้อ" : intent === "sell" ? "บันทึกการขาย" : intent === "query" ? "ถาม AI Analyst" : "อัปโหลดใบเสร็จ"}</span><button type="button" onClick={() => setIntent(null)}>ปิด</button></div>{(intent === "income" || intent === "expense") && <>{ledgerLink && <div className="intent-ledger-link"><Landmark size={16} /><span>บันทึกเข้าบัญชี <b>{ledgerLink.partyName}</b> / <b>{ledgerLink.contractTitle}</b></span></div>}<div className="command-fields"><label>รายการ<input required value={entry.item} onChange={(event) => setEntry({ ...entry, item: event.target.value })} placeholder="เช่น ค่าอาหาร" /></label><label>จำนวนเงิน<input required min="0.01" step="0.01" type="number" value={entry.amount} onChange={(event) => setEntry({ ...entry, amount: event.target.value })} placeholder="0.00" /></label><label>หมวดหมู่<input value={entry.category} onChange={(event) => setEntry({ ...entry, category: event.target.value })} /></label><label>บัญชี<input value={entry.account} onChange={(event) => setEntry({ ...entry, account: event.target.value })} /></label></div></>}{(intent === "buy" || intent === "sell") && <div className="command-fields"><label>ชื่อสินทรัพย์<input required value={investment.assetName} onChange={(event) => setInvestment({ ...investment, assetName: event.target.value })} placeholder="เช่น AOT" /></label><label>ประเภท<input value={investment.assetType} onChange={(event) => setInvestment({ ...investment, assetType: event.target.value })} /></label><label>จำนวน<input required min="0.0001" step="any" type="number" value={investment.quantity} onChange={(event) => setInvestment({ ...investment, quantity: event.target.value })} /></label><label>ราคาต่อหน่วย<input required min="0.01" step="0.01" type="number" value={investment.pricePerUnit} onChange={(event) => setInvestment({ ...investment, pricePerUnit: event.target.value })} /></label><label>บัญชี<input value={investment.account} onChange={(event) => setInvestment({ ...investment, account: event.target.value })} /></label><label>บันทึกเพิ่มเติม<input value={investment.note} onChange={(event) => setInvestment({ ...investment, note: event.target.value })} /></label></div>}{intent === "query" && <label className="single-command-field">คำถามสำหรับ AI Analyst<input required value={query} onChange={(event) => setQuery(event.target.value)} placeholder="เช่น เดือนนี้หมวดใดจ่ายสูงสุด" /></label>}{intent === "ocr" && <label className="upload-command-field"><Camera size={18} /><span>รูปใบเสร็จ (PNG, JPG หรือ WEBP)</span><input required accept="image/png,image/jpeg,image/webp" type="file" onChange={(event) => setOcrFile(event.target.files?.[0] || null)} />{ocrFile && <b>{ocrFile.name}</b>}</label>}<button className="command-submit" disabled={isLoading}>{isLoading ? <LoaderCircle className="spin" size={17} /> : intent === "ocr" ? <Upload size={17} /> : <Send size={17} />}{intent === "ocr" ? "ส่งรูปให้ OCR" : "ส่งคำสั่ง"}</button></form>}
      {notice && <div className="operation-result"><FileText size={17} /><p>{notice}</p></div>}
    </section>
  </section>;
}
