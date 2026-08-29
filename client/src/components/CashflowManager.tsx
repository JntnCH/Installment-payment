import React, { useState, useMemo } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  Filter,
  Calendar,
  Tag,
  Receipt,
  FileSpreadsheet,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  PageHeader,
  StatCard,
  Money,
  Button,
  StatusChip,
  EmptyState,
} from "./design-system";

export default function CashflowManager() {
  const exportQuery = trpc.ledger.exportData.useQuery();
  const partiesQuery = trpc.ledger.listParties.useQuery();
  const createTxMutation = trpc.ledger.createTransaction.useMutation();
  const deleteTxMutation = trpc.ledger.deleteTransaction.useMutation();
  const utils = trpc.useUtils();

  const [filterType, setFilterType] = useState<"all" | "in" | "out">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [txForm, setTxForm] = useState({
    partyId: "",
    type: "payment" as "payment" | "disbursement" | "adjustment",
    amount: "",
    source: "manual",
    note: "",
    date: new Date().toISOString().slice(0, 10),
  });

  const transactions = exportQuery.data?.transactions || [];
  const parties = partiesQuery.data || [];

  // Categorize in/out
  const stats = useMemo(() => {
    let totalIn = 0;
    let totalOut = 0;

    for (const tx of transactions) {
      const amt = Number(tx.amount || 0);
      if (tx.type === "payment") {
        totalIn += amt;
      } else if (tx.type === "disbursement") {
        totalOut += amt;
      }
    }

    return {
      totalIn,
      totalOut,
      net: totalIn - totalOut,
    };
  }, [transactions]);

  // Group transactions by date
  const groupedTransactions = useMemo(() => {
    const filtered = transactions.filter((tx) => {
      if (filterType === "in") return tx.type === "payment";
      if (filterType === "out") return tx.type === "disbursement";
      return true;
    });

    const map = new Map<string, typeof transactions>();
    for (const tx of filtered) {
      const dateKey = tx.occurredAt
        ? tx.occurredAt.slice(0, 10)
        : "ไม่ระบุวันที่";
      const existing = map.get(dateKey) || [];
      existing.push(tx);
      map.set(dateKey, existing);
    }

    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [transactions, filterType]);

  const handleCreateTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txForm.partyId) {
      toast.error("กรุณาเลือกบัญชีคู่สัญญา");
      return;
    }
    const numAmount = parseFloat(txForm.amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error("กรุณาระบุจำนวนเงินที่ถูกต้อง");
      return;
    }

    try {
      await createTxMutation.mutateAsync({
        partyId: txForm.partyId,
        type: txForm.type,
        amount: numAmount,
        occurredAt: new Date(txForm.date),
        source: txForm.source || "manual",
        note: txForm.note,
      });
      await utils.ledger.invalidate();
      toast.success("บันทึกธุรกรรมเรียบร้อยแล้ว");
      setModalOpen(false);
      setTxForm({
        partyId: "",
        type: "payment",
        amount: "",
        source: "manual",
        note: "",
        date: new Date().toISOString().slice(0, 10),
      });
    } catch (err: any) {
      toast.error(`เกิดข้อผิดพลาด: ${err.message}`);
    }
  };

  const handleDeleteTx = async (id: string) => {
    if (!confirm("ยืนยันการลบรายการธุรกรรมนี้?")) return;
    try {
      await deleteTxMutation.mutateAsync({ id });
      await utils.ledger.invalidate();
      toast.success("ลบรายการเรียบร้อยแล้ว");
    } catch (err: any) {
      toast.error(`เกิดข้อผิดพลาด: ${err.message}`);
    }
  };

  return (
    <div className="space-y-8">
      {/* 1. Page Header */}
      <PageHeader
        kicker="CASHFLOW & TRANSACTIONS"
        title="บันทึกรายรับ-รายจ่าย"
        description="ประวัติกระแสเงินสด การรับชำระ และการเบิกจ่ายจากสัญญาทั้งหมด"
        action={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => setModalOpen(true)}
          >
            บันทึกรายการใหม่
          </Button>
        }
      />

      {/* 2. 3 StatCards in a row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="กระแสเงินเข้ารวม (Income / Repayments)"
          amount={stats.totalIn}
          sentiment="income"
          subtitle="ยอดรับชำระค่างวดและเงินคืนทั้งหมด"
          accentBar="income"
        />
        <StatCard
          label="กระแสเงินออกรวม (Disbursements)"
          amount={stats.totalOut}
          sentiment="expense"
          subtitle="ยอดปล่อยกู้และเบิกจ่ายเงินทุน"
          accentBar="expense"
        />
        <StatCard
          label="กระแสเงินสดสุทธิ (Net Balance)"
          amount={stats.net}
          sentiment={stats.net >= 0 ? "income" : "expense"}
          subtitle="ผลต่างกระแสเงินเข้า-ออกสะสม"
        />
      </div>

      {/* 3. Filter Chips */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 p-1 bg-[#FFFCF8] rounded-full border border-[#1C1917]/10">
          <button
            type="button"
            onClick={() => setFilterType("all")}
            className={`px-3.5 py-1 text-xs font-medium rounded-full transition-colors cursor-pointer ${
              filterType === "all"
                ? "bg-[#1C1917] text-white font-semibold"
                : "text-[#78716C] hover:text-[#1C1917]"
            }`}
          >
            ทั้งหมด ({transactions.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType("in")}
            className={`px-3.5 py-1 text-xs font-medium rounded-full transition-colors cursor-pointer ${
              filterType === "in"
                ? "bg-[#1C1917] text-white font-semibold"
                : "text-[#78716C] hover:text-[#1C1917]"
            }`}
          >
            เงินเข้า (รับชำระ)
          </button>
          <button
            type="button"
            onClick={() => setFilterType("out")}
            className={`px-3.5 py-1 text-xs font-medium rounded-full transition-colors cursor-pointer ${
              filterType === "out"
                ? "bg-[#1C1917] text-white font-semibold"
                : "text-[#78716C] hover:text-[#1C1917]"
            }`}
          >
            เงินออก (ปล่อยกู้/จ่าย)
          </button>
        </div>

        <span className="text-xs text-[#78716C] font-mono">
          เรียงตามลำดับวันที่ล่าสุด
        </span>
      </div>

      {/* 4. Grouped Transaction List */}
      {groupedTransactions.length === 0 ? (
        <EmptyState
          title="ยังไม่มีประวัติรายการเงินสด"
          description="เมื่อมีการรับชำระหรือบันทึกการเบิกจ่าย ประวัติจะแสดงจัดกลุ่มตามวันที่ที่นี่"
          actionLabel="บันทึกรายการแรก"
          onAction={() => setModalOpen(true)}
        />
      ) : (
        <div className="space-y-6">
          {groupedTransactions.map(([dateKey, txList]) => (
            <div key={dateKey} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <span className="text-xs font-mono font-semibold text-[#1C1917]">
                  {dateKey}
                </span>
                <span className="text-[11px] text-[#78716C]">
                  ({txList.length} รายการ)
                </span>
              </div>

              <div className="bg-[#FFFCF8] rounded-[20px] border border-[#1C1917]/10 divide-y divide-[#1C1917]/5 overflow-hidden">
                {txList.map((tx) => {
                  const isIn = tx.type === "payment";
                  return (
                    <div
                      key={tx.transactionId}
                      className="p-4 flex items-center justify-between gap-4 hover:bg-[#1C1917]/[0.015] transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className={`w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0 ${
                            isIn
                              ? "bg-[#3F6B4B]/10 text-[#3F6B4B]"
                              : "bg-[#A33B2B]/10 text-[#A33B2B]"
                          }`}
                        >
                          {isIn ? (
                            <ArrowDownLeft className="w-4 h-4" />
                          ) : (
                            <ArrowUpRight className="w-4 h-4" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-[#1C1917] truncate">
                              {tx.partyName || "คู่สัญญา"}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1C1917]/5 text-[#78716C]">
                              {tx.source || "บัญชี"}
                            </span>
                          </div>
                          <p className="text-xs text-[#78716C] truncate mt-0.5">
                            {tx.note || (isIn ? "รับชำระเงิน" : "จ่ายออก")}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <Money
                          amount={tx.amount}
                          size="base"
                          sentiment={isIn ? "income" : "expense"}
                          showPlus={isIn}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Transaction Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[#FFFCF8] rounded-3xl border border-[#1C1917]/10 p-6 shadow-xl relative">
            <h3 className="text-lg font-semibold text-[#1C1917] mb-1">
              บันทึกรายการเงินสดใหม่
            </h3>
            <p className="text-xs text-[#78716C] mb-5">
              ระบุคู่สัญญา ประเภทรายการ และจำนวนเงิน
            </p>

            <form onSubmit={handleCreateTx} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#1C1917] mb-1">
                  คู่สัญญา *
                </label>
                <select
                  required
                  value={txForm.partyId}
                  onChange={(e) =>
                    setTxForm({ ...txForm, partyId: e.target.value })
                  }
                  className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm text-[#1C1917]"
                >
                  <option value="">-- เลือกคู่สัญญา --</option>
                  {parties.map((p) => (
                    <option key={p.partyId} value={p.partyId}>
                      {p.displayName} ({p.role === "debtor" ? "ลูกหนี้" : "เจ้าหนี้"})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1C1917] mb-1">
                  ประเภทรายการ *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTxForm({ ...txForm, type: "payment" })}
                    className={`h-10 rounded-[10px] text-xs font-medium border transition-all cursor-pointer ${
                      txForm.type === "payment"
                        ? "bg-[#3F6B4B] text-white border-[#3F6B4B]"
                        : "bg-white border-[#1C1917]/15 text-[#1C1917]"
                    }`}
                  >
                    เงินเข้า (รับชำระ)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTxForm({ ...txForm, type: "disbursement" })}
                    className={`h-10 rounded-[10px] text-xs font-medium border transition-all cursor-pointer ${
                      txForm.type === "disbursement"
                        ? "bg-[#A33B2B] text-white border-[#A33B2B]"
                        : "bg-white border-[#1C1917]/15 text-[#1C1917]"
                    }`}
                  >
                    เงินออก (จ่ายเงิน)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1C1917] mb-1">
                  จำนวนเงิน (บาท) *
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  required
                  placeholder="0.00"
                  value={txForm.amount}
                  onChange={(e) =>
                    setTxForm({ ...txForm, amount: e.target.value })
                  }
                  className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm font-mono tabular-nums text-[#1C1917]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1C1917] mb-1">
                  วันที่ทำรายการ *
                </label>
                <input
                  type="date"
                  required
                  value={txForm.date}
                  onChange={(e) =>
                    setTxForm({ ...txForm, date: e.target.value })
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
                  placeholder="เช่น ชำระค่าสินค้า, ค่าโอน"
                  value={txForm.note}
                  onChange={(e) =>
                    setTxForm({ ...txForm, note: e.target.value })
                  }
                  className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm text-[#1C1917]"
                />
              </div>

              <div className="flex items-center gap-2 pt-3">
                <Button
                  type="button"
                  variant="secondary"
                  fullWidth
                  onClick={() => setModalOpen(false)}
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
    </div>
  );
}
