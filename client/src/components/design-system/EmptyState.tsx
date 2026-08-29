import React from "react";
import { Button } from "./Button";
import { FolderOpen } from "lucide-react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className = "",
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-[20px] border border-dashed border-[#1C1917]/15 bg-[#FFFCF8]/50 ${className}`}
    >
      <div className="w-12 h-12 rounded-[14px] bg-[#1C1917]/5 flex items-center justify-center text-[#78716C] mb-3.5">
        {icon || <FolderOpen className="w-6 h-6 stroke-[1.5]" />}
      </div>
      <h3 className="text-base font-semibold text-[#1C1917] mb-1">{title}</h3>
      <p className="text-xs sm:text-sm text-[#78716C] max-w-sm mb-4 leading-relaxed">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button variant="secondary" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
