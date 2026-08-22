// Style: Siam Ledger — an ink-and-paper personal ledger that keeps people, contracts, and transaction schedules visibly separated.
import { useEffect, useMemo, useState } from "react";
import { BellRing, CalendarDays, CheckCircle2, ChevronRight, CircleAlert, Landmark, LoaderCircle, LogIn, Plus, ReceiptText, RefreshCw, UsersRound, WalletCards, X } from "lucide-react";
import { toast } from "sonner";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import "./individual-ledger.css";

type Role = "debtor" | "creditor";
type Party = { partyId: string; displayName: string; role: Role; phone: string; note: string; status: string };
type Contract = { contractId: string; partyId: string; title: string; principal: number | string; interestRate: number | string; installmentCount: number | string; startDate: string; status: string };
type LedgerTransaction = { transactionId: string; contractId: string; partyId: string; type: "scheduled" | "disbursement" | "payment" | "adjustment"; amount: number | string; dueDate: string; paidAt: string; source: string; note: string };
type PartyLedger = { party: Party; contracts: Contract[]; transactions: LedgerTransaction[] };
type ContractLedger = { party: Party | null; contract: Contract; transactions: LedgerTransaction[] };
type ScheduleStatus = "overdue" | "today" | "soon" | "scheduled" | "settled" | "activity" | "unplanned";
type ScheduleFilter = "all" | ScheduleStatus;
type TransactionKind = "disbursement" | "payment" | "adjustment";

export type LedgerLink = { partyId: string; contractId: string; partyName: string; contractTitle: string };

const money = (value: number | string) => new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", minimumFractionDigits: 2 }).format(Number(value || 0));
const roleLabel: Record<Role, string> = { debtor: "ลูกหนี้", creditor: "เจ้าหนี้" };
const transactionLabel: Record<LedgerTransaction["type"], string> = { scheduled: "กำหนดชำระ", disbursement: "จ่ายออก", payment: "รับชำระ", adjustment: "ปรับปรุง" };
const statusLabel: Record<ScheduleStatus, string> = { overdue: "ค้างชำระ", today: "ครบกำหนดวันนี้", soon: "ใกล้ครบกำหนด", scheduled: "รอถึงกำหนด", settled: "ชำระแล้ว", activity: "รายการประกอบ", unplanned: "ไม่ระบุวัน" };
const todayDate = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });

function dueDateStamp(value: string) {
  const matched = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return matched ? matched[0] : "";
}

function scheduleStatus(transaction: LedgerTransaction): ScheduleStatus {
  if (transaction.type !== "scheduled") return "activity";
  if (transaction.paidAt) return "settled";
  const due = dueDateStamp(transaction.dueDate);
  if (!due) return "unplanned";
  const difference = Math.round((Date.parse(`${due}T00:00:00+07:00`) - Date.parse(`${todayDate()}T00:00:00+07:00`)) / 86_400_000);
  if (difference < 0) return "overdue";
  if (difference === 0) return "today";
  if (difference <= 3) return "soon";
  return "scheduled";
}

function nextMonthDate(startDate: string, index: number) {
  const [year, month, day] = startDate.split("-").map(Number);
  const base = new Date(Date.UTC(year, month - 1 + index, day));
  return base.toISOString().slice(0, 10);
}

function requestError(error: unknown) {
  return error instanceof Error ? error.message : "ไม่สามารถดำเนินการกับข้อมูลได้";
}

export default function IndividualLedger({ onLinkChange, refreshSignal = 0 }: { onLinkChange: (link: LedgerLink | null) => void; refreshSignal?: number }) {
  const { loading: authLoading, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const [role, setRole] = useState<Role>("debtor");
  const [selectedPartyId, setSelectedPartyId] = useState("");
  const [selectedContractId, setSelectedContractId] = useState("");
  const [scheduleFilter, setScheduleFilter] = useState<ScheduleFilter>("all");
  const [partyFormOpen, setPartyFormOpen] = useState(false);
  const [contractFormOpen, setContractFormOpen] = useState(false);
  const [transactionFormOpen, setTransactionFormOpen] = useState(false);
  const [partyForm, setPartyForm] = useState({ displayName: "", phone: "", note: "" });
  const [contractForm, setContractForm] = useState({ title: "", principal: "", interestRate: "0", installmentCount: "1", startDate: todayDate() });
  const [transactionForm, setTransactionForm] = useState({ type: "payment" as TransactionKind, amount: "", note: "" });

  const partyListQuery = trpc.ledger.listParties.useQuery(role, { enabled: isAuthenticated });
  const partyQuery = trpc.ledger.getParty.useQuery({ id: selectedPartyId || "unselected" }, { enabled: isAuthenticated && Boolean(selectedPartyId) });
  const contractQuery = trpc.ledger.getContract.useQuery({ id: selectedContractId || "unselected" }, { enabled: isAuthenticated && Boolean(selectedContractId) });
  const partyMutation = trpc.ledger.createParty.useMutation();
  const contractMutation = trpc.ledger.createContract.useMutation();
  const transactionMutation = trpc.ledger.createTransaction.useMutation();
  const paymentMutation = trpc.ledger.markSchedulePaid.useMutation();

  const parties = (partyListQuery.data || []) as Party[];
  const partyLedger = (partyQuery.data || null) as PartyLedger | null;
  const contractLedger = (contractQuery.data || null) as ContractLedger | null;
  const selectedContract = partyLedger?.contracts.find(contract => contract.contractId === selectedContractId) || null;
  const isBusy = partyListQuery.isFetching || partyQuery.isFetching || contractQuery.isFetching || partyMutation.isPending || contractMutation.isPending || transactionMutation.isPending || paymentMutation.isPending;
  const error = [partyListQuery.error, partyQuery.error, contractQuery.error, partyMutation.error, contractMutation.error, transactionMutation.error, paymentMutation.error].find(Boolean);

  const contractTransactions = contractLedger?.transactions || [];
  const scheduleCounts = useMemo(() => contractTransactions.reduce<Record<ScheduleStatus, number>>((counts, transaction) => {
    counts[scheduleStatus(transaction)] += 1;
    return counts;
  }, { overdue: 0, today: 0, soon: 0, scheduled: 0, settled: 0, activity: 0, unplanned: 0 }), [contractTransactions]);
  const alerts = useMemo(() => contractTransactions
    .filter(transaction => ["overdue", "today", "soon"].includes(scheduleStatus(transaction)))
    .sort((first, second) => (dueDateStamp(first.dueDate) || "9999-12-31").localeCompare(dueDateStamp(second.dueDate) || "9999-12-31")), [contractTransactions]);
  const visibleTransactions = useMemo(() => scheduleFilter === "all" ? contractTransactions : contractTransactions.filter(transaction => scheduleStatus(transaction) === scheduleFilter), [contractTransactions, scheduleFilter]);

  const refreshLedger = async () => {
    await Promise.all([
      utils.ledger.listParties.invalidate(role),
      selectedPartyId ? utils.ledger.getParty.invalidate({ id: selectedPartyId }) : Promise.resolve(),
      selectedContractId ? utils.ledger.getContract.invalidate({ id: selectedContractId }) : Promise.resolve(),
    ]);
  };

  useEffect(() => {
    if (isAuthenticated && refreshSignal > 0) void refreshLedger();
    // refreshSignal intentionally causes an explicit re-read after external command flows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal, isAuthenticated]);

  const switchRole = (nextRole: Role) => {
    setRole(nextRole);
    setSelectedPartyId("");
    setSelectedContractId("");
    setScheduleFilter("all");
    onLinkChange(null);
  };

  const selectParty = (partyId: string) => {
    setSelectedPartyId(partyId);
    setSelectedContractId("");
    setScheduleFilter("all");
    onLinkChange(null);
  };

  const selectContract = (contract: Contract) => {
    setSelectedContractId(contract.contractId);
    setScheduleFilter("all");
    if (partyLedger) onLinkChange({ partyId: partyLedger.party.partyId, contractId: contract.contractId, partyName: partyLedger.party.displayName, contractTitle: contract.title });
  };

  const submitParty = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    partyMutation.mutate({ ...partyForm, role }, {
      onSuccess: async party => {
        setPartyForm({ displayName: "", phone: "", note: "" });
        setPartyFormOpen(false);
        if (party) setSelectedPartyId(party.partyId);
        await utils.ledger.listParties.invalidate(role);
        toast.success("บันทึกคู่สัญญาในฐานข้อมูลแล้ว");
      },
      onError: mutationError => toast.error(requestError(mutationError)),
    });
  };

  const submitContract = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!partyLedger) return;
    const principal = Number(contractForm.principal);
    const interestRate = Number(contractForm.interestRate || 0);
    const installmentCount = Number(contractForm.installmentCount);
    if (!(principal > 0) || !Number.isInteger(installmentCount) || installmentCount < 1) {
      toast.error("โปรดระบุยอดเงินและจำนวนงวดให้ถูกต้อง");
      return;
    }
    const installmentAmount = (principal * (1 + interestRate / 100)) / installmentCount;
    const schedules = Array.from({ length: installmentCount }, (_, index) => ({ installmentNo: index + 1, dueDate: nextMonthDate(contractForm.startDate, index), amount: Number(installmentAmount.toFixed(2)), note: `งวดที่ ${index + 1}` }));
    contractMutation.mutate({ partyId: partyLedger.party.partyId, title: contractForm.title, principal, interestRate, installmentCount, startDate: contractForm.startDate, schedules }, {
      onSuccess: async result => {
        setContractForm({ title: "", principal: "", interestRate: "0", installmentCount: "1", startDate: todayDate() });
        setContractFormOpen(false);
        await utils.ledger.getParty.invalidate({ id: partyLedger.party.partyId });
        if (result) setSelectedContractId(result.contract.contractId);
        toast.success("บันทึกสัญญาและตารางกำหนดชำระแล้ว");
      },
      onError: mutationError => toast.error(requestError(mutationError)),
    });
  };

  const submitTransaction = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!partyLedger) return;
    const amount = Number(transactionForm.amount);
    if (!(amount > 0)) {
      toast.error("โปรดระบุจำนวนเงินที่มากกว่า 0");
      return;
    }
    transactionMutation.mutate({ partyId: partyLedger.party.partyId, contractId: selectedContractId || undefined, type: transactionForm.type, amount, source: "web-ledger", note: transactionForm.note }, {
      onSuccess: async () => {
        setTransactionForm({ type: "payment", amount: "", note: "" });
        setTransactionFormOpen(false);
        await refreshLedger();
        toast.success("บันทึกธุรกรรมในฐานข้อมูลแล้ว");
      },
      onError: mutationError => toast.error(requestError(mutationError)),
    });
  };

  const markSchedulePaid = (transaction: LedgerTransaction) => {
    const scheduleId = transaction.transactionId.replace(/^schedule:/, "");
    if (!scheduleId || scheduleId === transaction.transactionId) return;
    paymentMutation.mutate({ scheduleId, paidAmount: Number(transaction.amount), source: "web-ledger" }, {
      onSuccess: async () => {
        await refreshLedger();
        toast.success("บันทึกการชำระงวดแล้ว");
      },
      onError: mutationError => toast.error(requestError(mutationError)),
    });
  };

  return <section className="individual-ledger" aria-label="บัญชีรายบุคคล">
    <div className="individual-ledger-heading">
      <div><span className="section-index">06 / PERSISTENT INDIVIDUAL LEDGER</span><h3>บัญชีคู่สัญญารายบุคคล</h3><p>ข้อมูลคู่สัญญา สัญญา งวดชำระ และธุรกรรมจะถูกบันทึกอย่างถาวรในฐานข้อมูล และแยกตามบัญชีผู้ใช้งาน</p></div>
      <div className="ledger-heading-actions">
        <button className="ledger-refresh" type="button" disabled={!isAuthenticated || isBusy} onClick={() => void refreshLedger()}>{isBusy ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}ซิงก์ธุรกรรม</button>
        <button className="ledger-create" type="button" disabled={!isAuthenticated} onClick={() => setPartyFormOpen(current => !current)}><Plus size={16} />เพิ่มคู่สัญญา</button>
      </div>
    </div>

    {authLoading && <div className="ledger-not-ready"><LoaderCircle className="spin" size={19} /><div><b>กำลังตรวจสอบสิทธิ์การเข้าถึง</b><span>กำลังเตรียมฐานข้อมูลส่วนตัวของคุณ</span></div></div>}
    {!authLoading && !isAuthenticated && <div className="ledger-not-ready"><Landmark size={19} /><div><b>เข้าสู่ระบบก่อนใช้ฐานข้อมูลถาวร</b><span>ข้อมูลการเงินถูกแยกตามบัญชีผู้ใช้ เพื่อไม่ให้ข้อมูลของแต่ละคนปะปนกัน</span></div><button type="button" className="ledger-login" onClick={startLogin}><LogIn size={15} />เข้าสู่ระบบ</button></div>}
    {error && <div className="ledger-error">{requestError(error)}</div>}

    {isAuthenticated && <>
      {partyFormOpen && <form className="ledger-entry-panel" onSubmit={submitParty}>
        <div className="ledger-entry-heading"><UsersRound size={17} /><span>เพิ่ม{roleLabel[role]}ในฐานข้อมูล</span><button type="button" onClick={() => setPartyFormOpen(false)} aria-label="ปิดฟอร์ม"><X size={16} /></button></div>
        <label>ชื่อคู่สัญญา<input value={partyForm.displayName} onChange={event => setPartyForm(current => ({ ...current, displayName: event.target.value }))} required /></label>
        <label>โทรศัพท์<input value={partyForm.phone} onChange={event => setPartyForm(current => ({ ...current, phone: event.target.value }))} /></label>
        <label className="ledger-entry-wide">บันทึกเพิ่มเติม<input value={partyForm.note} onChange={event => setPartyForm(current => ({ ...current, note: event.target.value }))} /></label>
        <button type="submit" className="ledger-submit" disabled={partyMutation.isPending}>{partyMutation.isPending ? "กำลังบันทึก…" : `บันทึก${roleLabel[role]}`}</button>
      </form>}

      <div className="ledger-role-tabs" role="tablist" aria-label="ประเภทคู่สัญญา">
        {(["debtor", "creditor"] as Role[]).map(item => <button key={item} type="button" role="tab" aria-selected={role === item} className={role === item ? "is-active" : ""} onClick={() => switchRole(item)}><UsersRound size={16} />{roleLabel[item]}<span>{role === item ? "บัญชีที่เลือก" : "สลับรายการ"}</span></button>)}
      </div>

      <div className="ledger-workbench">
        <div className="party-column"><div className="ledger-column-heading"><span>01</span><b>{roleLabel[role]}ทั้งหมด</b><small>{parties.length} ราย</small></div>{parties.length ? <div className="party-list">{parties.map(party => <button type="button" key={party.partyId} className={party.partyId === selectedPartyId ? "party-card is-selected" : "party-card"} onClick={() => selectParty(party.partyId)}><span className="party-initial">{party.displayName.slice(0, 1)}</span><span><b>{party.displayName}</b><small>{party.phone || "ไม่ระบุเบอร์โทร"}</small></span><ChevronRight size={16} /></button>)}</div> : <div className="ledger-empty">{partyListQuery.isFetching ? "กำลังอ่านข้อมูลคู่สัญญา…" : `ยังไม่มี${roleLabel[role]}ในฐานข้อมูล`}</div>}</div>
        <div className="contract-column"><div className="ledger-column-heading"><span>02</span><b>สัญญาของบุคคลนี้</b><small>{partyLedger?.contracts.length || 0} สัญญา</small></div>{partyLedger ? <><div className="party-identity"><span>{partyLedger.party.displayName}</span><small>{partyLedger.party.note || "ไม่มีบันทึกเพิ่มเติม"}</small><button type="button" className="inline-create" onClick={() => setContractFormOpen(current => !current)}><Plus size={14} />เพิ่มสัญญา</button></div>{partyLedger.contracts.length ? <div className="contract-list">{partyLedger.contracts.map(contract => <button type="button" key={contract.contractId} className={contract.contractId === selectedContractId ? "contract-card is-selected" : "contract-card"} onClick={() => selectContract(contract)}><span><b>{contract.title}</b><small>{contract.installmentCount} งวด · เริ่ม {contract.startDate}</small></span><strong>{money(contract.principal)}</strong></button>)}</div> : <div className="ledger-empty">ยังไม่มีสัญญาของบุคคลนี้</div>}</> : <div className="ledger-empty">เลือก{roleLabel[role]}เพื่อดูสัญญาเฉพาะราย</div>}</div>
      </div>

      {contractFormOpen && partyLedger && <form className="ledger-entry-panel contract-entry-panel" onSubmit={submitContract}>
        <div className="ledger-entry-heading"><ReceiptText size={17} /><span>เพิ่มสัญญาสำหรับ {partyLedger.party.displayName}</span><button type="button" onClick={() => setContractFormOpen(false)} aria-label="ปิดฟอร์ม"><X size={16} /></button></div>
        <label>ชื่อสัญญา<input value={contractForm.title} onChange={event => setContractForm(current => ({ ...current, title: event.target.value }))} placeholder="เช่น สัญญาผ่อนสินค้า" required /></label>
        <label>ยอดเงินต้น<input type="number" min="0.01" step="0.01" value={contractForm.principal} onChange={event => setContractForm(current => ({ ...current, principal: event.target.value }))} required /></label>
        <label>อัตราคิดเพิ่ม (%)<input type="number" min="0" step="0.01" value={contractForm.interestRate} onChange={event => setContractForm(current => ({ ...current, interestRate: event.target.value }))} required /></label>
        <label>จำนวนงวด<input type="number" min="1" step="1" value={contractForm.installmentCount} onChange={event => setContractForm(current => ({ ...current, installmentCount: event.target.value }))} required /></label>
        <label>วันเริ่มสัญญา<input type="date" value={contractForm.startDate} onChange={event => setContractForm(current => ({ ...current, startDate: event.target.value }))} required /></label>
        <p className="ledger-entry-hint">ระบบจะสร้างตารางกำหนดชำระรายเดือนตามจำนวนงวดโดยอัตโนมัติ</p>
        <button type="submit" className="ledger-submit" disabled={contractMutation.isPending}>{contractMutation.isPending ? "กำลังบันทึก…" : "บันทึกสัญญาและงวดชำระ"}</button>
      </form>}

      <div className="schedule-panel"><div className="schedule-heading"><div><span className="section-index">03 / CONTRACT SCHEDULE</span><h4>{selectedContract ? `ตารางธุรกรรม: ${selectedContract.title}` : "เลือกสัญญาเพื่อดูตารางธุรกรรม"}</h4></div>{selectedContract && <div className="schedule-actions"><button type="button" className="ledger-create" onClick={() => setTransactionFormOpen(current => !current)}><WalletCards size={15} />บันทึกธุรกรรม</button><button type="button" className="clear-link" onClick={() => { setSelectedContractId(""); setScheduleFilter("all"); onLinkChange(null); }}>ยกเลิกการผูกธุรกรรม</button></div>}</div>
        {transactionFormOpen && selectedContract && partyLedger && <form className="ledger-entry-panel transaction-entry-panel" onSubmit={submitTransaction}>
          <div className="ledger-entry-heading"><WalletCards size={17} /><span>บันทึกธุรกรรม: {selectedContract.title}</span><button type="button" onClick={() => setTransactionFormOpen(false)} aria-label="ปิดฟอร์ม"><X size={16} /></button></div>
          <label>ประเภท<select value={transactionForm.type} onChange={event => setTransactionForm(current => ({ ...current, type: event.target.value as TransactionKind }))}><option value="payment">รับชำระ</option><option value="disbursement">จ่ายออก</option><option value="adjustment">ปรับปรุง</option></select></label>
          <label>จำนวนเงิน<input type="number" min="0.01" step="0.01" value={transactionForm.amount} onChange={event => setTransactionForm(current => ({ ...current, amount: event.target.value }))} required /></label>
          <label className="ledger-entry-wide">บันทึกเพิ่มเติม<input value={transactionForm.note} onChange={event => setTransactionForm(current => ({ ...current, note: event.target.value }))} /></label>
          <button type="submit" className="ledger-submit" disabled={transactionMutation.isPending}>{transactionMutation.isPending ? "กำลังบันทึก…" : "บันทึกธุรกรรม"}</button>
        </form>}
        {selectedContract ? <><div className={alerts.length ? "due-alert-strip has-alerts" : "due-alert-strip"}><div className="due-alert-title">{alerts.length ? <CircleAlert size={18} /> : <BellRing size={18} />}<span><b>{alerts.length ? `มี ${alerts.length} งวดที่ต้องติดตาม` : "ยังไม่มีงวดที่ต้องติดตาม"}</b><small>{alerts.length ? "รวมค้างชำระ ครบกำหนดวันนี้ และใกล้ครบกำหนดใน 3 วัน" : "ระบบจะแจ้งเมื่อใกล้ถึงวันครบกำหนดภายใน 3 วัน"}</small></span></div>{alerts.length > 0 && <div className="due-alert-list">{alerts.slice(0, 3).map(transaction => <button type="button" key={transaction.transactionId} className={`due-alert-item ${scheduleStatus(transaction)}`} onClick={() => setScheduleFilter(scheduleStatus(transaction))}><span>{statusLabel[scheduleStatus(transaction)]}</span><b>{transaction.dueDate || "ไม่ระบุวัน"}</b><small>{money(transaction.amount)}</small></button>)}</div>}</div>
          <div className="schedule-filter" aria-label="ตัวกรองสถานะกำหนดชำระ"><span>กรองตาราง</span>{(["all", "overdue", "today", "soon", "scheduled", "settled"] as ScheduleFilter[]).map(filter => <button type="button" key={filter} className={scheduleFilter === filter ? "is-active" : ""} onClick={() => setScheduleFilter(filter)}>{filter === "all" ? "ทั้งหมด" : statusLabel[filter]}<b>{filter === "all" ? contractTransactions.length : scheduleCounts[filter]}</b></button>)}</div>
          <div className="schedule-table-wrap"><table><thead><tr><th>สถานะ</th><th>กำหนดชำระ</th><th>รับ/จ่ายจริง</th><th>จำนวนเงิน</th><th>รายละเอียด</th><th>ต้นทาง</th><th>ดำเนินการ</th></tr></thead><tbody>{visibleTransactions.length ? visibleTransactions.map(transaction => <tr key={transaction.transactionId} data-status={scheduleStatus(transaction)}><td><span className={`schedule-status ${scheduleStatus(transaction)}`}>{statusLabel[scheduleStatus(transaction)]}</span><span className={`transaction-type ${transaction.type}`}>{transactionLabel[transaction.type]}</span></td><td>{transaction.dueDate || "—"}</td><td>{transaction.paidAt ? new Date(transaction.paidAt).toLocaleDateString("th-TH") : "—"}</td><td>{money(transaction.amount)}</td><td>{transaction.note || "—"}</td><td>{transaction.source || "—"}</td><td>{transaction.type === "scheduled" && !transaction.paidAt ? <button type="button" className="mark-paid" disabled={paymentMutation.isPending} onClick={() => markSchedulePaid(transaction)}><CheckCircle2 size={14} />ชำระแล้ว</button> : "—"}</td></tr>) : <tr><td colSpan={7} className="table-empty">{contractQuery.isFetching ? "กำลังซิงก์ตาราง…" : scheduleFilter === "all" ? "ยังไม่มีธุรกรรมสำหรับสัญญานี้" : `ไม่พบรายการ${statusLabel[scheduleFilter]}`}</td></tr>}</tbody></table></div>
        </> : <div className="schedule-placeholder"><CalendarDays size={20} />เลือกคู่สัญญาและสัญญาเพื่ออ่านตารางกำหนดชำระจากฐานข้อมูล</div>}
      </div>
    </>}
  </section>;
}
