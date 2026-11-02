import React, { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  PageHeader,
  StatCard,
  Money,
  Button,
  EmptyState,
} from "./design-system";

type SheetTx = {
  date?: string;
  type?: string;
  item?: string;
  amount?: number;
  account?: string;
  platform?: string;
  recorder?: string;
  transactionId?: string;
};

function isIncome(type?: string) {
  const t = String(type || "").toLowerCase();
  return t === "income" || t.includes("รับ") || t === "payment";
}

export default function CashflowManager() {
  const balanceQuery = trpc.sheets.getBalance.useQuery(undefined, {
    retry: 1,
  });
  const sheetsTxQuery = trpc.sheets.listTransactions.useQuery(
    { limit: 100 },
    { retry: 1 },
  );
  const createSheetsTx = trpc.sheets.createTransaction.useMutation();
  const utils = trpc.useUtils();

  const [filterType, setFilterType] = useState<"all" | "in" | "out">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [txForm, setTxForm] = useState({
    type: "รายรับ" as "รายรับ" | "รายจ่าย",
    item: "",
    amount: "",
    account: "เงินสด",
    note: "",
  });

  const transactions = (sheetsTxQuery.data?.data || []) as SheetTx[];
  const balance = balanceQuery.data;

  const stats = useMemo(() => {
    let totalIn = Number(balance?.monthlyIncome || 0);
    let totalOut = Number(balance?.monthlyExpense || 0);
    // Prefer summing listed rows when available
    if (transactions.length > 0) {
      totalIn = 0;
      totalOut = 0;
      for (const tx of transactions) {
        const amt = Number(tx.amount || 0);
        if (isIncome(tx.type)) totalIn += amt;
        else totalOut += amt;
      }
    }
    return {
      totalIn,
      totalOut,
      net: Number(balance?.balance ?? totalIn - totalOut),
    };
  }, [transactions, balance]);

  const groupedTransactions = useMemo(() => {
    const filtered = transactions.filter((tx) => {
      const income = isIncome(tx.type);
      if (filterType === "in") return income;
      if (filterType === "out") return !income;
      return true;
    });
    const map = new Map<string, SheetTx[]>();
    for (const tx of filtered) {
      const dateKey = tx.date || "ไม่ระบุวันที่";
      const existing = map.get(dateKey) || [];
      existing.push(tx);
      map.set(dateKey, existing);
    }
    return Array.from(map.entries());
  }, [transactions, filterType]);

  const handleCreateTx = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(txForm.amount);
    if (!txForm.item.trim()) {
      toast.error("กรุณาระบุรายการ");
      return;
    }
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error("กรุณาระบุจำนวนเงินที่ถูกต้อง");
      return;
    }
    try {
      await createSheetsTx.mutateAsync({
        type: txForm.type,
        item: txForm.item.trim(),
        amount: numAmount,
        account: txForm.account || "เงินสด",
        channel: "Installment Web",
        note: txForm.note || "",
        recorderName: "Web",
      });
      await Promise.all([
        utils.sheets.listTransactions.invalidate(),
        utils.sheets.getBalance.invalidate(),
      ]);
      toast.success("บันทึกลง Google Sheets เรียบร้อย");
      setModalOpen(false);
      setTxForm({
        type: "รายรับ",
        item: "",
        amount: "",
        account: "เงินสด",
        note: "",
      });
    } catch (err: any) {
      toast.error(`บันทึกไม่สำเร็จ: ${err.message}`);
    }
  };

  const loading = balanceQuery.isLoading || sheetsTxQuery.isLoading;
  const errorMsg =
    balanceQuery.error?.message || sheetsTxQuery.error?.message || "";

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="GOOGLE SHEETS · REAL DATA"
        title="บันทึกรายรับ-รายจ่าย"
        description="ข้อมูลจริงจาก Google Sheets — กดบันทึกแล้วเขียนลงชีตทันที"
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

      {errorMsg ? (
        <div className="rounded-2xl border border-[#A33B2B]/30 bg-[#A33B2B]/5 p-4 text-sm text-[#A33B2B]">
          เชื่อมต่อ Google Sheets ไม่สำเร็จ: {errorMsg}
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="รายรับ (จากชีต)"
          amount={stats.totalIn}
          sentiment="income"
          subtitle={loading ? "กำลังโหลด..." : "ข้อมูลจริง"}
          accentBar="income"
        />
        <StatCard
          label="รายจ่าย (จากชีต)"
          amount={stats.totalOut}
          sentiment="expense"
          subtitle={loading ? "กำลังโหลด..." : "ข้อมูลจริง"}
          accentBar="expense"
        />
        <StatCard
          label="ยอดคงเหลือ (BotDashboard)"
          amount={stats.net}
          sentiment={stats.net >= 0 ? "income" : "expense"}
          subtitle="อ่านจาก Google Sheets"
        />
      </div>

      {(balance?.accountBalances as { name: string; amount: number }[] | undefined)
        ?.length ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(balance?.accountBalances as { name: string; amount: number }[]).map(
            (acc) => (
              <div
                key={acc.name}
                className="rounded-2xl border border-[#1C1917]/10 bg-[#FFFCF8] p-3"
              >
                <div className="text-[11px] text-[#78716C] truncate">{acc.name}</div>
                <Money amount={Number(acc.amount || 0)} size="sm" />
              </div>
            ),
          )}
        </div>
      ) : null}

      <div className="flex items-center gap-1.5 p-1 bg-[#FFFCF8] rounded-full border border-[#1C1917]/10 w-fit">
        {(
          [
            ["all", "ทั้งหมด"],
            ["in", "รายรับ"],
            ["out", "รายจ่าย"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilterType(key)}
            className={`px-3.5 py-1 text-xs font-medium rounded-full transition-colors cursor-pointer ${
              filterType === key
                ? "bg-[#1C1917] text-white font-semibold"
                : "text-[#78716C] hover:text-[#1C1917]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {groupedTransactions.length === 0 ? (
        <EmptyState
          title={loading ? "กำลังโหลดรายการ..." : "ยังไม่มีรายการในชีต"}
          description="กดบันทึกรายการใหม่เพื่อเขียนลง Google Sheets"
          actionLabel="บันทึกรายการแรก"
          onAction={() => setModalOpen(true)}
        />
      ) : (
        <div className="space-y-6">
          {groupedTransactions.map(([dateKey, txList]) => (
            <div key={dateKey} className="space-y-2">
              <div className="text-xs font-mono font-semibold text-[#1C1917]">
                {dateKey} ({txList.length})
              </div>
              <div className="bg-[#FFFCF8] rounded-[20px] border border-[#1C1917]/10 divide-y divide-[#1C1917]/5 overflow-hidden">
                {txList.map((tx, idx) => {
                  const income = isIncome(tx.type);
                  return (
                    <div
                      key={tx.transactionId || `${dateKey}-${idx}`}
                      className="p-4 flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-[10px] flex items-center justify-center ${
                            income
                              ? "bg-[#3F6B4B]/10 text-[#3F6B4B]"
                              : "bg-[#A33B2B]/10 text-[#A33B2B]"
                          }`}
                        >
                          {income ? (
                            <ArrowDownLeft className="w-4 h-4" />
                          ) : (
                            <ArrowUpRight className="w-4 h-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-[#1C1917] truncate">
                            {tx.item || "รายการ"}
                          </div>
                          <p className="text-xs text-[#78716C] truncate">
                            {tx.account || "-"} · {tx.platform || "Sheets"}
                          </p>
                        </div>
                      </div>
                      <Money
                        amount={Number(tx.amount || 0)}
                        size="base"
                        sentiment={income ? "income" : "expense"}
                        showPlus={income}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[#FFFCF8] rounded-3xl border border-[#1C1917]/10 p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[#1C1917] mb-1">
              บันทึกลง Google Sheets
            </h3>
            <p className="text-xs text-[#78716C] mb-5">
              รายการนี้จะถูกเขียนลงชีตจริงทันที
            </p>
            <form onSubmit={handleCreateTx} className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTxForm({ ...txForm, type: "รายรับ" })}
                  className={`h-10 rounded-[10px] text-xs font-medium border cursor-pointer ${
                    txForm.type === "รายรับ"
                      ? "bg-[#3F6B4B] text-white border-[#3F6B4B]"
                      : "bg-white border-[#1C1917]/15"
                  }`}
                >
                  รายรับ
                </button>
                <button
                  type="button"
                  onClick={() => setTxForm({ ...txForm, type: "รายจ่าย" })}
                  className={`h-10 rounded-[10px] text-xs font-medium border cursor-pointer ${
                    txForm.type === "รายจ่าย"
                      ? "bg-[#A33B2B] text-white border-[#A33B2B]"
                      : "bg-white border-[#1C1917]/15"
                  }`}
                >
                  รายจ่าย
                </button>
              </div>
              <input
                required
                placeholder="ชื่อรายการ *"
                value={txForm.item}
                onChange={(e) => setTxForm({ ...txForm, item: e.target.value })}
                className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm"
              />
              <input
                required
                type="number"
                step="any"
                min="0.01"
                placeholder="จำนวนเงิน *"
                value={txForm.amount}
                onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })}
                className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm font-mono"
              />
              <input
                placeholder="บัญชี เช่น กสิกรไทย"
                value={txForm.account}
                onChange={(e) => setTxForm({ ...txForm, account: e.target.value })}
                className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm"
              />
              <input
                placeholder="หมายเหตุ"
                value={txForm.note}
                onChange={(e) => setTxForm({ ...txForm, note: e.target.value })}
                className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm"
              />
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="secondary" fullWidth onClick={() => setModalOpen(false)}>
                  ยกเลิก
                </Button>
                <Button type="submit" variant="primary" fullWidth disabled={createSheetsTx.isPending}>
                  {createSheetsTx.isPending ? "กำลังบันทึก..." : "บันทึก"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
