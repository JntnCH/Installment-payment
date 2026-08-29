import React, { useState, useMemo } from "react";
import {
  Users,
  Plus,
  ArrowRight,
  Phone,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  ChevronRight,
  Trash2,
  Edit2,
  X,
  CreditCard,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  PageHeader,
  StatCard,
  Money,
  Button,
  StatusChip,
  StatusDot,
  DebtRow,
  PaySheet,
  EmptyState,
} from "./design-system";

export type Role = "debtor" | "creditor";

export interface LedgerLink {
  partyId?: string;
  contractId?: string;
  partyName?: string;
  contractTitle?: string;
}

interface IndividualLedgerProps {
  initialRole?: Role;
  onLinkChange?: (link: any) => void;
  refreshSignal?: number;
}

export default function IndividualLedger({
  initialRole = "debtor",
  onLinkChange,
  refreshSignal = 0,
}: IndividualLedgerProps) {
  const [role, setRole] = useState<Role>(initialRole);
  const [selectedPartyId, setSelectedPartyId] = useState<string>("");
  const [selectedContractId, setSelectedContractId] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "paid" | "overdue">("all");

  // Modals
  const [partyModalOpen, setPartyModalOpen] = useState(false);
  const [contractModalOpen, setContractModalOpen] = useState(false);
  const [partyForm, setPartyForm] = useState({ displayName: "", phone: "", note: "" });
  const [contractForm, setContractForm] = useState({
    title: "",
    principal: "",
    interestRate: "0",
    installmentCount: "1",
    startDate: new Date().toISOString().slice(0, 10),
  });

  const [activePaySchedule, setActivePaySchedule] = useState<{
    scheduleId: string;
    amount: number;
    installmentNo: number;
    contractTitle: string;
  } | null>(null);

  const utils = trpc.useUtils();

  const partyListQuery = trpc.ledger.listParties.useQuery(role);
  const partyQuery = trpc.ledger.getParty.useQuery(
    { id: selectedPartyId },
    { enabled: Boolean(selectedPartyId) }
  );
  const contractQuery = trpc.ledger.getContract.useQuery(
    { id: selectedContractId },
    { enabled: Boolean(selectedContractId) }
  );

  const createPartyMutation = trpc.ledger.createParty.useMutation();
  const createContractMutation = trpc.ledger.createContract.useMutation();
  const markPaidMutation = trpc.ledger.markSchedulePaid.useMutation();
  const deletePartyMutation = trpc.ledger.deleteParty.useMutation();
  const deleteContractMutation = trpc.ledger.deleteContract.useMutation();

  const parties = partyListQuery.data || [];
  const selectedParty = partyQuery.data?.party;
  const partyContracts = partyQuery.data?.contracts || [];
  const selectedContractLedger = contractQuery.data;
  const selectedContract = selectedContractLedger?.contract;
  const contractTransactions = selectedContractLedger?.transactions || [];

  // Summary Metrics
  const roleStats = useMemo(() => {
    let totalPrincipal = 0;
    let totalContracts = 0;

    for (const p of parties) {
      // In full app, stats can be derived
    }

    return {
      count: parties.length,
    };
  }, [parties]);

  // Handle party creation
  const handleCreateParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partyForm.displayName.trim()) return;

    try {
      const res = await createPartyMutation.mutateAsync({
        displayName: partyForm.displayName.trim(),
        role,
        phone: partyForm.phone.trim(),
        note: partyForm.note.trim(),
      });
      await utils.ledger.invalidate();
      toast.success(`เพิ่ม${role === "debtor" ? "ลูกหนี้" : "เจ้าหนี้"}สำเร็จ`);
      setPartyModalOpen(false);
      setPartyForm({ displayName: "", phone: "", note: "" });
      if (res?.partyId) {
        setSelectedPartyId(res.partyId);
      }
    } catch (err: any) {
      toast.error(`เกิดข้อผิดพลาด: ${err.message}`);
    }
  };

  // Handle contract creation
  const handleCreateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPartyId || !contractForm.title.trim()) return;
    const principal = parseFloat(contractForm.principal);
    const count = parseInt(contractForm.installmentCount, 10);
    if (isNaN(principal) || principal <= 0 || isNaN(count) || count <= 0) {
      toast.error("กรุณาระบุข้อมูลจำนวนเงินและงวดที่ถูกต้อง");
      return;
    }

    try {
      const res = await createContractMutation.mutateAsync({
        partyId: selectedPartyId,
        title: contractForm.title.trim(),
        principal,
        interestRate: parseFloat(contractForm.interestRate) || 0,
        installmentCount: count,
        startDate: contractForm.startDate,
        status: "active",
      });
      await utils.ledger.invalidate();
      toast.success("สร้างสัญญาและตารางงวดสำเร็จ");
      setContractModalOpen(false);
      setContractForm({
        title: "",
        principal: "",
        interestRate: "0",
        installmentCount: "1",
        startDate: new Date().toISOString().slice(0, 10),
      });
      if (res?.contract?.contractId) {
        setSelectedContractId(res.contract.contractId);
      }
    } catch (err: any) {
      toast.error(`เกิดข้อผิดพลาด: ${err.message}`);
    }
  };

  // Pay schedule
  const handleConfirmPaySchedule = async (data: {
    amount: number;
    date: string;
    note: string;
  }) => {
    if (!activePaySchedule) return;
    try {
      await markPaidMutation.mutateAsync({
        scheduleId: activePaySchedule.scheduleId,
        paidAmount: data.amount,
        paidAt: new Date(data.date),
        source: "individual_ledger",
        note: data.note || `ชำระงวดที่ ${activePaySchedule.installmentNo}`,
      });
      await utils.ledger.invalidate();
      toast.success("บันทึกการชำระเงินเรียบร้อยแล้ว");
    } catch (err: any) {
      toast.error(`เกิดข้อผิดพลาด: ${err.message}`);
    }
  };

  const isDebtor = role === "debtor";

  return (
    <div className="space-y-8">
      {/* 1. Page Header */}
      <PageHeader
        kicker={isDebtor ? "DEBTOR LEDGER" : "CREDITOR & BILLS"}
        title={isDebtor ? "สมุดบัญชีลูกหนี้ (ให้ยืม)" : "สมุดบัญชีเจ้าหนี้ & บิล (กู้ยืม)"}
        description={
          isDebtor
            ? "จัดการรายชื่อลูกหนี้ ติดตามยอดค้างชำระ สัญญาผ่อนสินค้า และตารางงวดรับเงิน"
            : "จัดการเจ้าหนี้ วงเงินสินเชื่อที่กู้ยืม และรายการบิลค่าใช้จ่ายที่ต้องจ่าย"
        }
        action={
          <div className="flex items-center gap-2">
            <div className="flex items-center p-0.5 bg-[#FFFCF8] rounded-full border border-[#1C1917]/10">
              <button
                type="button"
                onClick={() => {
                  setRole("debtor");
                  setSelectedPartyId("");
                  setSelectedContractId("");
                }}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors cursor-pointer ${
                  isDebtor
                    ? "bg-[#1C1917] text-white font-semibold"
                    : "text-[#78716C] hover:text-[#1C1917]"
                }`}
              >
                ฉันเป็นเจ้าหนี้ (ให้ยืม)
              </button>
              <button
                type="button"
                onClick={() => {
                  setRole("creditor");
                  setSelectedPartyId("");
                  setSelectedContractId("");
                }}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors cursor-pointer ${
                  !isDebtor
                    ? "bg-[#1C1917] text-white font-semibold"
                    : "text-[#78716C] hover:text-[#1C1917]"
                }`}
              >
                ฉันเป็นลูกหนี้ (กู้ยืม)
              </button>
            </div>

            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setPartyModalOpen(true)}
            >
              เพิ่ม{isDebtor ? "ลูกหนี้" : "เจ้าหนี้"}
            </Button>
          </div>
        }
      />

      {/* 2. Top Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label={`จำนวน${isDebtor ? "ลูกหนี้" : "เจ้าหนี้"}ทั้งหมด`}
          rawDisplay={<span className="text-2xl font-bold font-mono text-[#1C1917]">{parties.length} ราย</span>}
          subtitle={`บันทึกในหมวด${isDebtor ? "ลูกหนี้" : "เจ้าหนี้"}`}
        />
        <StatCard
          label={isDebtor ? "สถานะการเรียกเก็บ" : "สถานะการชำระ"}
          rawDisplay={<span className="text-2xl font-bold font-mono text-[#3F6B4B]">พร้อมติดตาม</span>}
          subtitle="แยกงวดชำระและประวัติธุรกรรม"
          accentBar={isDebtor ? "income" : "expense"}
        />
        <StatCard
          label="ระบบคำนวณดอกเบี้ย"
          rawDisplay={<span className="text-2xl font-bold font-mono text-[#1C1917]">อัตโนมัติ</span>}
          subtitle="รองรับทั้งดอกคงที่ ดอกลอย และลดต้นลดดอก"
        />
      </div>

      {/* 3. Main Workspace: Party List & Detail Views */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Party List */}
        <div className="lg:col-span-4 space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-[#1C1917]">
              รายชื่อ{isDebtor ? "ลูกหนี้" : "เจ้าหนี้"} ({parties.length})
            </span>
          </div>

          {parties.length === 0 ? (
            <EmptyState
              title={`ยังไม่มีรายชื่อ${isDebtor ? "ลูกหนี้" : "เจ้าหนี้"}`}
              description={`กดปุ่มเพื่อเพิ่ม${isDebtor ? "ลูกหนี้" : "เจ้าหนี้"}คนแรก`}
              actionLabel="เพิ่มรายชื่อ"
              onAction={() => setPartyModalOpen(true)}
            />
          ) : (
            <div className="space-y-2">
              {parties.map((p) => {
                const isSelected = p.partyId === selectedPartyId;
                return (
                  <div
                    key={p.partyId}
                    onClick={() => {
                      setSelectedPartyId(p.partyId);
                      setSelectedContractId("");
                    }}
                    className={`p-4 rounded-[20px] border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[#1C1917] text-white border-[#1C1917] shadow-sm"
                        : "bg-[#FFFCF8] text-[#1C1917] border-[#1C1917]/10 hover:border-[#1C1917]/25"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm truncate">
                          {p.displayName}
                        </div>
                        {p.phone && (
                          <div
                            className={`text-xs mt-0.5 flex items-center gap-1 ${
                              isSelected ? "text-stone-300" : "text-[#78716C]"
                            }`}
                          >
                            <Phone className="w-3 h-3" />
                            <span>{p.phone}</span>
                          </div>
                        )}
                      </div>
                      <ChevronRight
                        className={`w-4 h-4 shrink-0 ${
                          isSelected ? "text-white" : "text-[#78716C]"
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Contracts & Schedules */}
        <div className="lg:col-span-8 space-y-6">
          {!selectedParty ? (
            <div className="bg-[#FFFCF8] rounded-[20px] border border-[#1C1917]/10 p-8 text-center text-[#78716C] text-sm">
              เลือกรายชื่อ{isDebtor ? "ลูกหนี้" : "เจ้าหนี้"}จากแถบด้านซ้าย เพื่อดูสัญญาและตารางงวดชำระ
            </div>
          ) : (
            <div className="space-y-6">
              {/* Party Header Card */}
              <div className="bg-[#FFFCF8] rounded-[20px] border border-[#1C1917]/10 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-[#1C1917]">
                      {selectedParty.displayName}
                    </h2>
                    <StatusChip
                      status={isDebtor ? "lent" : "borrowed"}
                      label={isDebtor ? "ลูกหนี้" : "เจ้าหนี้"}
                    />
                  </div>
                  {selectedParty.phone && (
                    <p className="text-xs text-[#78716C] mt-1">
                      โทร: {selectedParty.phone} {selectedParty.note ? `· ${selectedParty.note}` : ""}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Plus className="w-4 h-4" />}
                    onClick={() => setContractModalOpen(true)}
                  >
                    เพิ่มสัญญาใหม่
                  </Button>
                </div>
              </div>

              {/* Party Contracts List */}
              <div className="space-y-3">
                <div className="text-xs font-semibold text-[#1C1917] px-1">
                  สัญญาและรายการหนี้ ({partyContracts.length})
                </div>

                {partyContracts.length === 0 ? (
                  <EmptyState
                    title="ยังไม่มีสัญญาผูกกับบัญชีนี้"
                    description="กดปุ่มเพื่อสร้างสัญญาเงินกู้ หรือแผนผ่อนสินค้าแรกสำหรับบุคคลนี้"
                    actionLabel="สร้างสัญญาใหม่"
                    onAction={() => setContractModalOpen(true)}
                  />
                ) : (
                  <div className="space-y-3">
                    {partyContracts.map((c) => {
                      const isSelectedContract = c.contractId === selectedContractId;
                      return (
                        <div
                          key={c.contractId}
                          onClick={() => setSelectedContractId(c.contractId)}
                          className={`bg-[#FFFCF8] rounded-[20px] border p-5 transition-all cursor-pointer ${
                            isSelectedContract
                              ? "border-[#1C1917] ring-1 ring-[#1C1917]"
                              : "border-[#1C1917]/10 hover:border-[#1C1917]/25"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-base text-[#1C1917] truncate">
                                  {c.title}
                                </h3>
                                <StatusChip status={c.status} />
                              </div>
                              <p className="text-xs text-[#78716C] mt-0.5">
                                เริ่มวันที่ {c.startDate} · {c.installmentCount} งวด · ดอกเบี้ย {c.interestRate}%
                              </p>
                            </div>

                            <div className="text-right shrink-0">
                              <div className="text-xs text-[#78716C]">ยอดเงินต้น</div>
                              <Money amount={c.principal} size="lg" />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Selected Contract Detail: Key 3 Metrics + Schedule Table */}
              {selectedContract && (
                <div className="bg-[#FFFCF8] rounded-[20px] border border-[#1C1917]/10 p-6 space-y-6 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between border-b border-[#1C1917]/10 pb-4">
                    <div>
                      <span className="text-[11px] font-mono text-[#78716C] uppercase">
                        ตารางงวดชำระสัญญา
                      </span>
                      <h4 className="text-base font-semibold text-[#1C1917]">
                        {selectedContract.title}
                      </h4>
                    </div>
                  </div>

                  {/* 3 Key Metrics inside contract */}
                  <div className="grid grid-cols-3 gap-3 p-4 bg-[#F6F4F0] rounded-2xl border border-[#1C1917]/5 text-center">
                    <div>
                      <div className="text-[11px] text-[#78716C]">ยอดเงินต้น</div>
                      <Money amount={selectedContract.principal} size="base" />
                    </div>
                    <div>
                      <div className="text-[11px] text-[#78716C]">จำนวนงวด</div>
                      <div className="font-bold font-mono text-sm sm:text-base text-[#1C1917]">
                        {selectedContract.installmentCount} งวด
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-[#78716C]">วันเริ่มสัญญา</div>
                      <div className="font-mono text-xs sm:text-sm text-[#1C1917]">
                        {selectedContract.startDate}
                      </div>
                    </div>
                  </div>

                  {/* Schedules / Transactions List */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#1C1917]">
                        รายการงวดและประวัติการชำระ ({contractTransactions.length})
                      </span>
                    </div>

                    <div className="space-y-2">
                      {contractTransactions.map((tx) => {
                        const isSchedule = tx.type === "scheduled";
                        const isSettled = Boolean(tx.paidAt);
                        return (
                          <div
                            key={tx.transactionId}
                            className="p-3.5 bg-white rounded-[14px] border border-[#1C1917]/10 flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <StatusDot
                                status={
                                  isSettled
                                    ? "paid"
                                    : isSchedule
                                    ? "pending"
                                    : "active"
                                }
                              />
                              <div className="min-w-0 flex-1">
                                <div className="font-medium text-xs sm:text-sm text-[#1C1917] truncate">
                                  {tx.note || "งวดชำระ"}
                                </div>
                                <div className="text-[11px] text-[#78716C]">
                                  {tx.dueDate ? `กำหนดชำระ: ${tx.dueDate}` : `บันทึกเมื่อ: ${tx.paidAt?.slice(0, 10) || "—"}`}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0 text-right">
                              <Money
                                amount={tx.amount}
                                size="base"
                                sentiment={isSettled ? "income" : "default"}
                              />

                              {isSchedule && !isSettled && (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  onClick={() => {
                                    const rawScheduleId = tx.transactionId.replace("schedule:", "");
                                    setActivePaySchedule({
                                      scheduleId: rawScheduleId,
                                      amount: Number(tx.amount || 0),
                                      installmentNo: 1,
                                      contractTitle: selectedContract.title,
                                    });
                                  }}
                                  className="text-xs"
                                >
                                  {isDebtor ? "รับชำระ" : "จ่ายเงิน"}
                                </Button>
                              )}

                              {isSettled && (
                                <StatusChip status="paid" label="ชำระแล้ว" size="sm" />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create Party Modal */}
      {partyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[#FFFCF8] rounded-3xl border border-[#1C1917]/10 p-6 shadow-xl relative">
            <h3 className="text-lg font-semibold text-[#1C1917] mb-1">
              เพิ่มรายชื่อ{isDebtor ? "ลูกหนี้" : "เจ้าหนี้"}ใหม่
            </h3>
            <p className="text-xs text-[#78716C] mb-5">
              ระบุชื่อและเบอร์โทรศัพท์เพื่อใช้สร้างสัญญา
            </p>

            <form onSubmit={handleCreateParty} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#1C1917] mb-1">
                  ชื่อ-นามสกุล หรือชื่อร้านค้า *
                </label>
                <input
                  type="text"
                  required
                  placeholder="เช่น สมชาย วัฒนากูล"
                  value={partyForm.displayName}
                  onChange={(e) =>
                    setPartyForm({ ...partyForm, displayName: e.target.value })
                  }
                  className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm text-[#1C1917]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1C1917] mb-1">
                  เบอร์โทรศัพท์
                </label>
                <input
                  type="tel"
                  placeholder="081-234-5678"
                  value={partyForm.phone}
                  onChange={(e) =>
                    setPartyForm({ ...partyForm, phone: e.target.value })
                  }
                  className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm text-[#1C1917]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1C1917] mb-1">
                  บันทึกโน้ต
                </label>
                <input
                  type="text"
                  placeholder="เช่น ลูกค้าผ่อนโทรศัพท์, สินเชื่อเพื่อการค้า"
                  value={partyForm.note}
                  onChange={(e) =>
                    setPartyForm({ ...partyForm, note: e.target.value })
                  }
                  className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm text-[#1C1917]"
                />
              </div>

              <div className="flex items-center gap-2 pt-3">
                <Button
                  type="button"
                  variant="secondary"
                  fullWidth
                  onClick={() => setPartyModalOpen(false)}
                >
                  ยกเลิก
                </Button>
                <Button type="submit" variant="primary" fullWidth>
                  บันทึก
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Contract Modal */}
      {contractModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[#FFFCF8] rounded-3xl border border-[#1C1917]/10 p-6 shadow-xl relative">
            <h3 className="text-lg font-semibold text-[#1C1917] mb-1">
              สร้างสัญญาใหม่
            </h3>
            <p className="text-xs text-[#78716C] mb-5">
              ผูกกับ: {selectedParty?.displayName}
            </p>

            <form onSubmit={handleCreateContract} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#1C1917] mb-1">
                  ชื่อสัญญา / รายการสินค้า *
                </label>
                <input
                  type="text"
                  required
                  placeholder="เช่น สัญญาผ่อน iPhone 16 Pro, กู้ยืมระยะสั้น"
                  value={contractForm.title}
                  onChange={(e) =>
                    setContractForm({ ...contractForm, title: e.target.value })
                  }
                  className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm text-[#1C1917]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1C1917] mb-1">
                    ยอดเงินต้น (บาท) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="1"
                    required
                    placeholder="0.00"
                    value={contractForm.principal}
                    onChange={(e) =>
                      setContractForm({ ...contractForm, principal: e.target.value })
                    }
                    className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm font-mono tabular-nums text-[#1C1917]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#1C1917] mb-1">
                    จำนวนงวด *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={contractForm.installmentCount}
                    onChange={(e) =>
                      setContractForm({ ...contractForm, installmentCount: e.target.value })
                    }
                    className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm font-mono tabular-nums text-[#1C1917]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1C1917] mb-1">
                    ดอกเบี้ย (%)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={contractForm.interestRate}
                    onChange={(e) =>
                      setContractForm({ ...contractForm, interestRate: e.target.value })
                    }
                    className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm font-mono tabular-nums text-[#1C1917]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#1C1917] mb-1">
                    วันเริ่มสัญญา *
                  </label>
                  <input
                    type="date"
                    required
                    value={contractForm.startDate}
                    onChange={(e) =>
                      setContractForm({ ...contractForm, startDate: e.target.value })
                    }
                    className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm text-[#1C1917]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-3">
                <Button
                  type="button"
                  variant="secondary"
                  fullWidth
                  onClick={() => setContractModalOpen(false)}
                >
                  ยกเลิก
                </Button>
                <Button type="submit" variant="primary" fullWidth>
                  สร้างสัญญา
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PaySheet for Schedule */}
      {activePaySchedule && (
        <PaySheet
          open={Boolean(activePaySchedule)}
          onClose={() => setActivePaySchedule(null)}
          title={`บันทึกชำระ: ${activePaySchedule.contractTitle}`}
          subtitle={`งวดที่ ${activePaySchedule.installmentNo}`}
          defaultAmount={activePaySchedule.amount}
          totalDue={activePaySchedule.amount}
          type={isDebtor ? "receive" : "pay"}
          onConfirm={handleConfirmPaySchedule}
        />
      )}
    </div>
  );
}
