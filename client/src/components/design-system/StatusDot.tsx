import React from "react";

export type StatusType =
  | "paid"
  | "overdue"
  | "today"
  | "soon"
  | "pending"
  | "active"
  | "lent"
  | "borrowed"
  | "completed";

interface StatusDotProps {
  status: StatusType | string;
  className?: string;
  pulse?: boolean;
}

export const StatusDot: React.FC<StatusDotProps> = ({ status, className = "", pulse = false }) => {
  const getDotColor = () => {
    switch (status) {
      case "paid":
      case "completed":
      case "settled":
        return "bg-[#3F6B4B]";
      case "overdue":
      case "expense":
        return "bg-[#A33B2B]";
      case "today":
      case "soon":
      case "due":
        return "bg-[#A16207]";
      case "pending":
      case "active":
      case "lent":
      case "borrowed":
      default:
        return "bg-[#78716C]";
    }
  };

  return (
    <span className="relative flex h-2 w-2 shrink-0">
      {pulse && (
        <span
          className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${getDotColor()}`}
        />
      )}
      <span className={`relative inline-flex rounded-full h-2 w-2 ${getDotColor()} ${className}`} />
    </span>
  );
};

interface StatusChipProps {
  status: StatusType | string;
  label?: string;
  size?: "sm" | "md";
  className?: string;
}

export const StatusChip: React.FC<StatusChipProps> = ({
  status,
  label,
  size = "sm",
  className = "",
}) => {
  const getStatusConfig = () => {
    switch (status) {
      case "paid":
      case "completed":
      case "settled":
        return {
          text: label || "ชำระแล้ว",
          bg: "bg-[#3F6B4B]/10 text-[#3F6B4B] border-[#3F6B4B]/20",
          dot: "bg-[#3F6B4B]",
        };
      case "overdue":
        return {
          text: label || "เกินกำหนด",
          bg: "bg-[#A33B2B]/10 text-[#A33B2B] border-[#A33B2B]/20",
          dot: "bg-[#A33B2B]",
        };
      case "today":
        return {
          text: label || "ครบกำหนดวันนี้",
          bg: "bg-[#A16207]/10 text-[#A16207] border-[#A16207]/20",
          dot: "bg-[#A16207]",
        };
      case "soon":
        return {
          text: label || "ใกล้ครบกำหนด",
          bg: "bg-[#A16207]/10 text-[#A16207] border-[#A16207]/20",
          dot: "bg-[#A16207]",
        };
      case "lent":
        return {
          text: label || "รอรับคืน",
          bg: "bg-[#3F6B4B]/10 text-[#3F6B4B] border-[#3F6B4B]/20",
          dot: "bg-[#3F6B4B]",
        };
      case "borrowed":
        return {
          text: label || "ต้องจ่าย",
          bg: "bg-[#A33B2B]/10 text-[#A33B2B] border-[#A33B2B]/20",
          dot: "bg-[#A33B2B]",
        };
      case "pending":
      case "active":
      default:
        return {
          text: label || "รอชำระ",
          bg: "bg-[#78716C]/10 text-[#78716C] border-[#78716C]/20",
          dot: "bg-[#78716C]",
        };
    }
  };

  const config = getStatusConfig();
  const sizeClasses = size === "sm" ? "text-[11px] px-2 py-0.5" : "text-xs px-2.5 py-1";

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${config.bg} ${sizeClasses} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      <span>{config.text}</span>
    </span>
  );
};
