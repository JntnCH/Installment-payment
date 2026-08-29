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
    income: "border-l-[3px] border-l-[#3F6B4B]",
    expense: "border-l-[3px] border-l-[#A33B2B]",
    due: "border-l-[3px] border-l-[#A16207]",
    neutral: "border-l-[3px] border-l-[#78716C]",
  };

  return (
    <div
      onClick={onClick}
      className={`relative bg-[#FFFCF8] rounded-[20px] border border-[#1C1917]/10 p-4 sm:p-5 transition-shadow ${
        accentBar ? accentBarClasses[accentBar] : ""
      } ${onClick ? "cursor-pointer hover:shadow-sm" : ""} ${className}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-medium text-[#78716C] tracking-normal">{label}</span>
        {badge ? (
          <div>{badge}</div>
        ) : icon ? (
          <span className="text-[#78716C]">{icon}</span>
        ) : null}
      </div>

      <div className="my-1">
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
