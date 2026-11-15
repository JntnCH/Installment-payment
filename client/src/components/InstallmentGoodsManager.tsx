import React, { useState, useMemo } from "react";
import {
  ShoppingBag,
  Plus,
  Calendar,
  CreditCard,
  Percent,
  CheckCircle2,
  Clock,
  Trash2,
  Edit2,
  Tag,
  Sparkles,
  ArrowRight,
  TrendingDown,
  Layers,
  Store,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  PageHeader,
  StatCard,
  Money,
  Button,
  StatusChip,
  PaySheet,
  EmptyState,
} from "./design-system";
import { calculateFlatInstallment, GeneratedScheduleItem } from "@/lib/calculator";

export default function InstallmentGoodsManager() {
  const [selectedPartyId, setSelectedPartyId] = useState<string>("");
  const [selectedContractId, setSelectedContractId] = useState<string>("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [activePaySchedule, setActivePaySchedule] = useState<{
    scheduleId: string;
    amount: number;
    installmentNo: number;
    contractTitle: string;
  } | null>(null);

  // Form State for new goods installment
  const [form, setForm] = useState({
    calcMode: "by_installment" as "by_installment" | "by_price_rate", // รู้ค่างวด หรือ รู้ราคา+ดอกเบี้ย
    partyType: "new" as "new" | "existing",
    existingPartyId: "",
    newStoreName: "",
    newStorePhone: "",
    productName: "",
    productCategory: "electronics",
    itemPrice: "", // ราคาสินค้าเต็ม (ถ้าผู้ใช้ไม่รู้ สามารถเว้นว่างไว้ได้)
    downPayment: "8500", // เงินดาวน์
    otherFees: "0", // ค่าใช้จ่ายอื่นๆ (ค่าประกัน, ค่าธรรมเนียม ฯลฯ)
    interestRatePercent: "0", // ดอกเบี้ยทั้งสัญญา (%)
    installmentAmount: "", // ค่างวดต่อรอบ (เช่น 1,500 บาท/งวด)
    installmentCount: "12", // จำนวนงวด
    frequency: "monthly" as "monthly" | "biweekly" | "weekly", // 1 เดือน, 15 วัน, 7 วัน
    startDate: new Date().toISOString().slice(0, 10),
    note: "",
  });

  const utils = trpc.useUtils();
  // List only creditor parties (ร้านค้า / บัตรเครดิต / แพลตฟอร์ม)
  const partiesQuery = trpc.ledger.listParties.useQuery("creditor");
  const partyDetailQuery = trpc.ledger.getParty.useQuery(
    { id: selectedPartyId },
    { enabled: Boolean(selectedPartyId) }
  );
  const contractQuery = trpc.ledger.getContract.useQuery(
    { id: selectedContractId },
    { enabled: Boolean(selectedContractId) }
  );

  const createPartyMutation = trpc.ledger.createParty.useMutation();
  const createContractMutation = trpc.ledger.createContract.useMutation();
  const deleteContractMutation = trpc.ledger.deleteContract.useMutation();
  const markPaidMutation = trpc.ledger.markSchedulePaid.useMutation();

  const parties = partiesQuery.data || [];
  const selectedContractData = contractQuery.data;
  const contract = selectedContractData?.contract;
  const contractSchedules = (selectedContractData?.transactions || []).filter((t) => t.type === "scheduled");

  // Real-time calculation for Form
  const calcPreview = useMemo(() => {
    const price = parseFloat(form.itemPrice) || 0;
    const down = parseFloat(form.downPayment) || 0;
    const fees = parseFloat(form.otherFees) || 0;
    const rate = parseFloat(form.interestRatePercent) || 0;
    const count = Math.max(1, parseInt(form.installmentCount, 10) || 1);
    const instAmount = parseFloat(form.installmentAmount) || 0;

    return calculateFlatInstallment({
      price,
      downPayment: down,
      otherFees: fees,
      ratePercent: rate,
      installmentCount: count,
      installmentAmount: instAmount,
      frequency: form.frequency,
      startDate: form.startDate,
      calcMode: form.calcMode,
    });
  }, [
    form.itemPrice,
    form.downPayment,
    form.otherFees,
    form.interestRatePercent,
    form.installmentCount,
    form.installmentAmount,
    form.frequency,
    form.startDate,
    form.calcMode,
  ]);

  // Handle Create Product Installment Contract
  const handleCreateInstallment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.productName.trim()) {
      toast.error("กรุณาระบุชื่อสินค้าหรืออุปกรณ์ที่ผ่อน");
      return;
    }
    if (calcPreview.totalRepayment <= 0 && calcPreview.principal <= 0 && calcPreview.price <= 0) {
      toast.error("กรุณาระบุค่างวด หรือราคาสินค้าที่ถูกต้อง");
      return;
    }

    let partyId = form.existingPartyId;
    if (form.partyType === "new") {
      const storeName = form.newStoreName.trim() || `ร้านค้า (${form.productName.trim()})`;
      try {
        const createdParty = await createPartyMutation.mutateAsync({
          displayName: storeName,
          role: "creditor",
          phone: form.newStorePhone.trim(),
          note: `ผ่อนสินค้า: ${form.productName.trim()} (${calcPreview.cycleLabel})`,
        });
        if (createdParty?.partyId) {
          partyId = createdParty.partyId;
        }
      } catch (err: any) {
        toast.error(`สร้างร้านค้าไม่สำเร็จ: ${err.message}`);
        return;
      }
    }

    if (!partyId) {
      toast.error("กรุณาเลือกร้านค้าหรือแพลตฟอร์มที่ผ่อน");
      return;
    }

    try {
      const contractTitle = `ผ่อน ${form.productName.trim()} (${calcPreview.schedules.length} งวด · ${calcPreview.cycleLabel})`;
      const res = await createContractMutation.mutateAsync({
        partyId,
        title: contractTitle,
        principal: calcPreview.principal || calcPreview.totalRepayment,
        interestRate: calcPreview.ratePercent,
        installmentCount: calcPreview.schedules.length,
        startDate: form.startDate,
        status: "active",
        schedules: calcPreview.schedules.map((s: GeneratedScheduleItem) => ({
          installmentNo: s.installmentNo,
          dueDate: s.dueDate,
          amount: Math.ceil(s.amount),
          note: `งวดผ่อน ${form.productName.trim()} (${s.installmentNo}/${calcPreview.schedules.length})`,
        })),
      });

      await utils.ledger.invalidate();
      toast.success(`เพิ่มรายการผ่อน ${form.productName} เรียบร้อยแล้ว!`);
      setCreateModalOpen(false);
      setSelectedPartyId(partyId);
      if (res?.contract?.contractId) {
        setSelectedContractId(res.contract.contractId);
      }
    } catch (err: any) {
      toast.error(`บันทึกไม่สำเร็จ: ${err.message}`);
    }
  };

  // Pay Schedule for Goods Installment (ลูกหนี้จ่ายค่างวดสินค้า -> จ่ายออก)
  const handleConfirmPay = async (data: { amount: number; date: string; note: string }) => {
    if (!activePaySchedule) return;
    try {
      await markPaidMutation.mutateAsync({
        scheduleId: activePaySchedule.scheduleId,
        paidAmount: data.amount,
        paidAt: new Date(data.date),
        source: "ledger_debtor_payment",
        note: data.note || `จ่ายค่างวดผ่อนสินค้า ${activePaySchedule.contractTitle} งวดที่ ${activePaySchedule.installmentNo} (จ่ายออก)`,
      });
      await utils.ledger.invalidate();
      toast.success("บันทึกการจ่ายค่างวดสินค้า (จ่ายออก) เรียบร้อยแล้ว");
      setActivePaySchedule(null);
    } catch (err: any) {
      toast.error(`เกิดข้อผิดพลาด: ${err.message}`);
    }
  };

  // Contract Financial Stats
  const contractStats = useMemo(() => {
    if (!contract) return null;
    const principal = Number(contract.principal || 0);
    const totalRepayable = contractSchedules.reduce((sum, s) => sum + Number(s.amount || 0), 0) || principal;
    const totalPaid = contractSchedules.filter((s) => Boolean(s.paidAt)).reduce((sum, s) => sum + Number(s.amount || 0), 0);
    const remainingBalance = Math.max(0, totalRepayable - totalPaid);
    const paidCount = contractSchedules.filter((s) => Boolean(s.paidAt)).length;
    const totalCount = contractSchedules.length || contract.installmentCount || 1;
    const progressPercent = totalRepayable > 0 ? Math.min(100, Math.round((totalPaid / totalRepayable) * 100)) : 0;

    return {
      principal,
      totalRepayable,
      totalPaid,
      remainingBalance,
      paidCount,
      totalCount,
      progressPercent,
    };
  }, [contract, contractSchedules]);

  return (
    <div className="space-y-8">
      {/* 1. Header */}
      <PageHeader
        kicker="INSTALLMENT GOODS & PRODUCTS"
        title="ผ่อนสินค้า & อุปกรณ์"
        description="ติดตามรายการผ่อนสินค้า เครื่องใช้ไฟฟ้า มือถือ และของใช้ต่างๆ คำนวณค่างวดคงที่และบันทึกจ่ายออกอัตโนมัติ"
        action={
          <Button
            variant="primary"
            size="md"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => setCreateModalOpen(true)}
          >
            + เพิ่มรายการผ่อนสินค้า
          </Button>
        }
      />

      {/* 2. Top Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="สถานะของฉันในหน้านี้"
          rawDisplay={
            <span className="text-xl font-bold font-mono text-rose-600">
              ฉันเป็นผู้ผ่อน (ลูกหนี้)
            </span>
          }
          subtitle="ชำระค่างวดสินค้า = บันทึกจ่ายออก (Outflow)"
          icon={<ShoppingBag className="w-4 h-4 text-rose-500" />}
          accentBar="expense"
        />
        <StatCard
          label="ร้านค้า / แพลตฟอร์มผ่อน"
          rawDisplay={
            <span className="text-2xl font-bold font-mono text-[#1C1917]">
              {parties.length} แหล่ง
            </span>
          }
          subtitle="Shopee, SpayLater, บัตรเครดิต, ร้านค้า"
          icon={<Store className="w-4 h-4 text-[#78716C]" />}
        />
        <StatCard
          label="วิธีคำนวณค่างวดสินค้า"
          rawDisplay={
            <span className="text-xl font-bold font-mono text-[#3F6B4B]">
              Flat Rate / 0%
            </span>
          }
          subtitle="คำนวณเงินดาวน์ ดอกเบี้ย และแบ่งงวดเท่ากันทุกเดือน"
          icon={<Percent className="w-4 h-4 text-[#3F6B4B]" />}
          accentBar="income"
        />
      </div>

      {/* 3. Main Workspace: Store/Contract List & Active Contract View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Stores & Products */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-[#FFFCF8] rounded-[20px] border border-[#1C1917]/10 p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#1C1917]/10">
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4 text-[#1C1917]" />
                <h3 className="text-sm font-semibold text-[#1C1917]">ร้านค้า & สัญญาผ่อนสินค้า</h3>
              </div>
              <span className="text-xs font-mono text-[#78716C]">{parties.length} รายการ</span>
            </div>

            {parties.length === 0 ? (
              <div className="p-8 text-center bg-[#FAF8F5] rounded-xl border border-dashed border-[#1C1917]/15 space-y-3">
                <ShoppingBag className="w-8 h-8 text-[#78716C] mx-auto opacity-50" />
                <div className="text-xs text-[#78716C]">ยังไม่มีรายการผ่อนสินค้าในระบบ</div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setCreateModalOpen(true)}
                  icon={<Plus className="w-3.5 h-3.5" />}
                >
                  เพิ่มรายการผ่อนแรก
                </Button>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
                {parties.map((p) => {
                  const isSelected = selectedPartyId === p.partyId;
                  return (
                    <div
                      key={p.partyId}
                      onClick={() => {
                        setSelectedPartyId(p.partyId);
                        setSelectedContractId("");
                      }}
                      className={`p-3.5 rounded-[14px] border transition-all cursor-pointer ${
                        isSelected
                          ? "bg-[#1C1917] text-white border-[#1C1917] shadow-md scale-[1.01]"
                          : "bg-white border-[#1C1917]/10 text-[#1C1917] hover:border-[#1C1917]/30 hover:bg-[#FAF8F5]"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-sm truncate">{p.displayName}</div>
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-full font-mono font-medium ${
                            isSelected ? "bg-white/20 text-white" : "bg-[#1C1917]/5 text-[#78716C]"
                          }`}
                        >
                          ร้านค้า
                        </span>
                      </div>
                      {p.note && (
                        <div className={`text-xs mt-1 truncate ${isSelected ? "text-stone-300" : "text-[#78716C]"}`}>
                          {p.note}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Contract Detail & Schedules */}
        <div className="lg:col-span-7 space-y-6">
          {partyDetailQuery.data ? (
            <div className="space-y-6">
              {/* Store Contracts List */}
              <div className="bg-[#FFFCF8] rounded-[20px] border border-[#1C1917]/10 p-5 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#1C1917]/10">
                  <div>
                    <h3 className="text-sm font-semibold text-[#1C1917]">
                      รายการผ่อนของ "{partyDetailQuery.data.party?.displayName}"
                    </h3>
                    <div className="text-xs text-[#78716C]">
                      มีทั้งหมด {partyDetailQuery.data.contracts.length} สัญญา
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setForm((prev) => ({
                        ...prev,
                        partyType: "existing",
                        existingPartyId: selectedPartyId,
                      }));
                      setCreateModalOpen(true);
                    }}
                    icon={<Plus className="w-3.5 h-3.5" />}
                  >
                    + เพิ่มสินค้าในร้านนี้
                  </Button>
                </div>

                {partyDetailQuery.data.contracts.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[#78716C] bg-white rounded-xl border border-dashed border-[#1C1917]/15">
                    ยังไม่มีสัญญาผ่อนสินค้าในร้านค้านี้
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {partyDetailQuery.data.contracts.map((c) => {
                      const isContractActive = selectedContractId === c.contractId;
                      return (
                        <div
                          key={c.contractId}
                          onClick={() => setSelectedContractId(c.contractId)}
                          className={`p-4 rounded-[16px] border transition-all cursor-pointer ${
                            isContractActive
                              ? "bg-gradient-to-b from-[#2D2723] to-[#141210] text-white border-black/30 shadow-md"
                              : "bg-white border-[#1C1917]/10 text-[#1C1917] hover:border-[#1C1917]/30"
                          }`}
                        >
                          <div className="font-semibold text-sm truncate">{c.title}</div>
                          <div className="mt-2 flex items-baseline justify-between">
                            <span className="text-xs opacity-75">ยอดจัดสินเชื่อ</span>
                            <span className="font-mono font-bold text-base">
                              ฿{Number(c.principal).toLocaleString()}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center justify-between text-xs opacity-70">
                            <span>{c.installmentCount} งวด</span>
                            <span>เริ่ม {c.startDate}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Active Contract Details & Schedule Table */}
              {contract && contractStats && (
                <div className="bg-[#FFFCF8] rounded-[20px] border border-[#1C1917]/10 p-6 space-y-6">
                  <div className="flex items-start justify-between pb-4 border-b border-[#1C1917]/10">
                    <div>
                      <div className="flex items-center gap-2">
                        <ShoppingBag className="w-5 h-5 text-[#1C1917]" />
                        <h3 className="text-base font-bold text-[#1C1917]">{contract.title}</h3>
                      </div>
                      <div className="text-xs text-[#78716C] mt-1">
                        เริ่มวันที่ {contract.startDate} · ดอกเบี้ย {contract.interestRate}% · ผ่อน {contract.installmentCount} งวด
                      </div>
                    </div>

                    <Button
                      variant="danger"
                      size="sm"
                      icon={<Trash2 className="w-3.5 h-3.5" />}
                      onClick={async () => {
                        if (!confirm(`คุณต้องการลบสัญญาผ่อนสินค้านี้ใช่หรือไม่?`)) return;
                        try {
                          await deleteContractMutation.mutateAsync({ id: contract.contractId });
                          await utils.ledger.invalidate();
                          toast.success("ลบสัญญาผ่อนสินค้าเรียบร้อยแล้ว");
                          setSelectedContractId("");
                        } catch (err: any) {
                          toast.error(`ลบไม่สำเร็จ: ${err.message}`);
                        }
                      }}
                    >
                      ลบสัญญา
                    </Button>
                  </div>

                  {/* 5-Block Financial Breakdown for Product Installment */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 bg-white rounded-xl border border-[#1C1917]/10">
                      <div className="text-[11px] text-[#78716C]">1. ยอดจัดสินเชื่อ</div>
                      <div className="font-mono font-bold text-sm text-[#1C1917]">
                        ฿{contractStats.principal.toLocaleString()}
                      </div>
                    </div>
                    <div className="p-3 bg-white rounded-xl border border-[#1C1917]/10">
                      <div className="text-[11px] text-[#78716C]">2. ยอดรวมทั้งสัญญา</div>
                      <div className="font-mono font-bold text-sm text-[#1C1917]">
                        ฿{contractStats.totalRepayable.toLocaleString()}
                      </div>
                    </div>
                    <div className="p-3 bg-white rounded-xl border border-[#1C1917]/10">
                      <div className="text-[11px] text-[#78716C]">3. ชำระแล้ว ({contractStats.paidCount}/{contractStats.totalCount} งวด)</div>
                      <div className="font-mono font-bold text-sm text-emerald-600">
                        ฿{contractStats.totalPaid.toLocaleString()}
                      </div>
                    </div>
                    <div className="p-3 bg-rose-50 rounded-xl border border-rose-200">
                      <div className="text-[11px] text-rose-700 font-semibold">4. ยอดคงเหลือต้องจ่าย</div>
                      <div className="font-mono font-bold text-base text-rose-700">
                        ฿{contractStats.remainingBalance.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-[#78716C]">
                      <span>ความคืบหน้าการผ่อนชำระ</span>
                      <span className="font-mono font-semibold">{contractStats.progressPercent}%</span>
                    </div>
                    <div className="w-full h-2.5 bg-[#1C1917]/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-[#1C1917] transition-all duration-300"
                        style={{ width: `${contractStats.progressPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Schedule Items Table */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-[#1C1917]">
                        ตารางงวดผ่อนสินค้า ({contractSchedules.length} งวด)
                      </h4>
                      <span className="text-[11px] text-[#78716C]">กด "จ่ายค่างวด" เพื่อบันทึกจ่ายออก</span>
                    </div>

                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                      {contractSchedules.map((s, idx) => {
                        const isPaid = Boolean(s.paidAt);
                        const installmentIndex = idx + 1;
                        return (
                          <div
                            key={s.transactionId}
                            className={`p-3.5 rounded-[14px] border flex items-center justify-between gap-3 text-xs transition-all ${
                              isPaid
                                ? "bg-[#FAF8F5] border-emerald-200/60 opacity-80"
                                : "bg-white border-[#1C1917]/10 hover:border-[#1C1917]/25"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className={`w-7 h-7 rounded-full flex items-center justify-center font-mono font-bold text-xs ${
                                  isPaid ? "bg-emerald-100 text-emerald-700" : "bg-[#1C1917]/5 text-[#1C1917]"
                                }`}
                              >
                                {isPaid ? <CheckCircle2 className="w-4 h-4" /> : installmentIndex}
                              </span>
                              <div>
                                <div className="font-mono font-medium text-[#1C1917]">
                                  ครบกำหนด: {s.dueDate ? s.dueDate.slice(0, 10) : "-"}
                                </div>
                                <div className="text-[11px] text-[#78716C]">
                                  {isPaid ? `ชำระแล้วเมื่อ ${s.paidAt?.slice(0, 10)}` : s.note || `งวดที่ ${installmentIndex}`}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="text-right font-mono">
                                <div className="font-bold text-sm text-[#1C1917]">
                                  ฿{Number(s.amount).toLocaleString()}
                                </div>
                                {isPaid && (
                                  <span className="text-[10px] text-emerald-600 font-semibold">
                                    ✓ บันทึกจ่ายออกแล้ว
                                  </span>
                                )}
                              </div>

                              {!isPaid && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setActivePaySchedule({
                                      scheduleId: s.transactionId,
                                      amount: Number(s.amount),
                                      installmentNo: installmentIndex,
                                      contractTitle: contract.title,
                                    })
                                  }
                                  className="h-8 px-3.5 rounded-[10px] bg-rose-600 hover:bg-rose-700 text-white font-medium text-xs shadow-xs transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                                >
                                  <span>💸 จ่ายค่างวด</span>
                                </button>
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
          ) : (
            <div className="p-12 text-center bg-[#FFFCF8] rounded-[20px] border border-[#1C1917]/10 space-y-3">
              <ShoppingBag className="w-12 h-12 text-[#78716C] mx-auto opacity-40" />
              <div className="font-semibold text-[#1C1917]">เลือกร้านค้าหรือสินค้าด้านซ้ายเพื่อดูรายละเอียด</div>
              <p className="text-xs text-[#78716C] max-w-sm mx-auto">
                หรือกดปุ่ม "+ เพิ่มรายการผ่อนสินค้า" เพื่อคำนวณยอดผ่อน 0% หรือดอกเบี้ยคงที่ และสร้างสัญญาใหม่
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Create Installment Contract */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FFFCF8] rounded-[24px] border border-[#1C1917]/15 max-w-lg w-full p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#1C1917]/10">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-[#1C1917]" />
                <h3 className="font-bold text-base text-[#1C1917]">เพิ่มรายการผ่อนสินค้าใหม่</h3>
              </div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="w-8 h-8 rounded-full bg-[#1C1917]/5 flex items-center justify-center text-[#78716C] hover:text-[#1C1917] cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateInstallment} className="space-y-4">
              {/* Store Selection */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-[#1C1917]">
                  ร้านค้า / บัตร / แพลตฟอร์มผ่อน
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, partyType: "new" }))}
                    className={`py-2 px-3 rounded-[10px] text-xs font-medium border cursor-pointer ${
                      form.partyType === "new"
                        ? "bg-[#1C1917] text-white border-[#1C1917]"
                        : "bg-white text-[#1C1917] border-[#1C1917]/15"
                    }`}
                  >
                    + เพิ่มร้านค้าใหม่
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, partyType: "existing" }))}
                    className={`py-2 px-3 rounded-[10px] text-xs font-medium border cursor-pointer ${
                      form.partyType === "existing"
                        ? "bg-[#1C1917] text-white border-[#1C1917]"
                        : "bg-white text-[#1C1917] border-[#1C1917]/15"
                    }`}
                  >
                    เลือกร้านเดิมที่มี
                  </button>
                </div>

                {form.partyType === "new" ? (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <input
                      type="text"
                      placeholder="เช่น Shopee SPayLater / Studio 7 / Sbyphone"
                      value={form.newStoreName}
                      onChange={(e) => setForm((f) => ({ ...f, newStoreName: e.target.value }))}
                      className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-xs text-[#1C1917]"
                      required
                    />
                    <input
                      type="tel"
                      placeholder="เบอร์โทร / ช่องทางติดต่อ"
                      value={form.newStorePhone}
                      onChange={(e) => setForm((f) => ({ ...f, newStorePhone: e.target.value }))}
                      className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-xs text-[#1C1917]"
                    />
                  </div>
                ) : (
                  <select
                    value={form.existingPartyId}
                    onChange={(e) => setForm((f) => ({ ...f, existingPartyId: e.target.value }))}
                    className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-xs text-[#1C1917] mt-2"
                    required
                  >
                    <option value="">-- เลือกร้านค้า --</option>
                    {parties.map((p) => (
                      <option key={p.partyId} value={p.partyId}>
                        {p.displayName}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Product Info */}
              <div>
                <label className="block text-xs font-semibold text-[#1C1917] mb-1">
                  ชื่อสินค้า / อุปกรณ์ที่ผ่อน *
                </label>
                <input
                  type="text"
                  placeholder="เช่น IP 17 / iPhone 16 Pro 256GB"
                  value={form.productName}
                  onChange={(e) => setForm((f) => ({ ...f, productName: e.target.value }))}
                  className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-xs text-[#1C1917]"
                  required
                />
              </div>

              {/* Cycle Type Selection: 7 วัน, 15 วัน, 1 เดือน */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#1C1917]">
                  ประเภทของงวด (รอบการส่ง) *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, frequency: "weekly" }))}
                    className={`py-2 px-2 rounded-[10px] text-xs font-medium border text-center transition-colors cursor-pointer ${
                      form.frequency === "weekly"
                        ? "bg-[#1C1917] text-white border-[#1C1917]"
                        : "bg-white text-[#1C1917] border-[#1C1917]/15 hover:bg-[#FAF8F5]"
                    }`}
                  >
                    ⚡ ทุก 7 วัน
                    <span className="block text-[10px] opacity-75">รายสัปดาห์</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, frequency: "biweekly" }))}
                    className={`py-2 px-2 rounded-[10px] text-xs font-medium border text-center transition-colors cursor-pointer ${
                      form.frequency === "biweekly"
                        ? "bg-[#1C1917] text-white border-[#1C1917]"
                        : "bg-white text-[#1C1917] border-[#1C1917]/15 hover:bg-[#FAF8F5]"
                    }`}
                  >
                    📅 ทุก 15 วัน
                    <span className="block text-[10px] opacity-75">รายปักษ์ / ครึ่งเดือน</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, frequency: "monthly" }))}
                    className={`py-2 px-2 rounded-[10px] text-xs font-medium border text-center transition-colors cursor-pointer ${
                      form.frequency === "monthly"
                        ? "bg-[#1C1917] text-white border-[#1C1917]"
                        : "bg-white text-[#1C1917] border-[#1C1917]/15 hover:bg-[#FAF8F5]"
                    }`}
                  >
                    🗓️ 1 เดือน
                    <span className="block text-[10px] opacity-75">รายเดือน</span>
                  </button>
                </div>
              </div>

              {/* Calculation Mode Selector */}
              <div className="p-3 bg-[#1C1917]/5 rounded-[12px] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-[#1C1917]">วิธีคำนวณยอดผ่อน:</span>
                  <div className="flex gap-1 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, calcMode: "by_installment" }))}
                      className={`px-2.5 py-1 rounded-[6px] font-medium transition-colors cursor-pointer ${
                        form.calcMode === "by_installment"
                          ? "bg-[#1C1917] text-white"
                          : "bg-white/80 text-[#78716C] hover:text-[#1C1917]"
                      }`}
                    >
                      รู้ค่างวดต่อรอบ
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, calcMode: "by_price_rate" }))}
                      className={`px-2.5 py-1 rounded-[6px] font-medium transition-colors cursor-pointer ${
                        form.calcMode === "by_price_rate"
                          ? "bg-[#1C1917] text-white"
                          : "bg-white/80 text-[#78716C] hover:text-[#1C1917]"
                      }`}
                    >
                      รู้ราคาเต็ม & ดอกเบี้ย
                    </button>
                  </div>
                </div>
                <p className="text-[10px] text-[#78716C]">
                  {form.calcMode === "by_installment"
                    ? "✨ หากไม่รู้ราคาสินค้าเต็มหรือดอกเบี้ย กรอกค่างวดต่อรอบได้เลย ระบบจะรวมยอดราคาสินค้าและคำนวณให้ทันที"
                    : "✨ กรอกราคาสินค้าเต็มและดอกเบี้ย ระบบจะคำนวณค่างวดที่ต้องส่งต่อรอบให้อัตโนมัติ"}
                </p>
              </div>

              {/* Installment Amount & Months */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#1C1917] mb-1">
                    ค่างวด (บาท / {form.frequency === "weekly" ? "7 วัน" : form.frequency === "biweekly" ? "15 วัน" : "เดือน"}) {form.calcMode === "by_installment" ? "*" : ""}
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder={form.calcMode === "by_installment" ? "เช่น 1500 หรือ 2000" : `คำนวณอัตโนมัติ: ฿${Math.ceil(calcPreview.perInstallment)}`}
                    value={form.installmentAmount}
                    onChange={(e) => setForm((f) => ({ ...f, installmentAmount: e.target.value }))}
                    className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-xs font-mono tabular-nums text-[#1C1917]"
                    required={form.calcMode === "by_installment" && !form.itemPrice}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#1C1917] mb-1">
                    จำนวนงวด *
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="เช่น 12"
                    value={form.installmentCount}
                    onChange={(e) => setForm((f) => ({ ...f, installmentCount: e.target.value }))}
                    className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-xs font-mono tabular-nums text-[#1C1917]"
                    required
                  />
                </div>
              </div>

              {/* Price & Down Payment */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-[#1C1917]">
                      ราคาสินค้าเต็ม (บาท)
                    </label>
                    <span className="text-[10px] text-[#78716C]">
                      {form.itemPrice ? "ระบุเอง" : "คำนวณอัตโนมัติ"}
                    </span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    placeholder={form.calcMode === "by_installment" ? `อัตโนมัติ: ฿${Math.ceil(calcPreview.price)}` : "เช่น 24900"}
                    value={form.itemPrice}
                    onChange={(e) => setForm((f) => ({ ...f, itemPrice: e.target.value }))}
                    className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-xs font-mono tabular-nums text-[#1C1917]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#1C1917] mb-1">
                    เงินดาวน์ (บาท)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="เช่น 8500"
                    value={form.downPayment}
                    onChange={(e) => setForm((f) => ({ ...f, downPayment: e.target.value }))}
                    className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-xs font-mono tabular-nums text-[#1C1917]"
                  />
                </div>
              </div>

              {/* Other Fees & Interest Rate */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#1C1917] mb-1">
                    ค่าใช้จ่ายอื่นๆ (บาท)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="ประกัน, ค่าเปิดสัญญา, ค่าธรรมเนียม (0)"
                    value={form.otherFees}
                    onChange={(e) => setForm((f) => ({ ...f, otherFees: e.target.value }))}
                    className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-xs font-mono tabular-nums text-[#1C1917]"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-[#1C1917]">
                      ดอกเบี้ยทั้งสัญญา (%)
                    </label>
                    <span className="text-[10px] text-[#78716C]">
                      {calcPreview.ratePercent > 0 ? `${calcPreview.ratePercent.toFixed(1)}%` : "0% (หรือเว้นว่าง)"}
                    </span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0% หรือระบุดอกเบี้ย"
                    value={form.interestRatePercent}
                    onChange={(e) => setForm((f) => ({ ...f, interestRatePercent: e.target.value }))}
                    className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-xs font-mono tabular-nums text-[#1C1917]"
                  />
                </div>
              </div>

              {/* Start Date */}
              <div>
                <label className="block text-xs font-semibold text-[#1C1917] mb-1">
                  วันเริ่มงวดแรก
                </label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                  className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-xs text-[#1C1917]"
                />
              </div>

              {/* Real-time Smart Calculation Summary Box */}
              <div className="p-4 bg-[#FAF8F5] rounded-xl border border-[#1C1917]/10 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#78716C]">ราคาสินค้าคำนวณสุทธิ:</span>
                  <span className="font-mono font-bold text-[#1C1917]">
                    ฿{Math.ceil(calcPreview.price).toLocaleString()}
                  </span>
                </div>
                {calcPreview.downPayment > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#78716C]">เงินดาวน์:</span>
                    <span className="font-mono text-[#1C1917]">
                      -฿{calcPreview.downPayment.toLocaleString()}
                    </span>
                  </div>
                )}
                {calcPreview.otherFees > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#78716C]">ค่าใช้จ่ายอื่นๆ:</span>
                    <span className="font-mono text-[#1C1917]">
                      +฿{calcPreview.otherFees.toLocaleString()}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#78716C]">ยอดจัดสินเชื่อคงเหลือ:</span>
                  <span className="font-mono font-bold text-[#1C1917]">
                    ฿{Math.ceil(calcPreview.principal).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#78716C]">ดอกเบี้ยรวมทั้งสัญญา:</span>
                  <span className="font-mono font-bold text-[#3F6B4B]">
                    ฿{Math.ceil(calcPreview.interest).toLocaleString()} ({calcPreview.ratePercent.toFixed(2)}%)
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#78716C]">ยอดรวมที่ต้องผ่อนทั้งสิ้น:</span>
                  <span className="font-mono font-bold text-[#1C1917]">
                    ฿{Math.ceil(calcPreview.totalRepayment).toLocaleString()}
                  </span>
                </div>

                <div className="pt-2 border-t border-[#1C1917]/10 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-[#1C1917]">ค่างวดที่ต้องจ่าย</div>
                    <div className="text-[10px] text-[#78716C]">
                      ผ่อน {calcPreview.schedules.length} งวด ({calcPreview.cycleLabel})
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold font-mono text-rose-600">
                      ฿{Math.ceil(calcPreview.perInstallment).toLocaleString()}
                    </div>
                    <div className="text-[10px] font-medium text-[#78716C]">
                      / {calcPreview.frequency === "weekly" ? "7 วัน" : calcPreview.frequency === "biweekly" ? "15 วัน" : "เดือน"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  className="flex-1"
                  onClick={() => setCreateModalOpen(false)}
                >
                  ยกเลิก
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  className="flex-1"
                  icon={<CheckCircle2 className="w-4 h-4" />}
                >
                  บันทึกสัญญาผ่อนสินค้า
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pay Sheet for Outflow recording */}
      {activePaySchedule && (
        <PaySheet
          open={true}
          onClose={() => setActivePaySchedule(null)}
          onConfirm={handleConfirmPay}
          title={`จ่ายค่างวด: ${activePaySchedule.contractTitle}`}
          subtitle={`งวดที่ ${activePaySchedule.installmentNo} (บันทึกรายจ่าย - จ่ายออก)`}
          defaultAmount={activePaySchedule.amount}
          type="pay"
        />
      )}
    </div>
  );
}
