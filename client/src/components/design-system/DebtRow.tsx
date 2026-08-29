import React from "react";
import { StatusDot, StatusType } from "./StatusDot";
import { StatusChip } from "./StatusDot";
import { Money } from "./Money";
import { Button } from "./Button";
import { ChevronRight } from "lucide-react";

export interface DebtRowProps {
  id?: string;
  title: string;
  subtitle: string;
  amount: number | string;
  status: StatusType | string;
  statusLabel?: string;
  dueDate?: string;
  partyName?: string;
  progressPercent?: number;
  paidAmount?: number;
  totalAmount?: number;
  actionLabel?: string;
  onAction?: () => void;
  onClick?: () => void;
  className?: string;
}

export const DebtRow: React.FC<DebtRowProps> = ({
  title,
  subtitle,
  amount,
  status,
  statusLabel,
  progressPercent,
  actionLabel,
  onAction,
  onClick,
  className = "",
}) => {
  return (
    <div
      onClick={onClick}
      className={`group relative bg-[#FFFCF8] rounded-[20px] border border-[#1C1917]/10 p-4 sm:p-5 transition-all hover:border-[#1C1917]/20 ${
        onClick ? "cursor-pointer" : ""
      } ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        {/* Left Info */}
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="pt-1.5 shrink-0">
            <StatusDot status={status} />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm sm:text-base text-[#1C1917] truncate">
                {title}
              </span>
              {statusLabel && (
                <StatusChip status={status} label={statusLabel} size="sm" />
              )}
            </div>
            <p className="text-xs text-[#78716C] truncate">{subtitle}</p>
          </div>
        </div>

        {/* Right Info & Action */}
        <div className="flex items-center gap-3 shrink-0 text-right">
          <div>
            <div className="text-xs text-[#78716C]">ยอดเงิน</div>
            <Money
              amount={amount}
              size="base"
              sentiment={
                status === "overdue" || status === "borrowed"
                  ? "expense"
                  : status === "lent" || status === "paid"
                  ? "income"
                  : "default"
              }
            />
          </div>

          {onAction && actionLabel && (
            <Button
              size="sm"
              variant="primary"
              onClick={(e) => {
                e.stopPropagation();
                onAction();
              }}
              className="text-xs shrink-0"
            >
              {actionLabel}
            </Button>
          )}

          {onClick && !onAction && (
            <ChevronRight className="w-4 h-4 text-[#78716C] opacity-60 group-hover:opacity-100 transition-opacity shrink-0" />
          )}
        </div>
      </div>

      {/* Progress Track (if applicable) */}
      {progressPercent !== undefined && (
        <div className="mt-3 pt-2 border-t border-[#1C1917]/5">
          <div className="flex items-center justify-between text-[11px] text-[#78716C] mb-1">
            <span>ความคืบหน้า</span>
            <span className="font-mono tabular-nums">{Math.round(progressPercent)}%</span>
          </div>
          <div className="w-full h-1 bg-[#1C1917]/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#1C1917] transition-all duration-300 rounded-full"
              style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
