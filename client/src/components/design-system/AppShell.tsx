import React, { useState } from "react";
import {
  LayoutDashboard,
  ArrowLeftRight,
  UserCheck,
  Receipt,
  Calculator,
  FileSpreadsheet,
  Plus,
  ShieldCheck,
  Menu,
  X,
  Bot,
} from "lucide-react";

export type NavTabId =
  | "overview"
  | "dialogflow"
  | "cashflow"
  | "lent"
  | "borrowed"
  | "calculator"
  | "sheets";

export interface NavItem {
  id: NavTabId;
  label: string;
  shortLabel: string;
  icon: React.ElementType;
  badge?: string | number;
}

interface AppShellProps {
  activeTab: NavTabId;
  onTabChange: (tab: NavTabId) => void;
  children: React.ReactNode;
  overdueCount?: number;
}

export const AppShell: React.FC<AppShellProps> = ({
  activeTab,
  onTabChange,
  children,
  overdueCount = 0,
}) => {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const navItems: NavItem[] = [
    {
      id: "overview",
      label: "ภาพรวมพอร์ต",
      shortLabel: "ภาพรวม",
      icon: LayoutDashboard,
      badge: overdueCount > 0 ? `${overdueCount}` : undefined,
    },
    {
      id: "dialogflow",
      label: "ข้อมูลจาก Dialogflow",
      shortLabel: "Dialogflow",
      icon: Bot,
    },
    {
      id: "cashflow",
      label: "รายรับ-รายจ่าย",
      shortLabel: "รับ-จ่าย",
      icon: ArrowLeftRight,
    },
    {
      id: "lent",
      label: "ให้ยืม (ฉันเป็นเจ้าหนี้)",
      shortLabel: "ให้ยืม",
      icon: UserCheck,
    },
    {
      id: "borrowed",
      label: "กู้ยืม & บิลประจำ",
      shortLabel: "กู้ & บิล",
      icon: Receipt,
    },
    {
      id: "calculator",
      label: "คำนวณ & สร้างสัญญา",
      shortLabel: "คำนวณ",
      icon: Calculator,
    },
    {
      id: "sheets",
      label: "ซิงก์ & จัดการข้อมูล",
      shortLabel: "ซิงก์ชีต",
      icon: FileSpreadsheet,
    },
  ];

  const todayThai = new Date().toLocaleDateString("th-TH", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen bg-[#F6F4F0] text-[#1C1917] flex flex-col md:flex-row antialiased selection:bg-[#1C1917] selection:text-white">
      {/* Desktop Left Rail */}
      <aside className="hidden md:flex flex-col w-64 lg:w-72 bg-[#FFFCF8] border-r border-[#1C1917]/10 h-screen sticky top-0 z-30 shrink-0 select-none">
        {/* Brand Header */}
        <div className="p-6 pb-5 border-b border-[#1C1917]/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[12px] bg-[#1C1917] text-white flex items-center justify-center font-bold shadow-sm">
              <span className="font-mono text-sm tracking-tighter">สมุด</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm tracking-tight text-[#1C1917] leading-tight">
                สมุดบัญชีเงินกู้
              </div>
              <div className="text-[11px] text-[#78716C] leading-tight mt-0.5">
                Personal Debt & Ledger
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#1C1917]/5 flex items-center justify-between text-xs text-[#78716C]">
            <span className="text-[11px] font-mono">{todayThai}</span>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="p-3.5 space-y-1 flex-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-3 rounded-[10px] text-xs font-medium transition-all text-left cursor-pointer ${
                  isActive
                    ? "bg-[#1C1917] text-white shadow-sm font-semibold"
                    : "text-[#78716C] hover:text-[#1C1917] hover:bg-[#1C1917]/5"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-white" : "text-[#78716C]"}`} />
                  <span className="truncate">{item.label}</span>
                </div>

                {item.badge && (
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-[#A33B2B]/10 text-[#A33B2B] font-bold"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer info in rail */}
        <div className="p-4 border-t border-[#1C1917]/10 text-xs text-[#78716C] space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#3F6B4B]" />
              ระบบพร้อมใช้งาน
            </span>
            <span className="font-mono text-[10px]">v2.5</span>
          </div>
        </div>
      </aside>

      {/* Mobile Top Header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-[#FFFCF8] border-b border-[#1C1917]/10 sticky top-0 z-30">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-[10px] bg-[#1C1917] text-white flex items-center justify-center font-bold text-xs">
            <span>สมุด</span>
          </div>
          <div>
            <div className="font-semibold text-sm text-[#1C1917] leading-tight">
              สมุดบัญชีเงินกู้
            </div>
            <div className="text-[10px] text-[#78716C]">
              {navItems.find((n) => n.id === activeTab)?.label}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onTabChange("calculator")}
          className="h-8 px-3 rounded-[10px] bg-[#1C1917] text-white text-xs font-medium flex items-center gap-1 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>สร้างสัญญา</span>
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 flex flex-col pb-24 md:pb-8">
        <div className="w-full max-w-5xl mx-auto p-4 sm:p-6 md:p-8 space-y-8 flex-1">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#FFFCF8]/95 backdrop-blur-md border-t border-[#1C1917]/10 px-2 py-1 flex items-center justify-around shadow-lg">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              className={`flex-1 min-h-[48px] flex flex-col items-center justify-center gap-1 py-1 px-1 rounded-[8px] transition-colors cursor-pointer ${
                isActive ? "text-[#1C1917] font-semibold" : "text-[#78716C] hover:text-[#1C1917]"
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 ${isActive ? "text-[#1C1917] stroke-[2.2]" : "stroke-[1.5]"}`} />
                {item.badge && (
                  <span className="absolute -top-1 -right-2 w-2 h-2 bg-[#A33B2B] rounded-full" />
                )}
              </div>
              <span className="text-[10px] tracking-tight">{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
