import React from "react";
import { Loader2 } from "lucide-react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = "primary",
      size = "md",
      icon,
      iconRight,
      loading = false,
      fullWidth = false,
      className = "",
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-medium rounded-[12px] transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1C1917] disabled:opacity-50 disabled:pointer-events-none cursor-pointer select-none";

    const variantStyles = {
      primary:
        "bg-gradient-to-b from-[#2F2925] to-[#171412] text-white hover:from-[#3D3530] hover:to-[#221E1A] active:translate-y-[1px] shadow-[0_3px_8px_rgba(0,0,0,0.18)] border border-black/20",
      secondary:
        "bg-white/95 text-[#1C1917] border border-[#1C1917]/15 shadow-xs hover:bg-[#F6F4F0] hover:border-[#1C1917]/25 active:translate-y-[1px]",
      ghost:
        "bg-transparent text-[#78716C] hover:text-[#1C1917] hover:bg-[#1C1917]/5 active:translate-y-[1px]",
      danger:
        "bg-gradient-to-b from-[#E11D48] to-[#BE123C] text-white hover:from-[#F43F5E] hover:to-[#E11D48] active:translate-y-[1px] shadow-[0_3px_8px_rgba(190,18,60,0.25)] border border-rose-800/30",
      success:
        "bg-gradient-to-b from-[#16A34A] to-[#15803D] text-white hover:from-[#22C55E] hover:to-[#16A34A] active:translate-y-[1px] shadow-[0_3px_8px_rgba(22,163,74,0.25)] border border-emerald-800/30",
    }[variant];

    const sizeStyles = {
      sm: "h-8 px-3 text-xs gap-1.5",
      md: "h-10 px-4 text-sm gap-2",
      lg: "h-12 px-6 text-base gap-2.5",
    }[size];

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`${baseStyles} ${variantStyles} ${sizeStyles} ${
          fullWidth ? "w-full" : ""
        } ${className}`}
        {...props}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-current" />
        ) : (
          icon && <span className="shrink-0">{icon}</span>
        )}
        <span>{children}</span>
        {!loading && iconRight && <span className="shrink-0">{iconRight}</span>}
      </button>
    );
  }
);

Button.displayName = "Button";
