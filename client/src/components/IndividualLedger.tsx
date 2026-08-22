// Style: Siam Ledger — an ink-and-paper personal ledger that keeps people, contracts, and transaction schedules visibly separated.
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronRight, Landmark, LoaderCircle, RefreshCw, UsersRound } from "lucide-react";
import "./individual-ledger.css";

type Role = "debtor" | "creditor";
type Party = { partyId: string; displayName: string; role: Role; phone: string; note: string; status: string };
type Contract = { contractId: string; partyId: string; title: string; principal: number | string; interestRate: number | string; installmentCount: number | string; startDate: string; status: string };
type LedgerTransaction = { transactionId: string; contractId: string; partyId: string; type: "scheduled" | "disbursement" | "payment" | "adjustment"; amount: number | string; dueDate: string; paidAt: string; source: string; note: string };
type PartyLedger = { party: Party; contracts: Contract[]; transactions: LedgerTransaction[] };
type ContractLedger = { party: Party | null; contract: Contract; transactions: LedgerTransaction[] };

export type LedgerLink = { partyId: string; contractId: string; partyName: string; contractTitle: string };

const apiBase = (import.meta.env.VITE_BACKEND_API_URL || "").replace(/\/$/, "");
const money = (value: number | string) => new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", minimumFractionDigits: 2 }).format(Number(value || 0));
const roleLabel: Record<Role, string> = { debtor: "ลูกหนี้", creditor: "เจ้าหนี้" };
const transactionLabel: Record<LedgerTransaction["type"], string> = { scheduled: "กำหนดชำระ", disbursement: "จ่ายออก", payment: "รับชำระ", adjustment: "ปรับปรุง" };

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
  const disconnected = !apiBase;

  const selectedContract = useMemo(
    () => partyLedger?.contracts.find((contract) => contract.contractId === selectedContractId) || null,
    [partyLedger, selectedContractId],
  );

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
    setSelectedContractId(contract.contractId); setContractLedger(null);
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

    <div className="schedule-panel"><div className="schedule-heading"><div><span className="section-index">03 / CONTRACT SCHEDULE</span><h4>{selectedContract ? `ตารางธุรกรรม: ${selectedContract.title}` : "เลือกสัญญาเพื่อดูตารางธุรกรรม"}</h4></div>{selectedContract && <button type="button" className="clear-link" onClick={() => { setSelectedContractId(""); setContractLedger(null); onLinkChange(null); }}>ยกเลิกการผูกธุรกรรม</button>}</div>{selectedContract ? <><div className="selected-link-note">ธุรกรรมใหม่จาก Intent Console จะผูกกับ <b>{partyLedger?.party.displayName}</b> / <b>{selectedContract.title}</b> โดยอัตโนมัติ</div><div className="schedule-table-wrap"><table><thead><tr><th>สถานะ</th><th>กำหนดชำระ</th><th>รับ/จ่ายจริง</th><th>จำนวนเงิน</th><th>รายละเอียด</th><th>ต้นทาง</th></tr></thead><tbody>{contractLedger?.transactions.length ? contractLedger.transactions.map((transaction) => <tr key={transaction.transactionId}><td><span className={`transaction-type ${transaction.type}`}>{transactionLabel[transaction.type]}</span></td><td>{transaction.dueDate || "—"}</td><td>{transaction.paidAt || "—"}</td><td>{money(transaction.amount)}</td><td>{transaction.note || "—"}</td><td>{transaction.source || "—"}</td></tr>) : <tr><td colSpan={6} className="table-empty">{loading ? "กำลังซิงก์ตาราง…" : "ยังไม่มีธุรกรรมสำหรับสัญญานี้"}</td></tr>}</tbody></table></div></> : <div className="schedule-placeholder"><CalendarDays size={25} /><span>ตารางกำหนดชำระจะแสดงเฉพาะรายการที่มี <code>contractId</code> ตรงกับสัญญาที่เลือก</span></div>}</div>
  </section>;
}
