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
    income: "border-l-[4px] border-l-[#16A34A] bg-gradient-to-br from-emerald-500/5 via-white to-white",
    expense: "border-l-[4px] border-l-[#DC2626] bg-gradient-to-br from-rose-500/5 via-[#FFFFFF] to-[#FFFFFF]",
    due: "border-l-[4px] border-l-[#D97706] bg-gradient-to-br from-amber-500/5 via-[#FFFFFF] to-[#FFFFFF]",
    neutral: "border-l-[4px] border-l-[#475569] bg-gradient-to-br from-slate-500/5 via-[#FFFFFF] to-[#FFFFFF]",
  };

  return (
    <div
      onClick={onClick}
      className={`relative bg-[#FFFFFF] rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-sm hover:shadow-md transition-all duration-200 ${
        accentBar ? accentBarClasses[accentBar] : ""
      } ${onClick ? "cursor-pointer hover:shadow-[0_8px_24px_rgba(0,0,0,0.09)] hover:-translate-y-0.5 active:translate-y-0" : ""} ${className}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-medium text-[#64748B] tracking-normal">{label}</span>
        {badge ? (
          <div>{badge}</div>
        ) : icon ? (
          <span className="text-[#64748B] p-1.5 rounded-lg bg-[#172033]/5">{icon}</span>
        ) : null}
      </div>

      <div className="my-1.5">
        {rawDisplay !== undefined ? (
          rawDisplay
        ) : amount !== undefined ? (
          <Money amount={amount} size="xl" sentiment={sentiment} />
        ) : (
          <span className="text-2xl font-bold font-mono text-[#172033]">0.00</span>
        )}
      </div>

      {subtitle && (
        <p className="text-xs text-[#64748B] mt-1.5 line-clamp-1">{subtitle}</p>
      )}
    </div>
  );
};
