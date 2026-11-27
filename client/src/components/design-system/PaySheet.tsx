import React, { useState, useEffect } from "react";
import { X, CheckCircle2 } from "lucide-react";
import { Money } from "./Money";
import { Button } from "./Button";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export interface PaySheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  defaultAmount: number;
  totalDue?: number;
  type?: "pay" | "receive";
  onConfirm: (data: { paymentId: string; amount: number; date: string; note: string; account: string; receipt?: { fileName: string; mimeType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf"; base64: string } }) => Promise<void>;
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
  const accountsQuery = trpc.sheets.getBalance.useQuery(undefined, { retry: 1 });
  const accounts = accountsQuery.data?.accountBalances ?? [];
  const [account, setAccount] = useState("");
  const [paymentId, setPaymentId] = useState(crypto.randomUUID());
  const [amount, setAmount] = useState<string>(String(defaultAmount || 0));
  const [paymentMode, setPaymentMode] = useState<"full" | "partial">("full");
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState<string>("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount(String(defaultAmount || 0));
      setAccount("");
      setPaymentId(crypto.randomUUID());
      setPaymentMode("full");
      setDate(new Date().toISOString().slice(0, 10));
      setNote("");
      setReceiptFile(null);
    }
  }, [open, defaultAmount]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) return;
    const dueAmount = Number(totalDue ?? defaultAmount);
    if (!account || !accounts.some(item => item.name === account)) {
      toast.error("กรุณาเลือกบัญชีจากรายการบัญชีที่เชื่อมต่อ");
      return;
    }
    if (Math.round(numAmount * 100) > Math.round(dueAmount * 100)) {
      toast.error(type === "receive" ? "ยอดรับชำระต้องไม่เกินยอดคงเหลือ" : "ยอดชำระต้องไม่เกินยอดคงเหลือ");
      return;
    }
    if (paymentMode === "full" && Math.round(numAmount * 100) !== Math.round(dueAmount * 100)) {
      setAmount(String(dueAmount));
      return;
    }

    setLoading(true);
    try {
      let receipt: { fileName: string; mimeType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf"; base64: string } | undefined;
      if (receiptFile) {
        if (receiptFile.size > 8 * 1024 * 1024) throw new Error("ไฟล์หลักฐานต้องมีขนาดไม่เกิน 8 MB");
        if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(receiptFile.type)) throw new Error("รองรับ JPG, PNG, WEBP หรือ PDF เท่านั้น");
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
          reader.onerror = () => reject(new Error("อ่านไฟล์หลักฐานไม่สำเร็จ"));
          reader.readAsDataURL(receiptFile);
        });
        receipt = { fileName: receiptFile.name, mimeType: receiptFile.type as "image/jpeg" | "image/png" | "image/webp" | "application/pdf", base64 };
      }
      await onConfirm({ paymentId, amount: numAmount, date, note: note.trim(), account, receipt });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full min-w-0 max-w-md box-border bg-[#FFFCF8] rounded-3xl border border-[#1C1917]/10 p-4 sm:p-6 shadow-xl relative animate-in zoom-in-95 duration-150"
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
        <form onSubmit={handleSubmit} className="min-w-0 space-y-4">
          {(
            <div className="space-y-2">
              <label className="block text-xs font-medium text-[#1C1917]">{type === "receive" ? "รูปแบบการรับชำระ *" : "รูปแบบการชำระค่างวด *"}</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => { setPaymentMode("full"); setAmount(String(totalDue ?? defaultAmount)); }} className={`min-w-0 rounded-xl border px-3 py-3 text-sm font-semibold transition-colors ${paymentMode === "full" ? "border-[#A33B2B] bg-[#A33B2B]/10 text-[#A33B2B]" : "border-[#1C1917]/15 bg-white text-[#1C1917]"}`}>
                  {type === "receive" ? "รับเต็มจำนวน" : "จ่ายเต็มจำนวน"}
                  <span className="mt-1 block text-xs font-normal">฿{Number(totalDue ?? defaultAmount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
                </button>
                <button type="button" onClick={() => { setPaymentMode("partial"); setAmount(""); }} className={`min-w-0 rounded-xl border px-3 py-3 text-sm font-semibold transition-colors ${paymentMode === "partial" ? "border-[#A33B2B] bg-[#A33B2B]/10 text-[#A33B2B]" : "border-[#1C1917]/15 bg-white text-[#1C1917]"}`}>
                  {type === "receive" ? "รับบางส่วน" : "จ่ายบางส่วน"}
                  <span className="mt-1 block text-xs font-normal">ระบุยอดที่จ่ายจริง</span>
                </button>
              </div>
              <p className="text-[11px] text-[#78716C]">ยอดคงเหลือ ฿{Number(totalDue ?? defaultAmount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</p>
            </div>
          )}
          <div className="w-full min-w-0">
            <label className="block text-xs font-medium text-[#1C1917] mb-1.5">บัญชีที่{type === "receive" ? "รับเงินเข้า" : "ใช้จ่ายออก"} *</label>
            <select value={account} onChange={e => setAccount(e.target.value)} required disabled={accountsQuery.isLoading || accounts.length === 0} className="block w-full h-11 px-3.5 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm text-[#1C1917]">
              <option value="">{accountsQuery.isLoading ? "กำลังโหลดบัญชี..." : "-- เลือกบัญชี --"}</option>
              {accounts.map(item => <option key={item.name} value={item.name}>{item.name} · ฿{Number(item.amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</option>)}
            </select>
            {!accountsQuery.isLoading && accounts.length === 0 && <p className="mt-1 text-[11px] text-rose-600">ไม่พบบัญชีจาก Google Sheets กรุณาตรวจสอบการเชื่อมต่อบัญชีก่อนทำรายการ</p>}
          </div>
          <div className="w-full min-w-0">
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
              max={totalDue ?? defaultAmount}
              disabled={paymentMode === "full"}
              className="block box-border min-w-0 w-full max-w-full h-11 px-3.5 bg-white border border-[#1C1917]/15 rounded-[10px] text-base font-mono font-semibold tabular-nums text-[#1C1917] focus:outline-none focus:border-[#1C1917] focus:ring-1 focus:ring-[#1C1917]"
            />
          </div>

          <div className="block w-full min-w-0 max-w-full overflow-hidden">
            <label className="block text-xs font-medium text-[#1C1917] mb-1.5">
              วันที่ทำรายการ *
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ display: "block", width: "100%", minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }}
              className="payment-date-input h-11 px-3.5 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm text-[#1C1917] focus:outline-none focus:border-[#1C1917] focus:ring-1 focus:ring-[#1C1917]"
            />
          </div>

          <div className="w-full min-w-0">
            <label className="block text-xs font-medium text-[#1C1917] mb-1.5">
              บันทึกช่วยจำ (ไม่บังคับ)
            </label>
            <input
              type="text"
              placeholder="เช่น โอนผ่านพร้อมเพย์, ชำระหน้างวด"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="block box-border min-w-0 w-full max-w-full h-11 px-3.5 bg-white border border-[#1C1917]/15 rounded-[10px] text-sm text-[#1C1917] focus:outline-none focus:border-[#1C1917] focus:ring-1 focus:ring-[#1C1917]"
            />
          </div>

          <div className="w-full min-w-0">
            <label className="block text-xs font-medium text-[#1C1917] mb-1.5">
              แนบสลิป / หลักฐาน (ไม่บังคับ)
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
              className="block box-border min-w-0 w-full max-w-full text-xs"
            />
            <p className="text-[11px] text-[#78716C] mt-1">
              {receiptFile ? `${receiptFile.name} · ${(receiptFile.size / 1024 / 1024).toFixed(2)} MB` : "JPG, PNG, WEBP หรือ PDF ขนาดไม่เกิน 8 MB"}
            </p>
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
