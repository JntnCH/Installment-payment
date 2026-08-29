import React from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  kicker?: string;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  action,
  kicker,
  className = "",
}) => {
  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-[#1C1917]/10 ${className}`}
    >
      <div className="space-y-1">
        {kicker && (
          <div className="text-[11px] font-mono tracking-wider uppercase text-[#78716C]">
            {kicker}
          </div>
        )}
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#1C1917]">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-[#78716C] max-w-2xl leading-relaxed">
            {description}
          </p>
        )}
      </div>

      {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
    </div>
  );
};
