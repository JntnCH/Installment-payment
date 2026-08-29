import React from "react";

interface MoneyProps {
  amount: number | string | null | undefined;
  currency?: string;
  size?: "xs" | "sm" | "base" | "lg" | "xl" | "hero";
  sentiment?: "income" | "expense" | "due" | "neutral" | "default";
  showPlus?: boolean;
  className?: string;
}

export function formatNumber(val: number | string | null | undefined): string {
  const num = Number(val ?? 0);
  if (!Number.isFinite(num)) return "0.00";
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

export const Money: React.FC<MoneyProps> = ({
  amount,
  currency = "฿",
  size = "base",
  sentiment = "default",
  showPlus = false,
  className = "",
}) => {
  const num = Number(amount ?? 0);
  const formatted = formatNumber(num);
  const isPositive = num > 0;

  const sizeClasses = {
    xs: "text-xs",
    sm: "text-sm",
    base: "text-base font-semibold",
    lg: "text-lg font-semibold",
    xl: "text-2xl font-bold tracking-tight",
    hero: "text-3xl sm:text-4xl font-bold tracking-tight",
  }[size];

  const sentimentClasses = {
    default: "text-[#1C1917]",
    neutral: "text-[#78716C]",
    income: "text-[#3F6B4B]",
    expense: "text-[#A33B2B]",
    due: "text-[#A16207]",
  }[sentiment];

  return (
    <span
      className={`inline-flex items-baseline gap-0.5 tabular-nums font-mono ${sizeClasses} ${sentimentClasses} ${className}`}
    >
      <span className="text-[0.85em] font-normal opacity-80 select-none">{currency}</span>
      <span>
        {showPlus && isPositive && "+"}
        {formatted}
      </span>
    </span>
  );
};
