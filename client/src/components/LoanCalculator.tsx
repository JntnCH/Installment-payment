import React, { useState, useMemo } from "react";
import {
  Calculator,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Coins,
  FileCheck,
  Percent,
  Plus,
  RotateCcw,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  calculateDailyLoan,
  calculateFloatingLoan,
  calculateFlatInstallment,
  calculateAmortization,
  LoanType,
  GeneratedScheduleItem,
} from "@/lib/calculator";
import {
  PageHeader,
  StatCard,
  Money,
  Button,
  StatusChip,
} from "./design-system";

interface LoanCalculatorProps {
  onContractCreated?: (partyId: string, contractId: string) => void;
}

export default function LoanCalculator({ onContractCreated }: LoanCalculatorProps) {
  const [loanType, setLoanType] = useState<LoanType>("daily_informal");
  const [myRole, setMyRole] = useState<"debtor" | "creditor">("debtor"); // default: ฉันเป็นลูกหนี้
  const [partyType, setPartyType] = useState<"existing" | "new">("existing");
  const [selectedPartyId, setSelectedPartyId] = useState<string>("");
  const [newPartyName, setNewPartyName] = useState("");
  const [newPartyPhone, setNewPartyPhone] = useState("");
  const [contractTitle, setContractTitle] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);

  // Daily Informal Loan State
  const [dailyInputMode, setDailyInputMode] = useState<"by_payment" | "by_rate" | "by_actual_received">("by_payment");
  const [dailyPrincipal, setDailyPrincipal] = useState(4000);
  const [dailyInstallmentInput, setDailyInstallmentInput] = useState(200);
  const [dailyRate, setDailyRate] = useState(25);
  const [dailyDays, setDailyDays] = useState(25);
  const [dailyFee, setDailyFee] = useState(250);
  const [dailyFirstDeduct, setDailyFirstDeduct] = useState(200);
  const [dailyActualReceived, setDailyActualReceived] = useState(3550);
  const [dailyStartDate, setDailyStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dailySkipSunday, setDailySkipSunday] = useState(false);

  // Floating Interest Loan State
  const [floatingPrincipal, setFloatingPrincipal] = useState(20000);
  const [floatingRate, setFloatingRate] = useState(10);
  const [floatingCycle, setFloatingCycle] = useState<"monthly" | "biweekly" | "weekly" | "daily">("monthly");
  const [floatingEstCycles, setFloatingEstCycles] = useState(3);
  const [floatingStartDate, setFloatingStartDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Flat Rate Installment State
  const [flatItemPrice, setFlatItemPrice] = useState(35000);
  const [flatDownPayment, setFlatDownPayment] = useState(5000);
  const [flatRatePerYear, setFlatRatePerYear] = useState(12);
  const [flatMonths, setFlatMonths] = useState(10);
  const [flatStartDate, setFlatStartDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Amortization Loan State
  const [amortPrincipal, setAmortPrincipal] = useState(50000);
  const [amortAnnualRate, setAmortAnnualRate] = useState(18);
  const [amortMonths, setAmortMonths] = useState(12);
  const [amortStartDate, setAmortStartDate] = useState(() => new Date().toISOString().slice(0, 10));

  const partiesQuery = trpc.ledger.listParties.useQuery();
  const createPartyMutation = trpc.ledger.createParty.useMutation();
  const createContractMutation = trpc.ledger.createContract.useMutation();
  const utils = trpc.useUtils();

  const allParties = partiesQuery.data || [];
  // Filter parties by selected role (if myRole is debtor, we look for creditor parties, and vice versa)
  const parties = allParties.filter((p) => p.role === (myRole === "debtor" ? "creditor" : "debtor"));

  // Computation Results
  const dailyResult = useMemo(() => {
    if (dailyInputMode === "by_payment") {
      // Auto calculates interest from dailyInstallment * days - principal!
      return calculateDailyLoan({
        principal: dailyPrincipal,
        dailyInstallment: dailyInstallmentInput,
        days: dailyDays,
        feeAmount: dailyFee,
        firstDeductAmount: dailyFirstDeduct,
        startDate: dailyStartDate,
        skipSundays: dailySkipSunday,
      });
    } else if (dailyInputMode === "by_actual_received") {
      return calculateDailyLoan({
        principal: dailyPrincipal,
        dailyInstallment: dailyInstallmentInput,
        days: dailyDays,
        feeAmount: dailyFee,
        firstDeductAmount: dailyFirstDeduct,
        actualReceivedAmount: dailyActualReceived,
        startDate: dailyStartDate,
        skipSundays: dailySkipSunday,
      });
    } else {
      return calculateDailyLoan({
        principal: dailyPrincipal,
        ratePercent: dailyRate,
        days: dailyDays,
        feeAmount: dailyFee,
        firstDeductAmount: dailyFirstDeduct,
        startDate: dailyStartDate,
        skipSundays: dailySkipSunday,
      });
    }
  }, [
    dailyInputMode,
    dailyPrincipal,
    dailyInstallmentInput,
    dailyRate,
    dailyDays,
    dailyFee,
    dailyFirstDeduct,
    dailyActualReceived,
    dailyStartDate,
    dailySkipSunday,
  ]);

  const floatingResult = useMemo(
    () =>
      calculateFloatingLoan({
        principal: floatingPrincipal,
        interestRatePerCycle: floatingRate,
        cycleType: floatingCycle,
        cycleCount: floatingEstCycles,
        feeAmount: 0,
        startDate: floatingStartDate,
      }),
    [floatingPrincipal, floatingRate, floatingCycle, floatingEstCycles, floatingStartDate]
  );

  const flatResult = useMemo(
    () =>
      calculateFlatInstallment({
        price: flatItemPrice,
        downPayment: flatDownPayment,
        ratePercent: flatRatePerYear,
        installmentCount: flatMonths,
        startDate: flatStartDate,
      }),
    [flatItemPrice, flatDownPayment, flatRatePerYear, flatMonths, flatStartDate]
  );

  const amortResult = useMemo(
    () =>
      calculateAmortization({
        principal: amortPrincipal,
        annualRate: amortAnnualRate,
        months: amortMonths,
        startDate: amortStartDate,
      }),
    [amortPrincipal, amortAnnualRate, amortMonths, amortStartDate]
  );

  // Active calculation details
  const activeDetails = useMemo(() => {
    switch (loanType) {
      case "daily_informal": {
        const netText = `(รับจริง ฿${dailyResult.netDisbursed.toLocaleString()})`;
        return {
          title:
            contractTitle ||
            `${myRole === "debtor" ? "กู้ยืมรายวัน" : "ให้ยืมรายวัน"} ${dailyDays} วัน จ่ายวันละ ฿${dailyResult.dailyInstallment.toLocaleString()} ${netText}`,
          principal: dailyPrincipal,
          interestRate: Number(dailyResult.ratePercent.toFixed(2)),
          installmentCount: dailyResult.schedules.length,
          startDate: dailyStartDate,
          schedules: dailyResult.schedules.map((s: GeneratedScheduleItem) => ({
            installmentNo: s.installmentNo,
            dueDate: s.dueDate,
            amount: s.amount,
            note: s.note,
          })),
        };
      }
      case "floating_interest":
        return {
          title: contractTitle || `เงินกู้ดอกลอย ${floatingRate}% (เงินต้น ฿${floatingPrincipal.toLocaleString()})`,
          principal: floatingPrincipal,
          interestRate: floatingRate,
          installmentCount: floatingResult.schedules.length,
          startDate: floatingStartDate,
          schedules: floatingResult.schedules.map((s: GeneratedScheduleItem) => ({
            installmentNo: s.installmentNo,
            dueDate: s.dueDate,
            amount: s.amount,
            note: s.note,
          })),
        };
      case "flat_installment":
        return {
          title: contractTitle || `ผ่อนสินค้า ${flatMonths} งวด (ยอดจัด ฿${flatResult.principal.toLocaleString()})`,
          principal: flatResult.principal,
          interestRate: flatRatePerYear,
          installmentCount: flatResult.schedules.length,
          startDate: flatStartDate,
          schedules: flatResult.schedules.map((s: GeneratedScheduleItem) => ({
            installmentNo: s.installmentNo,
            dueDate: s.dueDate,
            amount: s.amount,
            note: s.note,
          })),
        };
      case "effective_amortization":
        return {
          title: contractTitle || `สินเชื่อลดต้นลดดอก ${amortMonths} งวด (฿${amortPrincipal.toLocaleString()})`,
          principal: amortPrincipal,
          interestRate: amortAnnualRate,
          installmentCount: amortResult.schedules.length,
          startDate: amortStartDate,
          schedules: amortResult.schedules.map((s: GeneratedScheduleItem) => ({
            installmentNo: s.installmentNo,
            dueDate: s.dueDate,
            amount: s.amount,
            note: s.note,
          })),
        };
    }
  }, [
    loanType,
    myRole,
    contractTitle,
    dailyPrincipal,
    dailyDays,
    dailyStartDate,
    dailyResult,
    floatingPrincipal,
    floatingRate,
    floatingStartDate,
    floatingResult,
    flatItemPrice,
    flatMonths,
    flatRatePerYear,
    flatStartDate,
    flatResult,
    amortPrincipal,
    amortAnnualRate,
    amortMonths,
    amortStartDate,
    amortResult,
  ]);

  // Handle Save Contract
  const handleSaveContract = async () => {
    let partyId = selectedPartyId;
    const targetPartyRole = myRole === "debtor" ? "creditor" : "debtor";

    if (partyType === "new") {
      if (!newPartyName.trim()) {
        toast.error(`กรุณาระบุชื่อ${myRole === "debtor" ? "เจ้าหนี้" : "ลูกหนี้"}`);
        return;
      }
      setSaveLoading(true);
      try {
        const createdParty = await createPartyMutation.mutateAsync({
          displayName: newPartyName.trim(),
          role: targetPartyRole,
          phone: newPartyPhone.trim(),
          note: `สร้างอัตโนมัติจากโปรแกรมคำนวณ (${loanType})`,
        });
        if (createdParty?.partyId) {
          partyId = createdParty.partyId;
        }
      } catch (err: any) {
        toast.error(`สร้างรายชื่อไม่สำเร็จ: ${err.message}`);
        setSaveLoading(false);
        return;
      }
    }

    if (!partyId) {
      toast.error(`กรุณาเลือก${myRole === "debtor" ? "เจ้าหนี้" : "ลูกหนี้"} หรือเพิ่มรายชื่อใหม่`);
      return;
    }

    setSaveLoading(true);
    try {
      const createdContract = await createContractMutation.mutateAsync({
        partyId,
        title: activeDetails.title,
        principal: activeDetails.principal,
        interestRate: activeDetails.interestRate,
        installmentCount: activeDetails.installmentCount,
        startDate: activeDetails.startDate,
        status: "active",
        schedules: activeDetails.schedules,
      });

      await utils.ledger.invalidate();
      toast.success("บันทึกสัญญาและตารางงวดลงระบบเรียบร้อยแล้ว!");
      if (onContractCreated && createdContract?.contract) {
        onContractCreated(partyId, createdContract.contract.contractId);
      }
    } catch (err: any) {
      toast.error(`บันทึกสัญญาไม่สำเร็จ: ${err.message}`);
    } finally {
      setSaveLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* 1. Page Header with Role Switcher */}
      <PageHeader
        kicker="FINANCIAL ENGINE"
        title="คำนวณ & สร้างสัญญาอัตโนมัติ"
        description="คำนวณดอกเบี้ยและยอดชำระอัตโนมัติ พร้อมหักค่างวดแรก/ค่าสัญญา เพื่อทราบยอดเงินที่ได้รับจริงสุทธิ"
        action={
          <div className="flex items-center p-0.5 bg-[#FFFCF8] rounded-full border border-[#1C1917]/10">
            <button
              type="button"
              onClick={() => {
                setMyRole("debtor");
                setSelectedPartyId("");
              }}
              className={`px-4 py-1.5 text-xs font-medium rounded-full transition-colors cursor-pointer ${
                myRole === "debtor"
                  ? "bg-[#1C1917] text-white font-semibold shadow-xs"
                  : "text-[#78716C] hover:text-[#1C1917]"
              }`}
            >
              ฉันเป็นลูกหนี้ (กู้ยืม)
            </button>
            <button
              type="button"
              onClick={() => {
                setMyRole("creditor");
                setSelectedPartyId("");
              }}
              className={`px-4 py-1.5 text-xs font-medium rounded-full transition-colors cursor-pointer ${
                myRole === "creditor"
                  ? "bg-[#1C1917] text-white font-semibold shadow-xs"
                  : "text-[#78716C] hover:text-[#1C1917]"
              }`}
            >
              ฉันเป็นเจ้าหนี้ (ให้ยืม)
            </button>
          </div>
        }
      />

      {/* 2. Loan Type Selector Tabs */}
      <div className="flex items-center gap-1.5 p-1 bg-[#FFFCF8] rounded-full border border-[#1C1917]/10 overflow-x-auto scrollbar-thin">
        {[
          { id: "daily_informal" as LoanType, label: "เงินกู้รายวันนอกระบบ (จ่ายรายวัน)" },
          { id: "floating_interest" as LoanType, label: "เงินกู้ดอกลอย (ส่งเฉพาะดอก)" },
          { id: "flat_installment" as LoanType, label: "ผ่อนสินค้าดอกคงที่" },
          { id: "effective_amortization" as LoanType, label: "ลดต้นลดดอก" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setLoanType(tab.id)}
            className={`px-4 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors cursor-pointer ${
              loanType === tab.id
                ? "bg-[#1C1917] text-white font-semibold shadow-sm"
                : "text-[#78716C] hover:text-[#1C1917]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 3. Main Calculator Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Form: Parameters */}
        <div className="lg:col-span-6 bg-[#FFFCF8] rounded-[20px] border border-[#1C1917]/10 p-6 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-[#1C1917]/10">
            <h3 className="text-sm font-semibold text-[#1C1917]">
              ตั้งค่าพารามิเตอร์การคำนวณ ({myRole === "debtor" ? "ฉันเป็นลูกหนี้" : "ฉันเป็นเจ้าหนี้"})
            </h3>
            <span className="text-xs text-[#78716C] font-mono">
              {loanType === "daily_informal" && "DAILY INFORMAL"}
              {loanType === "floating_interest" && "FLOATING"}
              {loanType === "flat_installment" && "FLAT RATE"}
              {loanType === "effective_amortization" && "AMORTIZATION"}
            </span>
          </div>

          {/* Form 1: Daily Informal Loan */}
          {loanType === "daily_informal" && (
            <div className="space-y-4">
              {/* Dual input mode toggle */}
              <div className="p-1 bg-[#F6F4F0] rounded-xl border border-[#1C1917]/10 grid grid-cols-2 gap-1 text-center">
                <button
                  type="button"
                  onClick={() => setDailyInputMode("by_payment")}
                  className={`py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                    dailyInputMode === "by_payment"
                      ? "bg-white text-[#1C1917] font-semibold shadow-xs"
                      : "text-[#78716C] hover:text-[#1C1917]"
                  }`}
                >
                  ⚡ จ่ายวันละเท่าไหร่ (คำนวณดอกอัตโนมัติ)
                </button>
                <button
                  type="button"
                  onClick={() => setDailyInputMode("by_rate")}
                  className={`py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                    dailyInputMode === "by_rate"
                      ? "bg-white text-[#1C1917] font-semibold shadow-xs"
                      : "text-[#78716C] hover:text-[#1C1917]"
                  }`}
                >
                  📊 กำหนดดอกเบี้ยเป็น %
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1C1917] mb-1">
                    ยอดเงินกู้ตามสัญญา (บาท) *
                  </label>
                  <input
                    type="number"
                    min="100"
                    step="100"
                    placeholder="เช่น 4000"
                    value={dailyPrincipal}
                    onChange={(e) => setDailyPrincipal(Number(e.target.value))}
                    className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm font-mono tabular-nums text-[#1C1917]"
                  />
                </div>

                {dailyInputMode === "by_payment" ? (
                  <div>
                    <label className="block text-xs font-medium text-[#1C1917] mb-1">
                      ต้องจ่ายวันละ (บาท/วัน) *
                    </label>
                    <input
                      type="number"
                      min="1"
                      placeholder="เช่น 200"
                      value={dailyInstallmentInput}
                      onChange={(e) => setDailyInstallmentInput(Number(e.target.value))}
                      className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm font-mono tabular-nums font-semibold text-[#1C1917]"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-[#1C1917] mb-1">
                      อัตราดอกเบี้ยต่อรอบ (%)
                    </label>
                    <input
                      type="number"
                      step="any"
                      placeholder="เช่น 25"
                      value={dailyRate}
                      onChange={(e) => setDailyRate(Number(e.target.value))}
                      className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm font-mono tabular-nums text-[#1C1917]"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1C1917] mb-1">
                    ระยะเวลา (วัน) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="เช่น 25"
                    value={dailyDays}
                    onChange={(e) => setDailyDays(Number(e.target.value))}
                    className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm font-mono tabular-nums text-[#1C1917]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1C1917] mb-1">
                    หักค่างวดแรก (บาท)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="เช่น 200"
                    value={dailyFirstDeduct}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setDailyFirstDeduct(val);
                      setDailyActualReceived(Math.max(0, dailyPrincipal - val - dailyFee));
                    }}
                    className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm font-mono tabular-nums text-[#1C1917]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1C1917] mb-1">
                    หักค่าทำสัญญา (บาท)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="เช่น 250"
                    value={dailyFee}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setDailyFee(val);
                      setDailyActualReceived(Math.max(0, dailyPrincipal - dailyFirstDeduct - val));
                    }}
                    className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm font-mono tabular-nums text-[#1C1917]"
                  />
                </div>
              </div>

              {/* Dedicated Actual Received Input Field */}
              <div className="p-3.5 bg-[#FAF8F5] rounded-xl border border-[#1C1917]/10 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[#1C1917] flex items-center gap-1.5">
                    <span>💵</span>
                    <span>{myRole === "debtor" ? "ระบุจำนวนเงินที่ได้รับจริงสุทธิ (บาท)" : "ระบุจำนวนเงินที่โอนให้ยืมจริง (บาท)"}</span>
                  </label>
                  <span className="text-[11px] text-[#78716C]">กรอกเพื่อปรับยอดอัตโนมัติ</span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    placeholder="เช่น 3550"
                    value={dailyActualReceived}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setDailyActualReceived(val);
                    }}
                    className="flex-1 h-10 px-3 bg-white border border-[#1C1917]/20 rounded-[10px] text-sm font-mono font-bold tabular-nums text-[#1C1917]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const autoCalc = Math.max(0, dailyPrincipal - dailyFirstDeduct - dailyFee);
                      setDailyActualReceived(autoCalc);
                    }}
                    className="px-3 h-10 rounded-[10px] bg-white border border-[#1C1917]/15 text-xs font-medium text-[#1C1917] hover:bg-[#1C1917]/5 cursor-pointer whitespace-nowrap"
                  >
                    ↺ รีเซ็ตตามค่าหัก (฿{(dailyPrincipal - dailyFirstDeduct - dailyFee).toLocaleString()})
                  </button>
                </div>
              </div>

              {/* Real-time Net Received Highlight Card */}
              <div className="p-4 bg-[#EBF3ED] rounded-2xl border border-[#3F6B4B]/20 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-[#3F6B4B]">
                      {myRole === "debtor" ? "จำนวนเงินที่ได้รับจริง (เข้ากระเป๋าจริง)" : "จำนวนเงินที่ให้ยืมจริง (โอนจริง)"}
                    </div>
                    <div className="text-[11px] text-[#78716C]">
                      เงินต้น ฿{dailyPrincipal.toLocaleString()} - หักงวดแรก ฿{dailyFirstDeduct.toLocaleString()} - หักสัญญา ฿{dailyFee.toLocaleString()}
                    </div>
                  </div>
                  <div className="text-2xl font-bold font-mono text-[#3F6B4B]">
                    ฿{dailyResult.netDisbursed.toLocaleString()}
                  </div>
                </div>

                <div className="pt-2 border-t border-[#3F6B4B]/15 grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <div className="text-[10px] text-[#78716C]">ดอกเบี้ยคำนวณอัตโนมัติ</div>
                    <div className="font-bold font-mono text-[#1C1917]">
                      ฿{dailyResult.interest.toLocaleString()} ({dailyResult.ratePercent.toFixed(1)}%)
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#78716C]">ยอดชำระคืนรวม</div>
                    <div className="font-bold font-mono text-[#1C1917]">
                      ฿{dailyResult.totalRepayment.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#78716C]">ดอกเบี้ยต่อวัน</div>
                    <div className="font-bold font-mono text-[#1C1917]">
                      {dailyResult.dailyRate.toFixed(2)}% / วัน
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1C1917] mb-1">
                    วันเริ่มสัญญา
                  </label>
                  <input
                    type="date"
                    value={dailyStartDate}
                    onChange={(e) => setDailyStartDate(e.target.value)}
                    className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm text-[#1C1917]"
                  />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-xs text-[#1C1917] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dailySkipSunday}
                      onChange={(e) => setDailySkipSunday(e.target.checked)}
                      className="rounded border-[#1C1917]/20 text-[#1C1917]"
                    />
                    <span>เว้นวันอาทิตย์</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Form 2: Floating Interest Loan */}
          {loanType === "floating_interest" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1C1917] mb-1">
                    ยอดเงินต้น (บาท)
                  </label>
                  <input
                    type="number"
                    min="100"
                    value={floatingPrincipal}
                    onChange={(e) => setFloatingPrincipal(Number(e.target.value))}
                    className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm font-mono tabular-nums text-[#1C1917]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1C1917] mb-1">
                    อัตราดอกเบี้ยต่องวด (%)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={floatingRate}
                    onChange={(e) => setFloatingRate(Number(e.target.value))}
                    className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm font-mono tabular-nums text-[#1C1917]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1C1917] mb-1">
                    รอบการส่งดอก
                  </label>
                  <select
                    value={floatingCycle}
                    onChange={(e: any) => setFloatingCycle(e.target.value)}
                    className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm text-[#1C1917]"
                  >
                    <option value="monthly">รายเดือน (ทุก 1 เดือน)</option>
                    <option value="biweekly">ราย 15 วัน</option>
                    <option value="weekly">รายสัปดาห์ (ทุก 7 วัน)</option>
                    <option value="daily">รายวัน</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1C1917] mb-1">
                    ประมาณการจำนวนงวดส่งดอก
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={floatingEstCycles}
                    onChange={(e) => setFloatingEstCycles(Number(e.target.value))}
                    className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm font-mono tabular-nums text-[#1C1917]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1C1917] mb-1">
                  วันเริ่มสัญญา
                </label>
                <input
                  type="date"
                  value={floatingStartDate}
                  onChange={(e) => setFloatingStartDate(e.target.value)}
                  className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm text-[#1C1917]"
                />
              </div>
            </div>
          )}

          {/* Form 3: Flat Rate Installment */}
          {loanType === "flat_installment" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1C1917] mb-1">
                    ราคาสินค้าเต็ม (บาท)
                  </label>
                  <input
                    type="number"
                    min="100"
                    value={flatItemPrice}
                    onChange={(e) => setFlatItemPrice(Number(e.target.value))}
                    className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm font-mono tabular-nums text-[#1C1917]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1C1917] mb-1">
                    เงินดาวน์ (บาท)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={flatDownPayment}
                    onChange={(e) => setFlatDownPayment(Number(e.target.value))}
                    className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm font-mono tabular-nums text-[#1C1917]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1C1917] mb-1">
                    ดอกเบี้ยคงที่ต่อปี (%)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={flatRatePerYear}
                    onChange={(e) => setFlatRatePerYear(Number(e.target.value))}
                    className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm font-mono tabular-nums text-[#1C1917]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1C1917] mb-1">
                    ระยะเวลาผ่อน (เดือน)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={flatMonths}
                    onChange={(e) => setFlatMonths(Number(e.target.value))}
                    className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm font-mono tabular-nums text-[#1C1917]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1C1917] mb-1">
                  วันเริ่มสัญญา
                </label>
                <input
                  type="date"
                  value={flatStartDate}
                  onChange={(e) => setFlatStartDate(e.target.value)}
                  className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm text-[#1C1917]"
                />
              </div>
            </div>
          )}

          {/* Form 4: Amortization */}
          {loanType === "effective_amortization" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1C1917] mb-1">
                    ยอดเงินต้น (บาท)
                  </label>
                  <input
                    type="number"
                    min="100"
                    value={amortPrincipal}
                    onChange={(e) => setAmortPrincipal(Number(e.target.value))}
                    className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm font-mono tabular-nums text-[#1C1917]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1C1917] mb-1">
                    อัตราดอกเบี้ยต่อปี (APR %)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={amortAnnualRate}
                    onChange={(e) => setAmortAnnualRate(Number(e.target.value))}
                    className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm font-mono tabular-nums text-[#1C1917]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1C1917] mb-1">
                    ระยะเวลาผ่อน (เดือน)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={amortMonths}
                    onChange={(e) => setAmortMonths(Number(e.target.value))}
                    className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm font-mono tabular-nums text-[#1C1917]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1C1917] mb-1">
                    วันเริ่มสัญญา
                  </label>
                  <input
                    type="date"
                    value={amortStartDate}
                    onChange={(e) => setAmortStartDate(e.target.value)}
                    className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm text-[#1C1917]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Quick Create / Save to Ledger Section */}
          <div className="pt-4 border-t border-[#1C1917]/10 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-[#1C1917]">
                บันทึกสัญญาลงสมุดบัญชี ({myRole === "debtor" ? "ฉันเป็นลูกหนี้" : "ฉันเป็นเจ้าหนี้"})
              </div>
              <span className="text-[11px] font-mono text-[#78716C]">
                {myRole === "debtor" ? "บันทึกลงหน้า กู้ & บิล" : "บันทึกลงหน้า ให้ยืม"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPartyType("existing")}
                className={`h-9 rounded-[10px] text-xs font-medium border transition-all cursor-pointer ${
                  partyType === "existing"
                    ? "bg-[#1C1917] text-white border-[#1C1917]"
                    : "bg-white border-[#1C1917]/15 text-[#1C1917]"
                }`}
              >
                {myRole === "debtor" ? "เลือกเจ้าหนี้เดิม" : "เลือกลูกหนี้เดิม"}
              </button>
              <button
                type="button"
                onClick={() => setPartyType("new")}
                className={`h-9 rounded-[10px] text-xs font-medium border transition-all cursor-pointer ${
                  partyType === "new"
                    ? "bg-[#1C1917] text-white border-[#1C1917]"
                    : "bg-white border-[#1C1917]/15 text-[#1C1917]"
                }`}
              >
                {myRole === "debtor" ? "+ เพิ่มเจ้าหนี้ใหม่" : "+ เพิ่มลูกหนี้ใหม่"}
              </button>
            </div>

            {partyType === "existing" ? (
              <div>
                <label className="block text-xs font-medium text-[#1C1917] mb-1">
                  {myRole === "debtor" ? "เลือกเจ้าหนี้" : "เลือกลูกหนี้"}
                </label>
                <select
                  value={selectedPartyId}
                  onChange={(e) => setSelectedPartyId(e.target.value)}
                  className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm text-[#1C1917]"
                >
                  <option value="">-- {myRole === "debtor" ? "เลือกเจ้าหนี้" : "เลือกลูกหนี้"} --</option>
                  {parties.map((p) => (
                    <option key={p.partyId} value={p.partyId}>
                      {p.displayName} {p.phone ? `(${p.phone})` : ""}
                    </option>
                  ))}
                </select>
                {parties.length === 0 && (
                  <p className="text-[11px] text-[#78716C] mt-1">
                    ยังไม่มีรายชื่อ{myRole === "debtor" ? "เจ้าหนี้" : "ลูกหนี้"}ในระบบ กรุณาเลือก "+ เพิ่ม{myRole === "debtor" ? "เจ้าหนี้" : "ลูกหนี้"}ใหม่"
                  </p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1C1917] mb-1">
                    ชื่อ{myRole === "debtor" ? "เจ้าหนี้" : "ลูกหนี้"} *
                  </label>
                  <input
                    type="text"
                    placeholder={myRole === "debtor" ? "เช่น เจ้าหนี้นอกระบบ A / ร้านทอง B" : "เช่น วีระ กิตติคุณ"}
                    value={newPartyName}
                    onChange={(e) => setNewPartyName(e.target.value)}
                    className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm text-[#1C1917]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1C1917] mb-1">
                    เบอร์โทร
                  </label>
                  <input
                    type="tel"
                    placeholder="08X-XXX-XXXX"
                    value={newPartyPhone}
                    onChange={(e) => setNewPartyPhone(e.target.value)}
                    className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm text-[#1C1917]"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[#1C1917] mb-1">
                ชื่อสัญญา (ระบุเองได้)
              </label>
              <input
                type="text"
                placeholder={activeDetails.title}
                value={contractTitle}
                onChange={(e) => setContractTitle(e.target.value)}
                className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm text-[#1C1917]"
              />
            </div>

            <Button
              type="button"
              variant="primary"
              size="lg"
              fullWidth
              loading={saveLoading}
              onClick={handleSaveContract}
              icon={<CheckCircle2 className="w-4 h-4" />}
            >
              บันทึกสัญญาลงสมุดบัญชี ({myRole === "debtor" ? "หน้า กู้ & บิล" : "หน้า ให้ยืม"})
            </Button>
          </div>
        </div>

        {/* Right Preview: Summary & Schedules */}
        <div className="lg:col-span-6 space-y-6">
          {/* Summary Box */}
          <div className="bg-[#FFFCF8] rounded-[20px] border border-[#1C1917]/10 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#1C1917]/10">
              <span className="text-xs font-mono text-[#78716C] uppercase">
                สรุปการคำนวณ ({myRole === "debtor" ? "ฉันเป็นลูกหนี้" : "ฉันเป็นเจ้าหนี้"})
              </span>
              <StatusChip status="active" label="พร้อมออกสัญญา" />
            </div>

            {loanType === "daily_informal" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-[#78716C]">ค่างวดส่งรายวัน</div>
                    <Money amount={dailyResult.dailyInstallment} size="xl" />
                    <div className="text-[11px] text-[#78716C]">ระยะเวลา {dailyDays} วัน</div>
                  </div>
                  <div>
                    <div className="text-xs text-[#78716C]">
                      {myRole === "debtor" ? "ยอดเงินที่ได้รับจริง (สุทธิ)" : "ยอดเงินที่ให้ยืมจริง (สุทธิ)"}
                    </div>
                    <Money amount={dailyResult.netDisbursed} size="xl" sentiment="income" />
                    <div className="text-[11px] text-[#78716C]">
                      หักงวดแรก ฿{dailyFirstDeduct} + ค่าสัญญา ฿{dailyFee}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 p-3 bg-white rounded-xl border border-[#1C1917]/10 text-xs">
                  <div>
                    <div className="text-[#78716C] text-[11px]">ยอดเงินต้นสัญญา</div>
                    <div className="font-bold font-mono text-sm text-[#1C1917]">
                      ฿{dailyPrincipal.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-[#78716C] text-[11px]">ดอกเบี้ยคำนวณอัตโนมัติ</div>
                    <div className="font-bold font-mono text-sm text-[#3F6B4B]">
                      ฿{dailyResult.interest.toLocaleString()} ({dailyResult.ratePercent.toFixed(1)}%)
                    </div>
                  </div>
                  <div>
                    <div className="text-[#78716C] text-[11px]">ยอดชำระคืนรวม</div>
                    <div className="font-bold font-mono text-sm text-[#1C1917]">
                      ฿{dailyResult.totalRepayment.toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#1C1917]/10 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-[#78716C]">ต้นทุนเงินกู้รวม (ดอกเบี้ย + ค่าสัญญา + หักงวดแรก):</span>
                    <div className="font-medium text-[#1C1917]">
                      เทียบเท่า {dailyResult.netReceivedInterestRate.toFixed(2)}% ของยอดเงินที่ได้รับจริง
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-sm text-[#1C1917]">
                      ฿{(dailyResult.totalRepayment - dailyResult.netDisbursed).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {loanType === "floating_interest" && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-[#78716C]">ดอกเบี้ยต่องวด</div>
                  <Money amount={floatingResult.interestPerPeriod} size="xl" sentiment="income" />
                </div>
                <div>
                  <div className="text-xs text-[#78716C]">ยอดปิดสัญญา (เงินต้น)</div>
                  <Money amount={floatingPrincipal} size="xl" />
                </div>
                <div>
                  <div className="text-xs text-[#78716C]">ประมาณการดอกเบี้ยรวม</div>
                  <Money amount={floatingResult.projectedInterestTotal} size="base" sentiment="income" />
                </div>
                <div>
                  <div className="text-xs text-[#78716C]">ยอดรวมเมื่อปิดสัญญา</div>
                  <Money amount={floatingResult.totalRepayment} size="base" />
                </div>
              </div>
            )}

            {loanType === "flat_installment" && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-[#78716C]">ค่างวดต่อเดือน</div>
                  <Money amount={flatResult.perInstallment} size="xl" />
                </div>
                <div>
                  <div className="text-xs text-[#78716C]">ยอดจัดสินเชื่อ</div>
                  <Money amount={flatResult.principal} size="xl" />
                </div>
                <div>
                  <div className="text-xs text-[#78716C]">ดอกเบี้ยรวมทั้งสัญญา</div>
                  <Money amount={flatResult.interest} size="base" sentiment="income" />
                </div>
                <div>
                  <div className="text-xs text-[#78716C]">ยอดผ่อนชำระรวม</div>
                  <Money amount={flatResult.totalRepayment} size="base" />
                </div>
              </div>
            )}

            {loanType === "effective_amortization" && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-[#78716C]">ค่างวดต่อเดือน</div>
                  <Money amount={amortResult.monthlyPayment} size="xl" />
                </div>
                <div>
                  <div className="text-xs text-[#78716C]">ดอกเบี้ยรวม (ลดต้นลดดอก)</div>
                  <Money amount={amortResult.totalInterest} size="xl" sentiment="income" />
                </div>
                <div>
                  <div className="text-xs text-[#78716C]">ยอดชำระคืนรวม</div>
                  <Money amount={amortResult.totalPayment} size="base" />
                </div>
                <div>
                  <div className="text-xs text-[#78716C]">จำนวนงวดชำระ</div>
                  <span className="text-base font-bold font-mono text-[#1C1917]">
                    {amortMonths} งวด
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Schedule Table Preview */}
          <div className="bg-[#FFFCF8] rounded-[20px] border border-[#1C1917]/10 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-[#1C1917]">
                ตัวอย่างตารางงวดชำระ ({activeDetails.schedules.length} งวด)
              </h4>
              <span className="text-[11px] text-[#78716C]">เรียงตามวันครบกำหนด</span>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {activeDetails.schedules.map((s: any) => (
                <div
                  key={s.installmentNo}
                  className="p-3 bg-white rounded-[12px] border border-[#1C1917]/10 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#1C1917]/5 flex items-center justify-center font-mono font-bold text-[11px] text-[#1C1917]">
                      {s.installmentNo}
                    </span>
                    <div>
                      <div className="font-mono text-[#1C1917]">{s.dueDate}</div>
                      <div className="text-[10px] text-[#78716C]">{s.note}</div>
                    </div>
                  </div>

                  <Money amount={s.amount} size="sm" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
