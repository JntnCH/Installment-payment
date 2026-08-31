import React, { useState } from "react";
import {
  TrendingUp,
  Plus,
  FileSpreadsheet,
  AlertCircle,
  Clock,
  CheckCircle2,
  Calendar,
  ChevronRight,
  ArrowDownRight,
  ArrowUpRight,
  Sparkles,
  Bot,
  Layers,
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

interface DashboardOverviewProps {
  onNavigate: (tab: string) => void;
  onOpenContract?: (partyId: string, contractId: string) => void;
}

export default function DashboardOverview({
  onNavigate,
  onOpenContract,
}: DashboardOverviewProps) {
  const statsQuery = trpc.ledger.getStats.useQuery();
  const markPaidMutation = trpc.ledger.markSchedulePaid.useMutation();
  const utils = trpc.useUtils();

  const [activePayItem, setActivePayItem] = useState<{
    scheduleId: string;
    title: string;
    subtitle: string;
    amount: number;
  } | null>(null);

  const stats = statsQuery.data;

  const handleConfirmPay = async (data: {
    amount: number;
    date: string;
    note: string;
  }) => {
    if (!activePayItem) return;
    try {
      await markPaidMutation.mutateAsync({
        scheduleId: activePayItem.scheduleId,
        paidAmount: data.amount,
        paidAt: new Date(data.date),
        source: "command_center",
        note: data.note || `รับชำระจากหน้าแรก: ${activePayItem.title}`,
      });
      await utils.ledger.invalidate();
      toast.success("บันทึกการรับชำระเงินเรียบร้อยแล้ว");
    } catch (err: any) {
      toast.error(`เกิดข้อผิดพลาด: ${err.message}`);
    }
  };

  const currentMonthThai = new Date().toLocaleDateString("th-TH", {
    month: "long",
    year: "numeric",
  });

  // Calculate 30-day horizon
  const today = new Date();
  const next30Days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayOfMonth = d.getDate();
    const dayOfWeek = d.toLocaleDateString("th-TH", { weekday: "short" });
    const hasAlert = stats?.alerts?.some((a) => a.dueDate === dateStr);
    const isToday = i === 0;
    return {
      dateStr,
      dayOfMonth,
      dayOfWeek,
      hasAlert,
      isToday,
    };
  });

  return (
    <div className="space-y-8">
      {/* 1. Page Header */}
      <PageHeader
        kicker="COMMAND CENTER"
        title="ภาพรวมพอร์ตการเงิน"
        description={`สรุปสถานะพอร์ตสินเชื่อ สัญญาลูกหนี้-เจ้าหนี้ และงวดชำระประจำเดือน ${currentMonthThai}`}
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<Bot className="w-4 h-4 text-[#1C1917]" />}
              onClick={() => onNavigate("dialogflow")}
            >
              Dialogflow ชีต
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<FileSpreadsheet className="w-4 h-4 text-[#3F6B4B]" />}
              onClick={() => onNavigate("sheets")}
            >
              ซิงก์ชีต
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => onNavigate("calculator")}
            >
              สร้างสัญญา
            </Button>
          </div>
        }
      />

      {/* 2. Hero Financial & Balance Breakdown Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="ลูกหนี้ค้างชำระ (ฉันเป็นเจ้าหนี้)"
          amount={stats?.debtorOutstanding ?? stats?.totalOutstanding ?? 0}
          subtitle={`เงินต้นให้ยืม ฿${Number(stats?.debtorPrincipal ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })} (${stats?.debtorCount ?? 0} ราย)`}
          accentBar="income"
          onClick={() => onNavigate("debt_hub")}
        />
        <StatCard
          label="เจ้าหนี้ & บิลที่ต้องจ่าย (ฉันเป็นลูกหนี้)"
          amount={stats?.creditorOutstanding ?? 0}
          subtitle={`ยอดกู้ยืมรวม ฿${Number(stats?.creditorPrincipal ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })} (${stats?.creditorCount ?? 0} ราย)`}
          accentBar="expense"
          onClick={() => onNavigate("debt_hub")}
        />
        <StatCard
          label="เงินรับเข้าสะสม (Inflow)"
          amount={stats?.totalInflow ?? stats?.totalCollected ?? 0}
          subtitle="รวมยอดรับชำระคืน + เงินกู้ที่ได้รับ"
          accentBar="income"
          sentiment="income"
        />
        <StatCard
          label="เงินจ่ายออกสะสม (Outflow)"
          amount={stats?.totalOutflow ?? 0}
          subtitle="รวมยอดจ่ายหนี้ + เงินปล่อยกู้"
          accentBar="expense"
          sentiment="expense"
        />
      </div>

      {/* 3. Hero Ledger Overview Box */}
      <div className="bg-[#FFFCF8] rounded-[20px] border border-[#1C1917]/10 p-6 sm:p-8 space-y-6 shadow-[0_4px_20px_rgba(0,0,0,0.06)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono text-[#78716C] uppercase tracking-wider mb-1">
              ยอดคงค้างรอเรียกเก็บสุทธิทั้งหมด (Net Outstanding)
            </div>
            <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-4">
              <Money
                amount={stats?.totalOutstanding ?? 0}
                size="hero"
                sentiment="default"
              />
              <span className="text-xs text-[#78716C]">
                จากสัญญาทั้งหมด {stats?.totalContracts ?? 0} รายการ
              </span>
            </div>
          </div>

          <Button
            variant="primary"
            size="md"
            icon={<Layers className="w-4 h-4" />}
            onClick={() => onNavigate("debt_hub")}
          >
            เปิดหน้าจัดการหนี้ & สัญญา
          </Button>
        </div>

        {/* 3 Secondary Metric Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 border-t border-[#1C1917]/10">
          <div className="space-y-1">
            <div className="text-xs text-[#78716C]">ยอดเงินต้นรวมทุกสัญญา</div>
            <Money amount={stats?.totalPrincipal ?? 0} size="lg" />
            <div className="text-[11px] text-[#78716C]">
              กำไรดอกเบี้ยคาดหวัง{" "}
              <span className="text-[#16A34A] font-mono tabular-nums font-semibold">
                +฿{Number(stats?.projectedInterest ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-[#78716C]">ยอดที่เก็บได้แล้ว (Collected)</div>
            <Money
              amount={stats?.totalCollected ?? 0}
              size="lg"
              sentiment="income"
            />
            <div className="text-[11px] text-[#78716C]">
              ความคืบหน้า{" "}
              <span className="font-mono tabular-nums font-semibold text-[#16A34A]">
                {stats?.totalScheduled
                  ? Math.round(((stats.totalCollected ?? 0) / stats.totalScheduled) * 100)
                  : 0}
                %
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-[#78716C]">งวดเกินกำหนด / วันนี้ (Alerts)</div>
            <Money
              amount={(stats?.overdue?.amount ?? 0) + (stats?.today?.amount ?? 0)}
              size="lg"
              sentiment="expense"
            />
            <div className="text-[11px] text-[#DC2626] font-semibold">
              {(stats?.overdue?.count ?? 0) + (stats?.today?.count ?? 0)} รายการที่ต้องติดตาม
            </div>
          </div>
        </div>
      </div>

      {/* 3. Urgent Action Horizon (Alerts) */}
      {stats?.alerts && stats.alerts.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[#1C1917] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#A33B2B]" />
              ต้องดำเนินการวันนี้ / เกินกำหนด ({stats.alerts.length})
            </h2>
            <span className="text-xs text-[#78716C]">
              แตะเพื่อบันทึกการรับชำระด่วน
            </span>
          </div>

          <div className="space-y-2.5">
            {stats.alerts.slice(0, 5).map((item) => (
              <DebtRow
                key={item.id}
                title={item.partyName}
                subtitle={`${item.contractTitle} · งวดที่ ${item.installmentNo} · กำหนด ${item.dueDate}`}
                amount={item.amount}
                status={item.status}
                statusLabel={
                  item.status === "overdue"
                    ? `เกินกำหนด ${Math.abs(item.daysDiff)} วัน`
                    : item.status === "today"
                    ? "ครบกำหนดวันนี้"
                    : `อีก ${item.daysDiff} วัน`
                }
                actionLabel="รับชำระ"
                onAction={() =>
                  setActivePayItem({
                    scheduleId: item.scheduleId,
                    title: item.partyName,
                    subtitle: `${item.contractTitle} (งวดที่ ${item.installmentNo})`,
                    amount: item.amount,
                  })
                }
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* 4. 30-Day Due Calendar Strip */}
      <div className="bg-[#FFFCF8] rounded-[20px] border border-[#1C1917]/10 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[#1C1917] flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-[#78716C]" />
            ปฏิทินภาระงวดชำระ 30 วันข้างหน้า
          </span>
          <span className="text-[11px] text-[#78716C]">จุดสีแสดงวันที่มีงวดชำระ</span>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-thin">
          {next30Days.map((day) => (
            <div
              key={day.dateStr}
              className={`shrink-0 w-11 py-2 rounded-[10px] text-center border transition-all ${
                day.isToday
                  ? "bg-[#1C1917] text-white border-[#1C1917]"
                  : "bg-white border-[#1C1917]/10 text-[#1C1917]"
              }`}
            >
              <div
                className={`text-[9px] uppercase font-mono ${
                  day.isToday ? "text-stone-300" : "text-[#78716C]"
                }`}
              >
                {day.dayOfWeek}
              </div>
              <div className="text-xs font-bold font-mono my-0.5">{day.dayOfMonth}</div>
              <div className="h-1.5 flex items-center justify-center">
                {day.hasAlert && (
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      day.isToday ? "bg-amber-400" : "bg-[#A33B2B]"
                    }`}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. Monthly Cashflow Projection Chart */}
      {stats?.monthlyTimeline && stats.monthlyTimeline.length > 0 && (
        <div className="bg-[#FFFCF8] rounded-[20px] border border-[#1C1917]/10 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#1C1917]">
                ประมาณการยอดเรียกเก็บรายเดือน (Monthly Cashflow)
              </h3>
              <p className="text-xs text-[#78716C]">
                เปรียบเทียบยอดที่กำหนดเรียกเก็บ กับยอดที่เก็บได้แล้วจริง
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            {stats.monthlyTimeline.map((item) => {
              const total = item.scheduled || 1;
              const collectedRatio = Math.min(100, (item.collected / total) * 100);
              return (
                <div key={item.month} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-medium text-[#1C1917]">
                      {item.month}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-[#3F6B4B] font-mono tabular-nums">
                        เก็บแล้ว ฿{item.collected.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[#78716C] font-mono tabular-nums">
                        / ฿{item.scheduled.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  <div className="w-full h-2 bg-[#1C1917]/10 rounded-full overflow-hidden flex">
                    <div
                      className="bg-[#3F6B4B] h-full transition-all duration-300"
                      style={{ width: `${collectedRatio}%` }}
                    />
                    <div
                      className="bg-[#1C1917]/30 h-full transition-all duration-300"
                      style={{ width: `${100 - collectedRatio}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Unified PaySheet Modal */}
      {activePayItem && (
        <PaySheet
          open={Boolean(activePayItem)}
          onClose={() => setActivePayItem(null)}
          title={`บันทึกรับเงิน: ${activePayItem.title}`}
          subtitle={activePayItem.subtitle}
          defaultAmount={activePayItem.amount}
          totalDue={activePayItem.amount}
          type="receive"
          onConfirm={handleConfirmPay}
        />
      )}
    </div>
  );
}
