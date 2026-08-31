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
  UserCheck,
  Receipt,
  Calculator as CalcIcon,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
  Percent,
  Sparkles,
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
import LoanCalculator from "./LoanCalculator";

export type Role = "debtor" | "creditor";
export type SubTab = "borrowed" | "lent" | "calculator";

export interface LedgerLink {
  partyId?: string;
  contractId?: string;
  partyName?: string;
  contractTitle?: string;
}

interface IndividualLedgerProps {
  initialRole?: Role;
  initialSubTab?: SubTab;
  onRoleChange?: (role: Role) => void;
  onLinkChange?: (link: any) => void;
  refreshSignal?: number;
}

export default function IndividualLedger({
  initialRole = "debtor",
  initialSubTab,
  onRoleChange,
  onLinkChange,
  refreshSignal = 0,
}: IndividualLedgerProps) {
  // Determine subTab based on initialRole or initialSubTab
  const [subTab, setSubTab] = useState<SubTab>(() => {
    if (initialSubTab) return initialSubTab;
    return initialRole === "creditor" ? "borrowed" : "lent";
  });

  const role: Role = subTab === "borrowed" ? "creditor" : "debtor";
  const isDebtor = role === "debtor"; // true: ฉันเป็นเจ้าหนี้ (บันทึกรายชื่อลูกหนี้), false: ฉันเป็นลูกหนี้ (บันทึกรายชื่อเจ้าหนี้/กู้ยืม)

  const [selectedPartyId, setSelectedPartyId] = useState<string>("");
  const [selectedContractId, setSelectedContractId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPartyStatus, setFilterPartyStatus] = useState<"all" | "active" | "settled">("all");

  // Synchronize when initial props change
  React.useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
    } else if (initialRole) {
      setSubTab(initialRole === "creditor" ? "borrowed" : "lent");
    }
  }, [initialRole, initialSubTab, refreshSignal]);

  // Create Party Modal State
  const [partyModalOpen, setPartyModalOpen] = useState(false);
  const [partyForm, setPartyForm] = useState({
    displayName: "",
    phone: "",
    note: "",
    role: role,
  });

  // Edit Party Modal State (วงกลมตรงกลางสัญญาต้องแก้ไขข้อมูลได้)
  const [editPartyModalOpen, setEditPartyModalOpen] = useState(false);
  const [editPartyForm, setEditPartyForm] = useState({
    id: "",
    displayName: "",
    phone: "",
    note: "",
    role: role,
  });

  // Create Contract Modal State
  const [contractModalOpen, setContractModalOpen] = useState(false);
  const [contractForm, setContractForm] = useState({
    title: "",
    principal: "",
    deductionAmount: "0",
    interestRate: "0",
    installmentCount: "1",
    cycleType: "monthly" as "monthly" | "daily",
    startDate: new Date().toISOString().slice(0, 10),
  });

  // Edit Contract Modal State (แก้ไขข้อมูลสัญญา)
  const [editContractModalOpen, setEditContractModalOpen] = useState(false);
  const [editContractForm, setEditContractForm] = useState({
    id: "",
    title: "",
    principal: "",
    interestRate: "0",
    installmentCount: 1,
    startDate: "",
    status: "active" as "active" | "completed" | "cancelled",
  });

  // Edit Schedule Item Modal State (แก้งวด)
  const [editScheduleModalOpen, setEditScheduleModalOpen] = useState(false);
  const [editScheduleForm, setEditScheduleForm] = useState({
    id: "",
    installmentNo: 1,
    dueDate: "",
    amount: "",
    note: "",
  });

  // Pay Sheet State
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
  const updatePartyMutation = trpc.ledger.updateParty.useMutation();
  const deletePartyMutation = trpc.ledger.deleteParty.useMutation();

  const createContractMutation = trpc.ledger.createContract.useMutation();
  const updateContractMutation = trpc.ledger.updateContract.useMutation();
  const deleteContractMutation = trpc.ledger.deleteContract.useMutation();

  const updateScheduleMutation = trpc.ledger.updateSchedule.useMutation();
  const markPaidMutation = trpc.ledger.markSchedulePaid.useMutation();

  const rawParties = partyListQuery.data || [];
  const selectedParty = partyQuery.data?.party;
  const partyContracts = partyQuery.data?.contracts || [];
  const selectedContractLedger = contractQuery.data;
  const selectedContract = selectedContractLedger?.contract;
  const contractTransactions = selectedContractLedger?.transactions || [];

  // Filter parties based on search query
  const filteredParties = useMemo(() => {
    if (!searchQuery.trim()) return rawParties;
    const q = searchQuery.toLowerCase();
    return rawParties.filter(
      (p) =>
        p.displayName.toLowerCase().includes(q) ||
        (p.phone && p.phone.includes(q)) ||
        (p.note && p.note.toLowerCase().includes(q))
    );
  }, [rawParties, searchQuery]);

  // Form preview calculations for creating new contract
  const formPrincipal = Math.max(0, parseFloat(contractForm.principal) || 0);
  const formDeduction = Math.max(0, parseFloat(contractForm.deductionAmount) || 0);
  const formNetActual = Math.max(0, formPrincipal - formDeduction);
  const formRate = Math.max(0, parseFloat(contractForm.interestRate) || 0);
  const formCount = Math.max(1, parseInt(contractForm.installmentCount, 10) || 1);
  const formTotalInterest = (formPrincipal * formRate) / 100;
  const formTotalRepay = formPrincipal + formTotalInterest;
  const formPerInstallment = Math.ceil(formTotalRepay / formCount);

  // Contract Financial Stats Breakdown (วงกลมตรงกลาง และการคำนวณยอดคงเหลือ)
  const contractStats = useMemo(() => {
    if (!selectedContract) return null;

    const principal = Number(selectedContract.principal || 0);
    const schedules = contractTransactions.filter((t) => t.type === "scheduled");
    const totalRepayable = schedules.reduce((sum, s) => sum + Number(s.amount || 0), 0) || principal;
    const totalPaid = schedules.filter((s) => Boolean(s.paidAt)).reduce((sum, s) => sum + Number(s.amount || 0), 0);
    const remainingBalance = Math.max(0, totalRepayable - totalPaid);
    const interestAmount = Math.max(0, totalRepayable - principal);
    const paidCount = schedules.filter((s) => Boolean(s.paidAt)).length;
    const totalCount = schedules.length || selectedContract.installmentCount || 1;
    const progressPercent = totalRepayable > 0 ? Math.min(100, Math.round((totalPaid / totalRepayable) * 100)) : 0;

    return {
      principal,
      totalRepayable,
      totalPaid,
      remainingBalance,
      interestAmount,
      paidCount,
      totalCount,
      progressPercent,
    };
  }, [selectedContract, contractTransactions]);

  // Handle subTab switch
  const handleSwitchSubTab = (tab: SubTab) => {
    setSubTab(tab);
    setSelectedPartyId("");
    setSelectedContractId("");
    if (onRoleChange) {
      if (tab === "borrowed") onRoleChange("creditor");
      if (tab === "lent") onRoleChange("debtor");
    }
  };

  // Open Edit Party Modal with current data
  const handleOpenEditParty = () => {
    if (!selectedParty) return;
    setEditPartyForm({
      id: selectedParty.partyId,
      displayName: selectedParty.displayName,
      phone: selectedParty.phone || "",
      note: selectedParty.note || "",
      role: selectedParty.role,
    });
    setEditPartyModalOpen(true);
  };

  // Submit Party Edit
  const handleSaveEditParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editPartyForm.displayName.trim()) {
      toast.error("กรุณาระบุชื่อคู่สัญญา");
      return;
    }

    try {
      await updatePartyMutation.mutateAsync({
        id: editPartyForm.id,
        displayName: editPartyForm.displayName.trim(),
        phone: editPartyForm.phone.trim(),
        note: editPartyForm.note.trim(),
        role: editPartyForm.role,
      });
      await utils.ledger.invalidate();
      toast.success("แก้ไขข้อมูลคู่สัญญาเรียบร้อยแล้ว");
      setEditPartyModalOpen(false);
    } catch (err: any) {
      toast.error(`แก้ไขไม่สำเร็จ: ${err.message}`);
    }
  };

  // Open Edit Contract Modal with current data
  const handleOpenEditContract = (c: any) => {
    setEditContractForm({
      id: c.contractId,
      title: c.title,
      principal: String(c.principal),
      interestRate: String(c.interestRate || 0),
      installmentCount: c.installmentCount || 1,
      startDate: c.startDate || new Date().toISOString().slice(0, 10),
      status: c.status || "active",
    });
    setEditContractModalOpen(true);
  };

  // Submit Contract Edit
  const handleSaveEditContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editContractForm.title.trim()) {
      toast.error("กรุณาระบุชื่อสัญญา");
      return;
    }

    try {
      await updateContractMutation.mutateAsync({
        id: editContractForm.id,
        title: editContractForm.title.trim(),
        principal: parseFloat(editContractForm.principal) || 0,
        interestRate: parseFloat(editContractForm.interestRate) || 0,
        installmentCount: editContractForm.installmentCount,
        startDate: editContractForm.startDate,
        status: editContractForm.status,
      });
      await utils.ledger.invalidate();
      toast.success("บันทึกการแก้ไขสัญญาเรียบร้อยแล้ว");
      setEditContractModalOpen(false);
    } catch (err: any) {
      toast.error(`แก้ไขสัญญาไม่สำเร็จ: ${err.message}`);
    }
  };

  // Open Edit Schedule Item Modal
  const handleOpenEditSchedule = (scheduleItem: any) => {
    const rawId = scheduleItem.transactionId.replace("schedule:", "");
    setEditScheduleForm({
      id: rawId,
      installmentNo: scheduleItem.installmentNo || 1,
      dueDate: scheduleItem.dueDate || new Date().toISOString().slice(0, 10),
      amount: String(scheduleItem.amount || 0),
      note: scheduleItem.note || "",
    });
    setEditScheduleModalOpen(true);
  };

  // Submit Schedule Item Edit
  const handleSaveEditSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(editScheduleForm.amount);
    if (!amt || amt <= 0) {
      toast.error("กรุณาระบุยอดเงินงวดที่ถูกต้อง");
      return;
    }

    try {
      await updateScheduleMutation.mutateAsync({
        id: editScheduleForm.id,
        dueDate: editScheduleForm.dueDate,
        amount: amt,
        note: editScheduleForm.note.trim() || undefined,
      });
      await utils.ledger.invalidate();
      toast.success("แก้ไขข้อมูลงวดชำระเรียบร้อยแล้ว");
      setEditScheduleModalOpen(false);
    } catch (err: any) {
      toast.error(`แก้ไขงวดไม่สำเร็จ: ${err.message}`);
    }
  };

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
      setPartyForm({ displayName: "", phone: "", note: "", role });
      if (res?.partyId) {
        setSelectedPartyId(res.partyId);
      }
    } catch (err: any) {
      toast.error(`เกิดข้อผิดพลาด: ${err.message}`);
    }
  };

  // Handle party deletion
  const handleDeleteParty = async () => {
    if (!selectedPartyId || !selectedParty) return;
    if (!confirm(`คุณต้องการลบรายชื่อ "${selectedParty.displayName}" พร้อมสัญญาทั้งหมดใช่หรือไม่?`)) return;

    try {
      await deletePartyMutation.mutateAsync({ id: selectedPartyId });
      await utils.ledger.invalidate();
      toast.success(`ลบรายชื่อ ${selectedParty.displayName} เรียบร้อยแล้ว`);
      setSelectedPartyId("");
      setSelectedContractId("");
    } catch (err: any) {
      toast.error(`ลบไม่สำเร็จ: ${err.message}`);
    }
  };

  // Handle contract deletion
  const handleDeleteContract = async () => {
    if (!selectedContractId || !selectedContract) return;
    if (!confirm(`คุณต้องการลบสัญญา "${selectedContract.title}" ใช่หรือไม่?`)) return;

    try {
      await deleteContractMutation.mutateAsync({ id: selectedContractId });
      await utils.ledger.invalidate();
      toast.success(`ลบสัญญาเรียบร้อยแล้ว`);
      setSelectedContractId("");
    } catch (err: any) {
      toast.error(`ลบสัญญาไม่สำเร็จ: ${err.message}`);
    }
  };

  // Handle contract creation with generated schedules
  const handleCreateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPartyId || !contractForm.title.trim()) return;
    if (formPrincipal <= 0) {
      toast.error("กรุณาระบุยอดเงินต้นที่ถูกต้อง");
      return;
    }

    const generatedSchedules = [];
    const [year, month, day] = contractForm.startDate.split("-").map(Number);
    for (let i = 1; i <= formCount; i++) {
      let dueDateStr = contractForm.startDate;
      if (contractForm.cycleType === "daily") {
        const d = new Date(year, month - 1, day + (i - 1));
        dueDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      } else {
        const d = new Date(year, month - 1 + (i - 1), day);
        dueDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      }

      generatedSchedules.push({
        installmentNo: i,
        dueDate: dueDateStr,
        amount: i === formCount ? Number((formTotalRepay - formPerInstallment * (formCount - 1)).toFixed(2)) : formPerInstallment,
        note: `งวดที่ ${i}/${formCount}`,
      });
    }

    try {
      const noteDetails = formDeduction > 0
        ? `[ยอดจริง] เงินต้น ฿${formPrincipal.toLocaleString()} หักค่าธรรมเนียม/งวดแรก ฿${formDeduction.toLocaleString()} (${isDebtor ? "ให้ยืมจริง" : "ได้รับจริง"} ฿${formNetActual.toLocaleString()})`
        : "";

      const res = await createContractMutation.mutateAsync({
        partyId: selectedPartyId,
        title: contractForm.title.trim() + (noteDetails ? ` · ${noteDetails}` : ""),
        principal: formPrincipal,
        interestRate: formRate,
        installmentCount: formCount,
        startDate: contractForm.startDate,
        status: "active",
        schedules: generatedSchedules,
      });
      await utils.ledger.invalidate();
      toast.success("สร้างสัญญาและตารางงวดสำเร็จ");
      setContractModalOpen(false);
      setContractForm({
        title: "",
        principal: "",
        deductionAmount: "0",
        interestRate: "0",
        installmentCount: "1",
        cycleType: "monthly",
        startDate: new Date().toISOString().slice(0, 10),
      });
      if (res?.contract?.contractId) {
        setSelectedContractId(res.contract.contractId);
      }
    } catch (err: any) {
      toast.error(`เกิดข้อผิดพลาด: ${err.message}`);
    }
  };

  // Pay schedule logic (จ่ายเงินกู้ยืม -> จ่ายออก, รับชำระคืน -> รับเข้า)
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
        source: isDebtor ? "ledger_creditor_collection" : "ledger_debtor_payment",
        note: data.note || (isDebtor ? `รับชำระงวดที่ ${activePaySchedule.installmentNo} (รับเข้า)` : `จ่ายชำระเงินกู้ยืมงวดที่ ${activePaySchedule.installmentNo} (จ่ายออก)`),
      });
      await utils.ledger.invalidate();
      toast.success(isDebtor ? "บันทึกการรับชำระเงินคืน (รับเข้า) สำเร็จ" : "บันทึกการจ่ายเงินกู้ยืม (จ่ายออก) สำเร็จ");
      setActivePaySchedule(null);
    } catch (err: any) {
      toast.error(`เกิดข้อผิดพลาด: ${err.message}`);
    }
  };

  // When a contract is generated from embedded LoanCalculator
  const handleContractCreatedFromCalc = (partyId: string, contractId: string) => {
    setSelectedPartyId(partyId);
    setSelectedContractId(contractId);
    setSubTab(role === "debtor" ? "lent" : "borrowed");
  };

  return (
    <div className="space-y-8">
      {/* 1. Page Header & Unified SubTab Switcher (ให้ยืม, กู้/บิล, คำนวณ รวมเป็นหน้าเดียว) */}
      <div className="space-y-4">
        <PageHeader
          kicker="UNIFIED DEBT & LOAN HUB"
          title="จัดการหนี้ & สัญญาเงินกู้"
          description="รวมการจัดการกู้ยืม บิลประจำตัว การปล่อยกู้ และเครื่องคิดเลขคำนวณสัญญาไว้ในที่เดียว"
          action={
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                icon={<Plus className="w-4 h-4" />}
                onClick={() => setPartyModalOpen(true)}
              >
                + เพิ่ม{subTab === "lent" ? "ลูกหนี้" : "เจ้าหนี้/บิล"}
              </Button>
            </div>
          }
        />

        {/* 3D Tactile Segmented Pill Switcher ("ปรับให้มีสีสัน มีความนูน") */}
        <div className="bg-[#FAF7F2] p-1.5 rounded-[18px] border border-[#1C1917]/10 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex flex-wrap sm:flex-nowrap gap-1.5">
          <button
            type="button"
            onClick={() => handleSwitchSubTab("borrowed")}
            className={`flex-1 min-h-[44px] px-4 py-2 rounded-[14px] text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              subTab === "borrowed"
                ? "bg-gradient-to-b from-[#2D2723] to-[#141210] text-white shadow-[0_4px_12px_rgba(0,0,0,0.18)] scale-[1.01] border border-black/20"
                : "text-[#78716C] hover:text-[#1C1917] hover:bg-white/60"
            }`}
          >
            <Receipt className={`w-4 h-4 ${subTab === "borrowed" ? "text-rose-400" : "text-[#78716C]"}`} />
            <span>ฉันเป็นลูกหนี้ (กู้ยืม & บิล)</span>
          </button>

          <button
            type="button"
            onClick={() => handleSwitchSubTab("lent")}
            className={`flex-1 min-h-[44px] px-4 py-2 rounded-[14px] text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              subTab === "lent"
                ? "bg-gradient-to-b from-[#2D2723] to-[#141210] text-white shadow-[0_4px_12px_rgba(0,0,0,0.18)] scale-[1.01] border border-black/20"
                : "text-[#78716C] hover:text-[#1C1917] hover:bg-white/60"
            }`}
          >
            <UserCheck className={`w-4 h-4 ${subTab === "lent" ? "text-emerald-400" : "text-[#78716C]"}`} />
            <span>ฉันเป็นเจ้าหนี้ (ให้ยืม)</span>
          </button>

          <button
            type="button"
            onClick={() => handleSwitchSubTab("calculator")}
            className={`flex-1 min-h-[44px] px-4 py-2 rounded-[14px] text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              subTab === "calculator"
                ? "bg-gradient-to-b from-[#2D2723] to-[#141210] text-white shadow-[0_4px_12px_rgba(0,0,0,0.18)] scale-[1.01] border border-black/20"
                : "text-[#78716C] hover:text-[#1C1917] hover:bg-white/60"
            }`}
          >
            <CalcIcon className={`w-4 h-4 ${subTab === "calculator" ? "text-amber-400" : "text-[#78716C]"}`} />
            <span>คำนวณ & สร้างสัญญา</span>
          </button>
        </div>
      </div>

      {/* 2. When SubTab is Calculator -> Render Embedded LoanCalculator */}
      {subTab === "calculator" ? (
        <div className="animate-in fade-in duration-200">
          <LoanCalculator onContractCreated={handleContractCreatedFromCalc} />
        </div>
      ) : (
        /* 3. When SubTab is Borrowed or Lent -> Render Full Ledger Hub */
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Top Stat Overview Cards for this specific role */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              label={isDebtor ? "จำนวนลูกหนี้ทั้งหมด" : "จำนวนเจ้าหนี้ & บิลทั้งหมด"}
              rawDisplay={
                <span className="text-2xl font-bold font-mono text-[#1C1917]">
                  {rawParties.length} ราย
                </span>
              }
              subtitle={isDebtor ? "ลูกหนี้ที่รอติดตามเรียกเก็บ" : "เจ้าหนี้และบิลที่ต้องทยอยจ่าย"}
              icon={<Users className="w-4 h-4" />}
            />
            <StatCard
              label={isDebtor ? "ทิศทางกระแสเงิน (เมื่อชำระ)" : "ทิศทางกระแสเงิน (เมื่อชำระ)"}
              rawDisplay={
                <span className={`text-2xl font-bold font-mono ${isDebtor ? "text-[#16A34A]" : "text-[#DC2626]"}`}>
                  {isDebtor ? "📥 รับเข้า (Inflow)" : "💸 จ่ายออก (Outflow)"}
                </span>
              }
              subtitle={isDebtor ? "ลูกหนี้จ่ายคืน -> เข้ากระเป๋าเรา" : "จ่ายคืนเงินกู้ -> ออกจากกระเป๋าเรา"}
              accentBar={isDebtor ? "income" : "expense"}
            />
            <StatCard
              label="การจัดการสัญญา & วงกลมกลาง"
              rawDisplay={
                <span className="text-2xl font-bold font-mono text-[#1C1917]">
                  แก้ไขได้ทุกส่วน
                </span>
              }
              subtitle="แก้ไขชื่อ, เงินต้น, วันที่, ยอดผ่อน และสถานะได้ทันที"
              icon={<Edit2 className="w-4 h-4 text-[#D97706]" />}
              accentBar="due"
            />
          </div>

          {/* Main Grid: Left Column (Party List) & Right Column (Contracts & Middle Editable Circle) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Party List */}
            <div className="lg:col-span-4 space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-semibold text-[#1C1917]">
                  รายชื่อ{isDebtor ? "ลูกหนี้" : "เจ้าหนี้"} ({filteredParties.length})
                </span>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <input
                  type="text"
                  placeholder={`ค้นหาชื่อ${isDebtor ? "ลูกหนี้" : "เจ้าหนี้"} หรือเบอร์โทร...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-9 px-3 bg-white border border-[#1C1917]/10 rounded-[12px] text-xs text-[#1C1917] placeholder:text-[#78716C] shadow-xs"
                />
              </div>

              {filteredParties.length === 0 ? (
                <EmptyState
                  title={`ยังไม่มีรายชื่อ${isDebtor ? "ลูกหนี้" : "เจ้าหนี้"}`}
                  description={`กดปุ่มเพื่อเพิ่ม${isDebtor ? "ลูกหนี้" : "เจ้าหนี้"}คนแรก`}
                  actionLabel="เพิ่มรายชื่อ"
                  onAction={() => setPartyModalOpen(true)}
                />
              ) : (
                <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
                  {filteredParties.map((p) => {
                    const isSelected = p.partyId === selectedPartyId;
                    return (
                      <div
                        key={p.partyId}
                        onClick={() => {
                          setSelectedPartyId(p.partyId);
                          setSelectedContractId("");
                        }}
                        className={`p-4 rounded-[18px] border transition-all cursor-pointer ${
                          isSelected
                            ? "bg-gradient-to-b from-[#2D2723] to-[#141210] text-white border-black/30 shadow-[0_6px_20px_rgba(0,0,0,0.18)] scale-[1.01]"
                            : "bg-[#FFFCF8] text-[#1C1917] border-[#1C1917]/10 hover:border-[#1C1917]/25 shadow-xs"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm truncate">
                                {p.displayName}
                              </span>
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                  isSelected
                                    ? "bg-white/20 text-white"
                                    : isDebtor
                                    ? "bg-emerald-500/10 text-emerald-700"
                                    : "bg-rose-500/10 text-rose-700"
                                }`}
                              >
                                {isDebtor ? "ลูกหนี้" : "เจ้าหนี้"}
                              </span>
                            </div>
                            {p.phone && (
                              <div
                                className={`text-xs mt-1 flex items-center gap-1.5 ${
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

            {/* Right Column: Contracts, Middle Circle / Party Detail, and Remaining Balances */}
            <div className="lg:col-span-8 space-y-6">
              {!selectedParty ? (
                <div className="bg-[#FFFCF8] rounded-[20px] border border-[#1C1917]/10 p-8 text-center text-[#78716C] text-sm shadow-xs">
                  เลือกรายชื่อ{isDebtor ? "ลูกหนี้" : "เจ้าหนี้"}จากแถบด้านซ้าย เพื่อดูสัญญาและตารางงวดชำระ
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Party Header Card (Tactile Embossed Card with Edit Button for Middle Circle) */}
                  <div className="bg-gradient-to-br from-[#FFFFFF] via-[#FFFCF8] to-[#FAF6EE] rounded-[20px] border border-[#1C1917]/10 p-5 sm:p-6 shadow-[0_4px_20px_rgba(0,0,0,0.06)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5">
                        <h2 className="text-xl font-bold text-[#1C1917]">
                          {selectedParty.displayName}
                        </h2>
                        <StatusChip
                          status={isDebtor ? "lent" : "borrowed"}
                          label={isDebtor ? "ฉันเป็นเจ้าหนี้" : "ฉันเป็นลูกหนี้"}
                        />
                      </div>
                      {selectedParty.phone && (
                        <p className="text-xs text-[#78716C]">
                          โทร: <span className="font-mono text-[#1C1917] font-medium">{selectedParty.phone}</span>
                          {selectedParty.note ? ` · ${selectedParty.note}` : ""}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Edit Party Button (แก้ไขข้อมูลคู่สัญญา) */}
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Edit2 className="w-3.5 h-3.5 text-[#D97706]" />}
                        onClick={handleOpenEditParty}
                      >
                        แก้ไขคู่สัญญา
                      </Button>

                      {/* Add Contract Button */}
                      <Button
                        variant="primary"
                        size="sm"
                        icon={<Plus className="w-3.5 h-3.5" />}
                        onClick={() => setContractModalOpen(true)}
                      >
                        + เพิ่มสัญญา
                      </Button>

                      {/* Delete Party Button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Trash2 className="w-3.5 h-3.5 text-[#DC2626]" />}
                        onClick={handleDeleteParty}
                      >
                        ลบ
                      </Button>
                    </div>
                  </div>

                  {/* Party Contracts List */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-xs font-semibold text-[#1C1917]">
                        สัญญาและรายการหนี้ ({partyContracts.length})
                      </span>
                    </div>

                    {partyContracts.length === 0 ? (
                      <EmptyState
                        title="ยังไม่มีสัญญาผูกกับบัญชีนี้"
                        description="กดปุ่มด้านบนเพื่อสร้างสัญญาเงินกู้ หรือแผนผ่อนสินค้าแรก"
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
                                  ? "border-[#1C1917] ring-2 ring-[#1C1917]/20 shadow-[0_6px_24px_rgba(0,0,0,0.08)] bg-gradient-to-r from-amber-500/5 via-[#FFFCF8] to-[#FFFCF8]"
                                  : "border-[#1C1917]/10 hover:border-[#1C1917]/25 shadow-xs"
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
                                  <p className="text-xs text-[#78716C] mt-1">
                                    เริ่ม {c.startDate} · {c.installmentCount} งวด · ดอกเบี้ย {c.interestRate}%
                                  </p>
                                </div>

                                <div className="flex items-center gap-4 shrink-0">
                                  <div className="text-right">
                                    <div className="text-[11px] text-[#78716C]">ยอดเงินต้น</div>
                                    <Money amount={c.principal} size="lg" />
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenEditContract(c);
                                    }}
                                    icon={<Edit2 className="w-3.5 h-3.5 text-[#D97706]" />}
                                  >
                                    แก้ไข
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Selected Contract Detailed View with Remaining Balances & Schedule Editing */}
                  {selectedContract && contractStats && (
                    <div className="bg-[#FFFCF8] rounded-[22px] border border-[#1C1917]/10 p-6 space-y-6 shadow-[0_6px_28px_rgba(0,0,0,0.07)] animate-in fade-in duration-200">
                      {/* Contract Top Banner & Action Buttons */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#1C1917]/10 pb-4 gap-3">
                        <div>
                          <span className="text-[11px] font-mono text-[#78716C] uppercase tracking-wider">
                            รายละเอียดสัญญา & ตารางงวด
                          </span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <h4 className="text-lg font-bold text-[#1C1917]">
                              {selectedContract.title}
                            </h4>
                            <StatusChip status={selectedContract.status} />
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={<Edit2 className="w-3.5 h-3.5 text-[#D97706]" />}
                            onClick={() => handleOpenEditContract(selectedContract)}
                          >
                            แก้ไขสัญญา
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={<Trash2 className="w-3.5 h-3.5 text-[#DC2626]" />}
                            onClick={handleDeleteContract}
                          >
                            ลบสัญญา
                          </Button>
                        </div>
                      </div>

                      {/* 6-Part Financial Breakdown & Remaining Balance Displays (และมียอดคงเหลือแต่ล่ะส่วนบอก) */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                        {/* 1. Principal */}
                        <div className="p-3.5 bg-[#FAF7F2] rounded-[16px] border border-[#1C1917]/5 text-center shadow-xs">
                          <div className="text-[10px] text-[#78716C] font-medium">1. เงินต้นสัญญา</div>
                          <div className="font-bold font-mono text-sm sm:text-base text-[#1C1917] mt-1">
                            ฿{contractStats.principal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                          </div>
                        </div>

                        {/* 2. Total Repayable */}
                        <div className="p-3.5 bg-[#FAF7F2] rounded-[16px] border border-[#1C1917]/5 text-center shadow-xs">
                          <div className="text-[10px] text-[#78716C] font-medium">2. ยอดรวมทั้งสัญญา</div>
                          <div className="font-bold font-mono text-sm sm:text-base text-[#1C1917] mt-1">
                            ฿{contractStats.totalRepayable.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                          </div>
                        </div>

                        {/* 3. Interest Profit/Cost */}
                        <div className="p-3.5 bg-[#FAF7F2] rounded-[16px] border border-[#1C1917]/5 text-center shadow-xs">
                          <div className="text-[10px] text-[#78716C] font-medium">3. ดอกเบี้ยสัญญา</div>
                          <div className="font-bold font-mono text-sm sm:text-base text-[#D97706] mt-1">
                            +฿{contractStats.interestAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                          </div>
                        </div>

                        {/* 4. Total Paid */}
                        <div className="p-3.5 bg-emerald-500/10 rounded-[16px] border border-emerald-500/20 text-center shadow-xs">
                          <div className="text-[10px] text-emerald-800 font-medium">4. ชำระแล้ว</div>
                          <div className="font-bold font-mono text-sm sm:text-base text-[#16A34A] mt-1">
                            ฿{contractStats.totalPaid.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                          </div>
                        </div>

                        {/* 5. Remaining Balance (ยอดคงเหลือค้างชำระ) */}
                        <div className="p-3.5 bg-rose-500/10 rounded-[16px] border border-rose-500/20 text-center shadow-xs col-span-2 sm:col-span-2">
                          <div className="text-[10px] text-rose-800 font-bold uppercase tracking-wider">
                            5. ยอดคงเหลือค้างชำระ (Remaining)
                          </div>
                          <div className="font-bold font-mono text-base sm:text-lg text-[#DC2626] mt-1">
                            ฿{contractStats.remainingBalance.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                          </div>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center justify-between text-xs text-[#78716C]">
                          <span>
                            ชำระแล้ว {contractStats.paidCount} จาก {contractStats.totalCount} งวด
                          </span>
                          <span className="font-mono font-bold text-[#16A34A]">
                            {contractStats.progressPercent}%
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-[#1C1917]/10 rounded-full overflow-hidden flex">
                          <div
                            className="bg-gradient-to-r from-emerald-500 to-green-600 h-full transition-all duration-300"
                            style={{ width: `${contractStats.progressPercent}%` }}
                          />
                        </div>
                      </div>

                      {/* Schedules List with Pay & Edit Action Buttons */}
                      <div className="space-y-3 pt-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-[#1C1917]">
                            รายการงวดชำระและประวัติ ({contractTransactions.length} รายการ)
                          </span>
                          <span className="text-[11px] text-[#78716C]">
                            {isDebtor ? "กดรับชำระ -> เงินเข้า" : "กดจ่ายเงิน -> จ่ายออก"}
                          </span>
                        </div>

                        <div className="space-y-2.5">
                          {contractTransactions.map((tx) => {
                            const isSchedule = tx.type === "scheduled";
                            const isSettled = Boolean(tx.paidAt);
                            return (
                              <div
                                key={tx.transactionId}
                                className="p-4 bg-white rounded-[16px] border border-[#1C1917]/10 shadow-xs flex items-center justify-between gap-3 hover:border-[#1C1917]/25 transition-all"
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
                                    <div className="text-[11px] text-[#78716C] mt-0.5">
                                      {tx.dueDate ? `กำหนดชำระ: ${tx.dueDate}` : `บันทึกเมื่อ: ${tx.paidAt?.slice(0, 10) || "—"}`}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 sm:gap-3 shrink-0 text-right">
                                  <Money
                                    amount={tx.amount}
                                    size="base"
                                    sentiment={isSettled ? "income" : "default"}
                                  />

                                  {/* Edit Schedule Button (แก้งวด) */}
                                  {isSchedule && !isSettled && (
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      onClick={() => handleOpenEditSchedule(tx)}
                                      className="text-xs h-8 px-2.5"
                                      icon={<Edit2 className="w-3 h-3 text-[#D97706]" />}
                                    >
                                      แก้งวด
                                    </Button>
                                  )}

                                  {/* Pay / Receive Button */}
                                  {isSchedule && !isSettled && (
                                    <Button
                                      size="sm"
                                      variant={isDebtor ? "success" : "danger"}
                                      onClick={() => {
                                        const rawScheduleId = tx.transactionId.replace("schedule:", "");
                                        setActivePaySchedule({
                                          scheduleId: rawScheduleId,
                                          amount: Number(tx.amount || 0),
                                          installmentNo: 1,
                                          contractTitle: selectedContract.title,
                                        });
                                      }}
                                      className="text-xs h-8 px-3"
                                    >
                                      {isDebtor ? "📥 รับชำระ (รับเข้า)" : "💸 จ่ายเงินกู้ (จ่ายออก)"}
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
        </div>
      )}

      {/* MODAL 1: Create Party Modal */}
      {partyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[#FFFCF8] rounded-[24px] border border-[#1C1917]/10 p-6 shadow-2xl relative animate-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-[#1C1917] mb-1">
              เพิ่มรายชื่อ{isDebtor ? "ลูกหนี้ (ให้ยืม)" : "เจ้าหนี้ (กู้ยืม)"}ใหม่
            </h3>
            <p className="text-xs text-[#78716C] mb-5">
              ระบุชื่อและเบอร์โทรศัพท์เพื่อใช้สร้างสัญญา
            </p>

            <form onSubmit={handleCreateParty} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#1C1917] mb-1">
                  ชื่อ-นามสกุล หรือชื่อร้านค้า / บุคคล *
                </label>
                <input
                  type="text"
                  required
                  placeholder="เช่น สมชาย วัฒนากูล"
                  value={partyForm.displayName}
                  onChange={(e) =>
                    setPartyForm({ ...partyForm, displayName: e.target.value })
                  }
                  className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[12px] text-sm text-[#1C1917]"
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
                  className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[12px] text-sm text-[#1C1917]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1C1917] mb-1">
                  บันทึกโน้ต
                </label>
                <input
                  type="text"
                  placeholder="เช่น ลูกค้าผ่อนสินค้า, สินเชื่อหมุนเวียน"
                  value={partyForm.note}
                  onChange={(e) =>
                    setPartyForm({ ...partyForm, note: e.target.value })
                  }
                  className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[12px] text-sm text-[#1C1917]"
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

      {/* MODAL 2: Edit Party Modal (วงกลมตรงกลางสัญญาต้องแก้ไขข้อมูลได้) */}
      {editPartyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[#FFFCF8] rounded-[24px] border border-[#1C1917]/10 p-6 shadow-2xl relative animate-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-[#1C1917] mb-1">
              แก้ไขข้อมูลคู่สัญญา (วงกลมกลาง)
            </h3>
            <p className="text-xs text-[#78716C] mb-5">
              ปรับปรุงชื่อ เบอร์โทร บันทึก หรือสลับบทบาทเจ้าหนี้/ลูกหนี้
            </p>

            <form onSubmit={handleSaveEditParty} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#1C1917] mb-1">
                  ชื่อคู่สัญญา *
                </label>
                <input
                  type="text"
                  required
                  value={editPartyForm.displayName}
                  onChange={(e) =>
                    setEditPartyForm({ ...editPartyForm, displayName: e.target.value })
                  }
                  className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[12px] text-sm text-[#1C1917]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1C1917] mb-1">
                  บทบาท (Role)
                </label>
                <select
                  value={editPartyForm.role}
                  onChange={(e) =>
                    setEditPartyForm({ ...editPartyForm, role: e.target.value as Role })
                  }
                  className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[12px] text-sm text-[#1C1917]"
                >
                  <option value="debtor">ฉันเป็นเจ้าหนี้ (บุคคลนี้เป็นลูกหนี้)</option>
                  <option value="creditor">ฉันเป็นลูกหนี้ (บุคคลนี้เป็นเจ้าหนี้/บิล)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1C1917] mb-1">
                  เบอร์โทรศัพท์
                </label>
                <input
                  type="tel"
                  value={editPartyForm.phone}
                  onChange={(e) =>
                    setEditPartyForm({ ...editPartyForm, phone: e.target.value })
                  }
                  className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[12px] text-sm text-[#1C1917]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1C1917] mb-1">
                  บันทึกโน้ต
                </label>
                <input
                  type="text"
                  value={editPartyForm.note}
                  onChange={(e) =>
                    setEditPartyForm({ ...editPartyForm, note: e.target.value })
                  }
                  className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[12px] text-sm text-[#1C1917]"
                />
              </div>

              <div className="flex items-center gap-2 pt-3">
                <Button
                  type="button"
                  variant="secondary"
                  fullWidth
                  onClick={() => setEditPartyModalOpen(false)}
                >
                  ยกเลิก
                </Button>
                <Button type="submit" variant="primary" fullWidth>
                  บันทึกการแก้ไข
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Create Contract Modal */}
      {contractModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-[#FFFCF8] rounded-[24px] border border-[#1C1917]/10 p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-[#1C1917] mb-1">
              สร้างสัญญาใหม่ ({isDebtor ? "ให้ยืม" : "กู้ยืม"})
            </h3>
            <p className="text-xs text-[#78716C] mb-4">
              คู่สัญญา: <b>{selectedParty?.displayName}</b> ({isDebtor ? "ลูกหนี้" : "เจ้าหนี้"})
            </p>

            <form onSubmit={handleCreateContract} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#1C1917] mb-1">
                  ชื่อสัญญา / รายการสินค้า *
                </label>
                <input
                  type="text"
                  required
                  placeholder="เช่น สัญญาเงินกู้ระยะสั้น, ผ่อนสินค้า"
                  value={contractForm.title}
                  onChange={(e) =>
                    setContractForm({ ...contractForm, title: e.target.value })
                  }
                  className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[12px] text-sm text-[#1C1917]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1C1917] mb-1">
                    ยอดเงินต้นตามสัญญา (บาท) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="1"
                    required
                    placeholder="เช่น 10000"
                    value={contractForm.principal}
                    onChange={(e) =>
                      setContractForm({ ...contractForm, principal: e.target.value })
                    }
                    className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[12px] text-sm font-mono tabular-nums text-[#1C1917]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#1C1917] mb-1">
                    หักค่าธรรมเนียม/งวดแรก (บาท)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0"
                    value={contractForm.deductionAmount}
                    onChange={(e) =>
                      setContractForm({ ...contractForm, deductionAmount: e.target.value })
                    }
                    className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[12px] text-sm font-mono tabular-nums text-[#1C1917]"
                  />
                </div>
              </div>

              {/* Net Actual Highlight */}
              <div className="p-3.5 bg-emerald-500/10 rounded-[14px] border border-emerald-500/20 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-emerald-900">
                    {isDebtor ? "ยอดเงินที่ให้ยืมจริง (โอนจริง)" : "ยอดเงินที่ได้รับจริง (เข้ากระเป๋าจริง)"}
                  </div>
                  <div className="text-[11px] text-[#78716C]">
                    เงินต้น ฿{formPrincipal.toLocaleString()} - หักล่วงหน้า ฿{formDeduction.toLocaleString()}
                  </div>
                </div>
                <div className="text-lg font-bold font-mono text-[#16A34A]">
                  ฿{formNetActual.toLocaleString()}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1C1917] mb-1">
                    ดอกเบี้ยรวม (%)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={contractForm.interestRate}
                    onChange={(e) =>
                      setContractForm({ ...contractForm, interestRate: e.target.value })
                    }
                    className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[12px] text-sm font-mono tabular-nums text-[#1C1917]"
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
                    className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[12px] text-sm font-mono tabular-nums text-[#1C1917]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#1C1917] mb-1">
                    รอบงวด
                  </label>
                  <select
                    value={contractForm.cycleType}
                    onChange={(e) =>
                      setContractForm({ ...contractForm, cycleType: e.target.value as any })
                    }
                    className="w-full h-10 px-2 bg-white border border-[#1C1917]/15 rounded-[12px] text-xs text-[#1C1917]"
                  >
                    <option value="monthly">รายเดือน</option>
                    <option value="daily">รายวัน</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
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
                    className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[12px] text-sm text-[#1C1917]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#1C1917] mb-1">
                    ยอดผ่อนต่องวด (ประมาณ)
                  </label>
                  <div className="h-10 px-3 bg-stone-100 rounded-[12px] flex items-center font-mono text-sm font-semibold text-[#1C1917]">
                    ฿{formPerInstallment.toLocaleString()} / งวด
                  </div>
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
                  สร้างสัญญาและตารางงวด
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Edit Contract Modal */}
      {editContractModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-[#FFFCF8] rounded-[24px] border border-[#1C1917]/10 p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-[#1C1917] mb-1">
              แก้ไขข้อมูลสัญญา
            </h3>
            <p className="text-xs text-[#78716C] mb-4">
              ปรับปรุงชื่อ ยอดเงินต้น ดอกเบี้ย หรือสถานะสัญญา
            </p>

            <form onSubmit={handleSaveEditContract} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#1C1917] mb-1">
                  ชื่อสัญญา / รายการ *
                </label>
                <input
                  type="text"
                  required
                  value={editContractForm.title}
                  onChange={(e) =>
                    setEditContractForm({ ...editContractForm, title: e.target.value })
                  }
                  className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[12px] text-sm text-[#1C1917]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1C1917] mb-1">
                    ยอดเงินต้นสัญญา (บาท) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={editContractForm.principal}
                    onChange={(e) =>
                      setEditContractForm({ ...editContractForm, principal: e.target.value })
                    }
                    className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[12px] text-sm font-mono tabular-nums text-[#1C1917]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#1C1917] mb-1">
                    ดอกเบี้ย (%)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={editContractForm.interestRate}
                    onChange={(e) =>
                      setEditContractForm({ ...editContractForm, interestRate: e.target.value })
                    }
                    className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[12px] text-sm font-mono tabular-nums text-[#1C1917]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1C1917] mb-1">
                    วันเริ่มสัญญา
                  </label>
                  <input
                    type="date"
                    required
                    value={editContractForm.startDate}
                    onChange={(e) =>
                      setEditContractForm({ ...editContractForm, startDate: e.target.value })
                    }
                    className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[12px] text-sm text-[#1C1917]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#1C1917] mb-1">
                    สถานะสัญญา
                  </label>
                  <select
                    value={editContractForm.status}
                    onChange={(e) =>
                      setEditContractForm({ ...editContractForm, status: e.target.value as any })
                    }
                    className="w-full h-10 px-2 bg-white border border-[#1C1917]/15 rounded-[12px] text-xs text-[#1C1917]"
                  >
                    <option value="active">กำลังผ่อนชำระ (Active)</option>
                    <option value="completed">ชำระครบถ้วนแล้ว (Completed)</option>
                    <option value="cancelled">ยกเลิกสัญญา (Cancelled)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-3">
                <Button
                  type="button"
                  variant="secondary"
                  fullWidth
                  onClick={() => setEditContractModalOpen(false)}
                >
                  ยกเลิก
                </Button>
                <Button type="submit" variant="primary" fullWidth>
                  บันทึกการแก้ไขสัญญา
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: Edit Schedule Item Modal (แก้งวด) */}
      {editScheduleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[#FFFCF8] rounded-[24px] border border-[#1C1917]/10 p-6 shadow-2xl relative animate-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-[#1C1917] mb-1">
              แก้ไขงวดชำระ
            </h3>
            <p className="text-xs text-[#78716C] mb-4">
              ปรับปรุงวันครบกำหนดชำระ ยอดผ่อน หรือบันทึกหมายเหตุ
            </p>

            <form onSubmit={handleSaveEditSchedule} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#1C1917] mb-1">
                  วันครบกำหนดชำระ *
                </label>
                <input
                  type="date"
                  required
                  value={editScheduleForm.dueDate}
                  onChange={(e) =>
                    setEditScheduleForm({ ...editScheduleForm, dueDate: e.target.value })
                  }
                  className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[12px] text-sm text-[#1C1917]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1C1917] mb-1">
                  ยอดเงินงวดนี้ (บาท) *
                </label>
                <input
                  type="number"
                  step="any"
                  min="1"
                  required
                  value={editScheduleForm.amount}
                  onChange={(e) =>
                    setEditScheduleForm({ ...editScheduleForm, amount: e.target.value })
                  }
                  className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[12px] text-sm font-mono tabular-nums text-[#1C1917]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1C1917] mb-1">
                  บันทึกหมายเหตุงวด
                </label>
                <input
                  type="text"
                  placeholder="เช่น งวดที่ 1/5, ยอดปรับลดพิเศษ"
                  value={editScheduleForm.note}
                  onChange={(e) =>
                    setEditScheduleForm({ ...editScheduleForm, note: e.target.value })
                  }
                  className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[12px] text-sm text-[#1C1917]"
                />
              </div>

              <div className="flex items-center gap-2 pt-3">
                <Button
                  type="button"
                  variant="secondary"
                  fullWidth
                  onClick={() => setEditScheduleModalOpen(false)}
                >
                  ยกเลิก
                </Button>
                <Button type="submit" variant="primary" fullWidth>
                  บันทึกงวด
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
          title={isDebtor ? `บันทึกรับเงินคืน: ${activePaySchedule.contractTitle}` : `บันทึกจ่ายเงินกู้ยืม: ${activePaySchedule.contractTitle}`}
          subtitle={`งวดที่ ${activePaySchedule.installmentNo} (${isDebtor ? "รับเข้า" : "จ่ายออก"})`}
          defaultAmount={activePaySchedule.amount}
          totalDue={activePaySchedule.amount}
          type={isDebtor ? "receive" : "pay"}
          onConfirm={handleConfirmPaySchedule}
        />
      )}
    </div>
  );
}
