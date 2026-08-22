// Style: Siam Ledger — an ink-and-paper personal ledger that keeps people, contracts, and transaction schedules visibly separated.
import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, CalendarDays, ChevronRight, CircleAlert, Landmark, LoaderCircle, RefreshCw, UsersRound } from "lucide-react";
import "./individual-ledger.css";

type Role = "debtor" | "creditor";
type Party = { partyId: string; displayName: string; role: Role; phone: string; note: string; status: string };
type Contract = { contractId: string; partyId: string; title: string; principal: number | string; interestRate: number | string; installmentCount: number | string; startDate: string; status: string };
type LedgerTransaction = { transactionId: string; contractId: string; partyId: string; type: "scheduled" | "disbursement" | "payment" | "adjustment"; amount: number | string; dueDate: string; paidAt: string; source: string; note: string };
type PartyLedger = { party: Party; contracts: Contract[]; transactions: LedgerTransaction[] };
type ContractLedger = { party: Party | null; contract: Contract; transactions: LedgerTransaction[] };
type ScheduleStatus = "overdue" | "today" | "soon" | "scheduled" | "settled" | "activity" | "unplanned";
type ScheduleFilter = "all" | ScheduleStatus;

export type LedgerLink = { partyId: string; contractId: string; partyName: string; contractTitle: string };

const apiBase = (import.meta.env.VITE_BACKEND_API_URL || "").replace(/\/$/, "");
const money = (value: number | string) => new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", minimumFractionDigits: 2 }).format(Number(value || 0));
const roleLabel: Record<Role, string> = { debtor: "ลูกหนี้", creditor: "เจ้าหนี้" };
const transactionLabel: Record<LedgerTransaction["type"], string> = { scheduled: "กำหนดชำระ", disbursement: "จ่ายออก", payment: "รับชำระ", adjustment: "ปรับปรุง" };
const statusLabel: Record<ScheduleStatus, string> = { overdue: "ค้างชำระ", today: "ครบกำหนดวันนี้", soon: "ใกล้ครบกำหนด", scheduled: "รอถึงกำหนด", settled: "ชำระแล้ว", activity: "รายการประกอบ", unplanned: "ไม่ระบุวัน" };

function bangkokDateStamp() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dueDateStamp(value: string) {
  const matched = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return matched ? matched[0] : "";
}

function scheduleStatus(transaction: LedgerTransaction): ScheduleStatus {
  if (transaction.type !== "scheduled") return "activity";
  if (transaction.paidAt) return "settled";
  const due = dueDateStamp(transaction.dueDate);
  if (!due) return "unplanned";
  const today = bangkokDateStamp();
  const day = 86_400_000;
  const difference = Math.round((Date.parse(`${due}T00:00:00+07:00`) - Date.parse(`${today}T00:00:00+07:00`)) / day);
  if (difference < 0) return "overdue";
  if (difference === 0) return "today";
  if (difference <= 3) return "soon";
  return "scheduled";
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBase}${path}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "ไม่สามารถอ่านข้อมูล ledger ได้");
  return payload as T;
}

export default function IndividualLedger({ onLinkChange, refreshSignal = 0 }: { onLinkChange: (link: LedgerLink | null) => void; refreshSignal?: number }) {
  const [role, setRole] = useState<Role>("debtor");
  const [parties, setParties] = useState<Party[]>([]);
  const [partyLedger, setPartyLedger] = useState<PartyLedger | null>(null);
  const [contractLedger, setContractLedger] = useState<ContractLedger | null>(null);
  const [selectedPartyId, setSelectedPartyId] = useState("");
  const [selectedContractId, setSelectedContractId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [scheduleFilter, setScheduleFilter] = useState<ScheduleFilter>("all");
  const disconnected = !apiBase;

  const selectedContract = useMemo(
    () => partyLedger?.contracts.find((contract) => contract.contractId === selectedContractId) || null,
    [partyLedger, selectedContractId],
  );

  const contractTransactions = contractLedger?.transactions || [];
  const scheduleCounts = useMemo(() => contractTransactions.reduce<Record<ScheduleStatus, number>>((counts, transaction) => {
    const status = scheduleStatus(transaction);
    counts[status] += 1;
    return counts;
  }, { overdue: 0, today: 0, soon: 0, scheduled: 0, settled: 0, activity: 0, unplanned: 0 }), [contractTransactions]);
  const alerts = useMemo(() => contractTransactions
    .filter((transaction) => ["overdue", "today", "soon"].includes(scheduleStatus(transaction)))
    .sort((first, second) => (dueDateStamp(first.dueDate) || "9999-12-31").localeCompare(dueDateStamp(second.dueDate) || "9999-12-31")), [contractTransactions]);
  const visibleTransactions = useMemo(() => scheduleFilter === "all" ? contractTransactions : contractTransactions.filter((transaction) => scheduleStatus(transaction) === scheduleFilter), [contractTransactions, scheduleFilter]);

  const loadParties = useCallback(async (nextRole = role) => {
    if (disconnected) return;
    setLoading(true); setError("");
    try {
      const result = await getJson<{ data: Party[] }>(`/api/ledger/parties?role=${nextRole}`);
      setParties(result.data);
    } catch (requestError) {
      setParties([]);
      setError(requestError instanceof Error ? requestError.message : "ไม่สามารถโหลดรายชื่อคู่สัญญาได้");
    } finally { setLoading(false); }
  }, [disconnected, role]);

  const selectParty = useCallback(async (partyId: string) => {
    setSelectedPartyId(partyId); setSelectedContractId(""); setPartyLedger(null); setContractLedger(null); onLinkChange(null);
    if (disconnected || !partyId) return;
    setLoading(true); setError("");
    try {
      const result = await getJson<{ data: PartyLedger }>(`/api/ledger/parties/${encodeURIComponent(partyId)}`);
      setPartyLedger(result.data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "ไม่สามารถโหลดบัญชีรายบุคคลได้");
    } finally { setLoading(false); }
  }, [disconnected, onLinkChange]);

  const loadContract = useCallback(async (contractId: string) => {
    if (disconnected || !contractId) return;
    setLoading(true); setError("");
    try {
      const result = await getJson<{ data: ContractLedger }>(`/api/ledger/contracts/${encodeURIComponent(contractId)}`);
      setContractLedger(result.data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "ไม่สามารถโหลดตารางกำหนดชำระได้");
    } finally { setLoading(false); }
  }, [disconnected]);

  const selectContract = useCallback(async (contract: Contract) => {
    setSelectedContractId(contract.contractId); setContractLedger(null); setScheduleFilter("all");
    const party = partyLedger?.party;
    if (party) onLinkChange({ partyId: party.partyId, contractId: contract.contractId, partyName: party.displayName, contractTitle: contract.title });
    await loadContract(contract.contractId);
  }, [loadContract, onLinkChange, partyLedger?.party]);

  useEffect(() => { void loadParties(role); }, [loadParties, role]);
  useEffect(() => { if (selectedContractId) void loadContract(selectedContractId); }, [loadContract, refreshSignal, selectedContractId]);

  const switchRole = (nextRole: Role) => {
    setRole(nextRole); setParties([]); setSelectedPartyId(""); setSelectedContractId(""); setPartyLedger(null); setContractLedger(null); onLinkChange(null);
  };

  return <section className="individual-ledger" aria-label="บัญชีรายบุคคล">
    <div className="individual-ledger-heading">
      <div><span className="section-index">06 / INDIVIDUAL LEDGER</span><h3>บัญชีคู่สัญญารายบุคคล</h3><p>เลือกคนก่อนเลือกสัญญา ตารางด้านล่างจะแสดงเฉพาะธุรกรรมของสัญญานั้น ไม่ปะปนกับสัญญาอื่น</p></div>
      <button className="ledger-refresh" type="button" disabled={loading || disconnected} onClick={() => void loadParties()}>{loading ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}ซิงก์ธุรกรรม</button>
    </div>

    <div className="ledger-role-tabs" role="tablist" aria-label="ประเภทคู่สัญญา">
      {(["debtor", "creditor"] as Role[]).map((item) => <button key={item} type="button" role="tab" aria-selected={role === item} className={role === item ? "is-active" : ""} onClick={() => switchRole(item)}><UsersRound size={16} />{roleLabel[item]}<span>{role === item ? "บัญชีที่เลือก" : "สลับรายการ"}</span></button>)}
    </div>

    {disconnected && <div className="ledger-not-ready"><Landmark size={19} /><div><b>รอเชื่อม Income-and-expenses-by-manus</b><span>ตั้งค่า <code>VITE_BACKEND_API_URL</code> เพื่อซิงก์รายชื่อลูกหนี้ เจ้าหนี้ และสัญญา</span></div></div>}
    {error && <div className="ledger-error">{error}</div>}

    <div className="ledger-workbench">
      <div className="party-column"><div className="ledger-column-heading"><span>01</span><b>{roleLabel[role]}ทั้งหมด</b><small>{parties.length} ราย</small></div>{parties.length ? <div className="party-list">{parties.map((party) => <button type="button" key={party.partyId} className={party.partyId === selectedPartyId ? "party-card is-selected" : "party-card"} onClick={() => void selectParty(party.partyId)}><span className="party-initial">{party.displayName.slice(0, 1)}</span><span><b>{party.displayName}</b><small>{party.phone || "ไม่ระบุเบอร์โทร"}</small></span><ChevronRight size={16} /></button>)}</div> : <div className="ledger-empty">{loading ? "กำลังอ่านข้อมูลคู่สัญญา…" : `ยังไม่มี${roleLabel[role]}ใน ledger`}</div>}</div>

      <div className="contract-column"><div className="ledger-column-heading"><span>02</span><b>สัญญาของบุคคลนี้</b><small>{partyLedger?.contracts.length || 0} สัญญา</small></div>{partyLedger ? <><div className="party-identity"><span>{partyLedger.party.displayName}</span><small>{partyLedger.party.note || "ไม่มีบันทึกเพิ่มเติม"}</small></div>{partyLedger.contracts.length ? <div className="contract-list">{partyLedger.contracts.map((contract) => <button type="button" key={contract.contractId} className={contract.contractId === selectedContractId ? "contract-card is-selected" : "contract-card"} onClick={() => void selectContract(contract)}><span><b>{contract.title}</b><small>{contract.installmentCount} งวด · เริ่ม {contract.startDate}</small></span><strong>{money(contract.principal)}</strong></button>)}</div> : <div className="ledger-empty">ยังไม่มีสัญญาของบุคคลนี้</div>}</> : <div className="ledger-empty">เลือก{roleLabel[role]}เพื่อดูสัญญาเฉพาะราย</div>}</div>
    </div>

    <div className="schedule-panel"><div className="schedule-heading"><div><span className="section-index">03 / CONTRACT SCHEDULE</span><h4>{selectedContract ? `ตารางธุรกรรม: ${selectedContract.title}` : "เลือกสัญญาเพื่อดูตารางธุรกรรม"}</h4></div>{selectedContract && <button type="button" className="clear-link" onClick={() => { setSelectedContractId(""); setContractLedger(null); setScheduleFilter("all"); onLinkChange(null); }}>ยกเลิกการผูกธุรกรรม</button>}</div>{selectedContract ? <><div className="selected-link-note">ธุรกรรมใหม่จาก Intent Console จะผูกกับ <b>{partyLedger?.party.displayName}</b> / <b>{selectedContract.title}</b> โดยอัตโนมัติ</div><div className={alerts.length ? "due-alert-strip has-alerts" : "due-alert-strip"}><div className="due-alert-title">{alerts.length ? <CircleAlert size={18} /> : <BellRing size={18} />}<span><b>{alerts.length ? `มี ${alerts.length} งวดที่ต้องติดตาม` : "ยังไม่มีงวดที่ต้องติดตาม"}</b><small>{alerts.length ? "รวมค้างชำระ ครบกำหนดวันนี้ และใกล้ครบกำหนดใน 3 วัน" : "ระบบจะแจ้งเมื่อใกล้ถึงวันครบกำหนดภายใน 3 วัน"}</small></span></div>{alerts.length > 0 && <div className="due-alert-list">{alerts.slice(0, 3).map((transaction) => <button type="button" key={transaction.transactionId} className={`due-alert-item ${scheduleStatus(transaction)}`} onClick={() => setScheduleFilter(scheduleStatus(transaction))}><span>{statusLabel[scheduleStatus(transaction)]}</span><b>{transaction.dueDate || "ไม่ระบุวัน"}</b><small>{money(transaction.amount)}</small></button>)}</div>}</div><div className="schedule-filter" aria-label="ตัวกรองสถานะกำหนดชำระ"><span>กรองตาราง</span>{(["all", "overdue", "today", "soon", "scheduled", "settled"] as ScheduleFilter[]).map((filter) => <button type="button" key={filter} className={scheduleFilter === filter ? "is-active" : ""} onClick={() => setScheduleFilter(filter)}>{filter === "all" ? "ทั้งหมด" : statusLabel[filter]}<b>{filter === "all" ? contractTransactions.length : scheduleCounts[filter]}</b></button>)}</div><div className="schedule-table-wrap"><table><thead><tr><th>สถานะ</th><th>กำหนดชำระ</th><th>รับ/จ่ายจริง</th><th>จำนวนเงิน</th><th>รายละเอียด</th><th>ต้นทาง</th></tr></thead><tbody>{visibleTransactions.length ? visibleTransactions.map((transaction) => <tr key={transaction.transactionId} data-status={scheduleStatus(transaction)}><td><span className={`schedule-status ${scheduleStatus(transaction)}`}>{statusLabel[scheduleStatus(transaction)]}</span><span className={`transaction-type ${transaction.type}`}>{transactionLabel[transaction.type]}</span></td><td>{transaction.dueDate || "—"}</td><td>{transaction.paidAt || "—"}</td><td>{money(transaction.amount)}</td><td>{transaction.note || "—"}</td><td>{transaction.source || "—"}</td></tr>) : <tr><td colSpan={6} className="table-empty">{loading ? "กำลังซิงก์ตาราง…" : scheduleFilter === "all" ? "ยังไม่มีธุรกรรมสำหรับสัญญานี้" : `ไม่พบรายการสถานะ ${statusLabel[scheduleFilter]}`}</td></tr>}</tbody></table></div></> : <div className="schedule-placeholder"><CalendarDays size={25} /><span>ตารางกำหนดชำระจะแสดงเฉพาะรายการที่มี <code>contractId</code> ตรงกับสัญญาที่เลือก</span></div>}</div>
  </section>;
}
