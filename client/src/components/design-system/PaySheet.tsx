import React, { useState, useEffect } from "react";
import { X, CheckCircle2 } from "lucide-react";
import { Money } from "./Money";
import { Button } from "./Button";

export interface PaySheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  defaultAmount: number;
  totalDue?: number;
  type?: "pay" | "receive";
  onConfirm: (data: { amount: number; date: string; note: string }) => Promise<void>;
}

export const PaySheet: React.FC<PaySheetProps> = ({
  open,
  onClose,
  title,
  subtitle,
  defaultAmount,
  totalDue,
  type = "receive",
  onConfirm,
}) => {
  const [amount, setAmount] = useState<string>(String(defaultAmount || 0));
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount(String(defaultAmount || 0));
      setDate(new Date().toISOString().slice(0, 10));
      setNote("");
    }
  }, [open, defaultAmount]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) return;

    setLoading(true);
    try {
      await onConfirm({
        amount: numAmount,
        date,
        note: note.trim(),
      });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-[#FFFCF8] rounded-3xl border border-[#1C1917]/10 p-6 shadow-xl relative animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#1C1917]/10">
          <div>
            <h3 className="text-lg font-semibold text-[#1C1917]">{title}</h3>
            {subtitle && <p className="text-xs text-[#78716C] mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-[10px] text-[#78716C] hover:text-[#1C1917] hover:bg-[#1C1917]/5 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Amount Due Highlight */}
        <div className="my-5 p-4 bg-[#F6F4F0] rounded-2xl text-center border border-[#1C1917]/5">
          <div className="text-xs text-[#78716C] mb-1">
            {type === "receive" ? "ยอดที่ต้องรับชำระ" : "ยอดที่ต้องจ่ายชำระ"}
          </div>
          <Money
            amount={totalDue ?? defaultAmount}
            size="hero"
            sentiment={type === "receive" ? "income" : "expense"}
          />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#1C1917] mb-1.5">
              จำนวนเงินที่บันทึก (บาท) *
            </label>
            <input
              type="number"
              step="any"
              min="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full h-11 px-3.5 bg-white border border-[#1C1917]/15 rounded-[10px] text-base font-mono font-semibold tabular-nums text-[#1C1917] focus:outline-none focus:border-[#1C1917] focus:ring-1 focus:ring-[#1C1917]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#1C1917] mb-1.5">
              วันที่ทำรายการ *
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full h-11 px-3.5 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm text-[#1C1917] focus:outline-none focus:border-[#1C1917] focus:ring-1 focus:ring-[#1C1917]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#1C1917] mb-1.5">
              บันทึกช่วยจำ (ไม่บังคับ)
            </label>
            <input
              type="text"
              placeholder="เช่น โอนผ่านพร้อมเพย์, ชำระหน้างวด"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full h-11 px-3.5 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm text-[#1C1917] focus:outline-none focus:border-[#1C1917] focus:ring-1 focus:ring-[#1C1917]"
            />
          </div>

          <div className="pt-2">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              loading={loading}
              icon={<CheckCircle2 className="w-4 h-4" />}
            >
              {type === "receive" ? "ยืนยันการรับเงิน" : "ยืนยันการชำระเงิน"}
            </Button>
            <p className="text-[11px] text-[#78716C] text-center mt-2.5">
              รายการจะถูกลงบัญชีและอัปเดตสถานะงวดชำระโดยอัตโนมัติ
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};
