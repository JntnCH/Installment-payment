import React from "react";
import { Money } from "./Money";

interface StatCardProps {
  label: string;
  amount?: number | string | null;
  rawDisplay?: React.ReactNode;
  subtitle?: string;
  sentiment?: "income" | "expense" | "due" | "neutral" | "default";
  accentBar?: "income" | "expense" | "due" | "neutral";
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  amount,
  rawDisplay,
  subtitle,
  sentiment = "default",
  accentBar,
  icon,
  badge,
  className = "",
  onClick,
}) => {
  const accentBarClasses = {
    income: "border-l-[4px] border-l-[#16A34A] bg-gradient-to-br from-emerald-500/5 via-[#FFFCF8] to-[#FFFCF8]",
    expense: "border-l-[4px] border-l-[#DC2626] bg-gradient-to-br from-rose-500/5 via-[#FFFCF8] to-[#FFFCF8]",
    due: "border-l-[4px] border-l-[#D97706] bg-gradient-to-br from-amber-500/5 via-[#FFFCF8] to-[#FFFCF8]",
    neutral: "border-l-[4px] border-l-[#475569] bg-gradient-to-br from-slate-500/5 via-[#FFFCF8] to-[#FFFCF8]",
  };

  return (
    <div
      onClick={onClick}
      className={`relative bg-[#FFFCF8] rounded-[20px] border border-[#1C1917]/10 p-4 sm:p-5 shadow-[0_4px_16px_rgba(0,0,0,0.05),0_1px_3px_rgba(0,0,0,0.04)] transition-all duration-200 ${
        accentBar ? accentBarClasses[accentBar] : ""
      } ${onClick ? "cursor-pointer hover:shadow-[0_8px_24px_rgba(0,0,0,0.09)] hover:-translate-y-0.5 active:translate-y-0" : ""} ${className}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-medium text-[#78716C] tracking-normal">{label}</span>
        {badge ? (
          <div>{badge}</div>
        ) : icon ? (
          <span className="text-[#78716C] p-1.5 rounded-lg bg-[#1C1917]/5">{icon}</span>
        ) : null}
      </div>

      <div className="my-1.5">
        {rawDisplay !== undefined ? (
          rawDisplay
        ) : amount !== undefined ? (
          <Money amount={amount} size="xl" sentiment={sentiment} />
        ) : (
          <span className="text-2xl font-bold font-mono text-[#1C1917]">0.00</span>
        )}
      </div>

      {subtitle && (
        <p className="text-xs text-[#78716C] mt-1.5 line-clamp-1">{subtitle}</p>
      )}
    </div>
  );
};
