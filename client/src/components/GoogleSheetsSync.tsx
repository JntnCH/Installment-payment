import React, { useState, useEffect } from "react";
import {
  FileSpreadsheet,
  Download,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Zap,
  Send,
  Plus,
  LogIn,
  LogOut,
  FolderSync,
  AlertCircle,
  Layers,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { User } from "firebase/auth";
import { trpc } from "@/lib/trpc";
import {
  initAuth,
  googleSignIn,
  logout,
  getAccessToken,
  listGoogleSpreadsheets,
  createLedgerSpreadsheet,
  exportLedgerToGoogleSheet,
  GoogleDriveFile,
} from "@/lib/googleAuth";
import {
  PageHeader,
  StatCard,
  Button,
  StatusChip,
} from "./design-system";

export default function GoogleSheetsSync() {
  // Auth state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Google Drive Spreadsheets
  const [spreadsheets, setSpreadsheets] = useState<GoogleDriveFile[]>([]);
  const [loadingDriveSheets, setLoadingDriveSheets] = useState(false);
  const [selectedSheetId, setSelectedSheetId] = useState<string>("");
  const [customSheetUrl, setCustomSheetUrl] = useState<string>("");
  const [newSheetTitle, setNewSheetTitle] = useState<string>("");

  // Sync mode & operations
  const [syncTargetMode, setSyncTargetMode] = useState<"new" | "existing" | "custom">("new");
  const [isExporting, setIsExporting] = useState(false);
  const [lastExportedUrl, setLastExportedUrl] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Webhook sync state
  const [syncUrl, setSyncUrl] = useState("");
  const [syncTarget, setSyncTarget] = useState<"all" | "summary" | "schedules" | "parties">("all");
  const [webhookSyncLoading, setWebhookSyncLoading] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const exportQuery = trpc.ledger.exportData.useQuery();
  const syncMutation = trpc.ledger.syncGoogleSheets.useMutation();
  const statsQuery = trpc.ledger.getStats.useQuery();

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsubscribe = initAuth(
      async (user, token) => {
        setCurrentUser(user);
        setAccessToken(token);
        fetchUserSpreadsheets(token);
      },
      () => {
        setCurrentUser(null);
        setAccessToken(null);
        setSpreadsheets([]);
      }
    );
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  // Fetch Spreadsheets from Google Drive
  const fetchUserSpreadsheets = async (token: string) => {
    setLoadingDriveSheets(true);
    try {
      const files = await listGoogleSpreadsheets(token);
      setSpreadsheets(files);
      if (files.length > 0 && !selectedSheetId) {
        setSelectedSheetId(files[0].id);
      }
    } catch (err: any) {
      console.warn("Could not list Google Drive files:", err.message);
    } finally {
      setLoadingDriveSheets(false);
    }
  };

  // Google Sign-In
  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setCurrentUser(result.user);
        setAccessToken(result.accessToken);
        toast.success(`เข้าสู่ระบบ Google สำเร็จ (${result.user.displayName || result.user.email})`);
        fetchUserSpreadsheets(result.accessToken);
      }
    } catch (err: any) {
      toast.error(`เข้าสู่ระบบ Google ไม่สำเร็จ: ${err.message || "เกิดข้อผิดพลาด"}`);
    } finally {
      setAuthLoading(false);
    }
  };

  // Google Sign-Out
  const handleGoogleSignOut = async () => {
    try {
      await logout();
      setCurrentUser(null);
      setAccessToken(null);
      setSpreadsheets([]);
      setLastExportedUrl(null);
      toast.success("ออกจากระบบ Google แล้ว");
    } catch (err: any) {
      toast.error("ออกจากระบบไม่สำเร็จ");
    }
  };

  // Extract Spreadsheet ID from custom URL or ID
  const parseSpreadsheetId = (input: string): string => {
    const trimmed = input.trim();
    const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      return match[1];
    }
    return trimmed;
  };

  // Trigger Google Sheets Direct Export
  const handleStartExport = () => {
    if (!currentUser || !accessToken) {
      toast.error("กรุณาเข้าสู่ระบบ Google ก่อนดำเนินการ");
      return;
    }
    if (syncTargetMode === "existing" && !selectedSheetId) {
      toast.error("กรุณาเลือกไฟล์ Google Sheets");
      return;
    }
    if (syncTargetMode === "custom" && !customSheetUrl.trim()) {
      toast.error("กรุณาระบุ URL หรือ ID ของ Google Sheets");
      return;
    }
    setShowConfirmModal(true);
  };

  const handleConfirmExport = async () => {
    setShowConfirmModal(false);
    if (!accessToken) {
      toast.error("เซสชัน Google หมดอายุ กรุณาเข้าสู่ระบบใหม่");
      return;
    }

    setIsExporting(true);
    try {
      const ledgerData = {
        summary: statsQuery.data,
        parties: exportQuery.data?.parties || [],
        contracts: exportQuery.data?.contracts || [],
        schedules: exportQuery.data?.schedules || [],
        transactions: exportQuery.data?.transactions || [],
      };

      let targetId = "";
      let targetUrl = "";

      if (syncTargetMode === "new") {
        const title =
          newSheetTitle.trim() ||
          `สมุดบัญชีสัญญาและสินเชื่อ - ${new Date().toISOString().slice(0, 10)}`;
        const created = await createLedgerSpreadsheet(accessToken, title);
        targetId = created.spreadsheetId;
        targetUrl = created.spreadsheetUrl;
      } else if (syncTargetMode === "existing") {
        targetId = selectedSheetId;
        targetUrl = `https://docs.google.com/spreadsheets/d/${targetId}/edit`;
      } else {
        targetId = parseSpreadsheetId(customSheetUrl);
        targetUrl = `https://docs.google.com/spreadsheets/d/${targetId}/edit`;
      }

      await exportLedgerToGoogleSheet(accessToken, targetId, ledgerData);
      setLastExportedUrl(targetUrl);
      toast.success("ซิงก์ข้อมูลไปยัง Google Sheets สำเร็จเรียบร้อยแล้ว!");
      fetchUserSpreadsheets(accessToken);
    } catch (err: any) {
      toast.error(`ส่งข้อมูลไป Google Sheets ไม่สำเร็จ: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Download Local Backup JSON
  const handleDownloadBackup = () => {
    if (!exportQuery.data) {
      toast.error("ไม่มีข้อมูลสำหรับส่งออก");
      return;
    }
    const dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(exportQuery.data, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute(
      "download",
      `debt_ledger_backup_${new Date().toISOString().slice(0, 10)}.json`
    );
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    toast.success("ดาวน์โหลดไฟล์สำรองข้อมูล JSON เรียบร้อยแล้ว");
  };

  // Webhook / Apps Script Sync
  const handleTriggerWebhookSync = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!syncUrl.trim()) {
      toast.error("กรุณาระบุ Google Apps Script Web App URL หรือ Webhook URL");
      return;
    }

    setWebhookSyncLoading(true);
    try {
      const res = await syncMutation.mutateAsync({
        webhookUrl: syncUrl.trim(),
        syncTarget,
      });
      toast.success(res.message || "ซิงก์ข้อมูลผ่าน Webhook สำเร็จ");
    } catch (err: any) {
      toast.error(`ซิงก์ไม่สำเร็จ: ${err.message}`);
    } finally {
      setWebhookSyncLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* 1. Page Header */}
      <PageHeader
        kicker="DATA & GOOGLE WORKSPACE"
        title="Google Sheets & การจัดการข้อมูล"
        description="เชื่อมต่อและซิงก์ข้อมูลพอร์ตสินเชื่อ สัญญา และประวัติธุรกรรมไปยัง Google Sheets โดยตรงแบบเรียลไทม์"
      />

      {/* 2. Top Summary & Connection Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="สถานะการเชื่อมต่อ Google"
          rawDisplay={
            currentUser ? (
              <span className="text-xl font-bold font-mono text-[#3F6B4B] flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#3F6B4B] inline-block animate-pulse" />
                เชื่อมต่อแล้ว
              </span>
            ) : (
              <span className="text-xl font-bold font-mono text-[#78716C]">
                ยังไม่เชื่อมต่อ
              </span>
            )
          }
          subtitle={
            currentUser
              ? currentUser.email || "Google Workspace Account"
              : "ลงชื่อเข้าใช้เพื่อเปิดสิทธิ์ Google Drive & Sheets"
          }
          accentBar={currentUser ? "income" : undefined}
        />
        <StatCard
          label="สัญญาในระบบพร้อมซิงก์"
          rawDisplay={
            <span className="text-2xl font-bold font-mono text-[#1C1917]">
              {exportQuery.data?.contracts?.length || 0} สัญญา
            </span>
          }
          subtitle={`คู่สัญญาทั้งหมด ${exportQuery.data?.parties?.length || 0} ราย`}
        />
        <StatCard
          label="ตารางงวดชำระ & ธุรกรรม"
          rawDisplay={
            <span className="text-2xl font-bold font-mono text-[#1C1917]">
              {exportQuery.data?.schedules?.length || 0} งวด
            </span>
          }
          subtitle={`ประวัติรับชำระ ${exportQuery.data?.transactions?.length || 0} รายการ`}
        />
      </div>

      {/* 3. Google Account Auth Banner */}
      <div className="bg-[#FFFCF8] rounded-[20px] border border-[#1C1917]/10 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          {currentUser?.photoURL ? (
            <img
              src={currentUser.photoURL}
              alt="Google Avatar"
              className="w-12 h-12 rounded-full border border-[#1C1917]/10"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-[#1C1917]/5 flex items-center justify-center text-[#1C1917]">
              <FileSpreadsheet className="w-6 h-6 text-[#3F6B4B]" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-[#1C1917]">
                {currentUser ? currentUser.displayName || "Google User" : "เข้าสู่ระบบด้วยบัญชี Google"}
              </h3>
              {currentUser ? (
                <StatusChip status="paid" label="OAuth Verified" />
              ) : (
                <StatusChip status="pending" label="ต้องการสิทธิ์ Sheets" />
              )}
            </div>
            <p className="text-xs text-[#78716C] mt-0.5">
              {currentUser
                ? `บัญชี: ${currentUser.email} (พร้อมส่งออกและจัดการ Google Sheets)`
                : "เชื่อมต่อเพื่อสร้างและซิงก์ข้อมูลลง Google Spreadsheets ใน Google Drive ของคุณโดยอัตโนมัติ"}
            </p>
          </div>
        </div>

        <div>
          {currentUser ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => accessToken && fetchUserSpreadsheets(accessToken)}
                disabled={loadingDriveSheets}
                className="h-10 px-3.5 bg-white hover:bg-[#F6F4F0] border border-[#1C1917]/15 rounded-[10px] text-xs font-medium text-[#1C1917] flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingDriveSheets ? "animate-spin" : ""}`} />
                รีเฟรชไฟล์
              </button>
              <button
                type="button"
                onClick={handleGoogleSignOut}
                className="h-10 px-3.5 bg-white hover:bg-[#A33B2B]/5 border border-[#A33B2B]/20 rounded-[10px] text-xs font-medium text-[#A33B2B] flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                ออกจากระบบ
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={authLoading}
              className="h-11 px-5 bg-white hover:bg-[#F6F4F0] border border-[#1C1917]/20 rounded-[10px] shadow-sm flex items-center gap-3 text-xs font-medium text-[#1C1917] transition-all cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
              <span>{authLoading ? "กำลังเชื่อมต่อ..." : "Sign in with Google"}</span>
            </button>
          )}
        </div>
      </div>

      {/* 4. Google Sheets Direct Live Sync Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Google Sheets Live Sync Console */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-[#FFFCF8] rounded-[20px] border border-[#1C1917]/10 p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#1C1917]/10">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-[#3F6B4B]" />
                <h3 className="text-sm font-semibold text-[#1C1917]">
                  ซิงก์ข้อมูลไปยัง Google Sheets
                </h3>
              </div>
              <StatusChip status={currentUser ? "paid" : "pending"} label={currentUser ? "พร้อมซิงก์" : "รอเข้าสู่ระบบ"} />
            </div>

            {/* Sync Mode Selector */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-[#1C1917]">
                เลือกรูปแบบการส่งออก Google Sheets
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setSyncTargetMode("new")}
                  className={`h-10 px-2 rounded-[10px] text-xs font-medium border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    syncTargetMode === "new"
                      ? "bg-[#1C1917] text-white border-[#1C1917]"
                      : "bg-white border-[#1C1917]/15 text-[#1C1917] hover:bg-[#F6F4F0]"
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  สร้างสเปรดชีตใหม่
                </button>

                <button
                  type="button"
                  onClick={() => setSyncTargetMode("existing")}
                  className={`h-10 px-2 rounded-[10px] text-xs font-medium border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    syncTargetMode === "existing"
                      ? "bg-[#1C1917] text-white border-[#1C1917]"
                      : "bg-white border-[#1C1917]/15 text-[#1C1917] hover:bg-[#F6F4F0]"
                  }`}
                >
                  <FolderSync className="w-3.5 h-3.5" />
                  เลือกจาก Google Drive
                </button>

                <button
                  type="button"
                  onClick={() => setSyncTargetMode("custom")}
                  className={`h-10 px-2 rounded-[10px] text-xs font-medium border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    syncTargetMode === "custom"
                      ? "bg-[#1C1917] text-white border-[#1C1917]"
                      : "bg-white border-[#1C1917]/15 text-[#1C1917] hover:bg-[#F6F4F0]"
                  }`}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  ระบุ URL / ID
                </button>
              </div>
            </div>

            {/* Mode Specific Inputs */}
            {syncTargetMode === "new" && (
              <div>
                <label className="block text-xs font-medium text-[#1C1917] mb-1">
                  ชื่อไฟล์ Google Sheet ใหม่
                </label>
                <input
                  type="text"
                  placeholder={`สมุดบัญชีสัญญาและสินเชื่อ - ${new Date().toISOString().slice(0, 10)}`}
                  value={newSheetTitle}
                  onChange={(e) => setNewSheetTitle(e.target.value)}
                  className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-xs text-[#1C1917] focus:outline-none focus:border-[#1C1917]"
                />
                <p className="text-[11px] text-[#78716C] mt-1">
                  ระบบจะสร้าง Google Sheet พร้อม 5 แท็บ: ภาพรวมพอร์ต, คู่สัญญา, รายการสัญญา, ตารางงวดชำระ, และประวัติธุรกรรม
                </p>
              </div>
            )}

            {syncTargetMode === "existing" && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-[#1C1917]">
                    เลือกไฟล์ Google Sheet จาก Google Drive
                  </label>
                  {loadingDriveSheets && (
                    <span className="text-[11px] text-[#78716C] flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 animate-spin" /> กำลังโหลด...
                    </span>
                  )}
                </div>

                {spreadsheets.length > 0 ? (
                  <select
                    value={selectedSheetId}
                    onChange={(e) => setSelectedSheetId(e.target.value)}
                    className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-xs text-[#1C1917] focus:outline-none focus:border-[#1C1917]"
                  >
                    {spreadsheets.map((sheet) => (
                      <option key={sheet.id} value={sheet.id}>
                        📄 {sheet.name} {sheet.modifiedTime ? `(แก้ไขเมื่อ ${new Date(sheet.modifiedTime).toLocaleDateString("th-TH")})` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="p-3 bg-[#F6F4F0] rounded-[10px] text-xs text-[#78716C]">
                    {currentUser
                      ? "ไม่พบไฟล์ Google Sheet ใน Google Drive หรือกำลังโหลด"
                      : "กรุณาเข้าสู่ระบบ Google ด้านบนก่อนเพื่อเลือกไฟล์"}
                  </div>
                )}
              </div>
            )}

            {syncTargetMode === "custom" && (
              <div>
                <label className="block text-xs font-medium text-[#1C1917] mb-1">
                  Google Sheet URL หรือ Spreadsheet ID *
                </label>
                <input
                  type="text"
                  placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"
                  value={customSheetUrl}
                  onChange={(e) => setCustomSheetUrl(e.target.value)}
                  className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-xs font-mono text-[#1C1917] focus:outline-none focus:border-[#1C1917]"
                />
              </div>
            )}

            {/* Sync Action Button */}
            <div className="pt-2">
              <Button
                variant="primary"
                size="lg"
                fullWidth
                disabled={!currentUser}
                loading={isExporting}
                onClick={handleStartExport}
                icon={<FileSpreadsheet className="w-4 h-4" />}
              >
                {!currentUser
                  ? "กรุณา Sign in with Google เพื่อซิงก์"
                  : syncTargetMode === "new"
                  ? "สร้างและซิงก์ข้อมูลลง Google Sheet ใหม่"
                  : "อัปเดตข้อมูลลง Google Sheet ที่เลือก"}
              </Button>
            </div>

            {/* Success link to open sheet */}
            {lastExportedUrl && (
              <div className="p-4 bg-[#3F6B4B]/10 rounded-[14px] border border-[#3F6B4B]/20 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-medium text-[#3F6B4B]">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>ซิงก์ข้อมูลล่าสุดเรียบร้อยแล้ว</span>
                </div>
                <a
                  href={lastExportedUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="h-8 px-3 bg-[#3F6B4B] text-white rounded-[8px] text-xs font-medium flex items-center gap-1.5 hover:bg-[#34593e] transition-colors shrink-0"
                >
                  <span>เปิดดูใน Google Sheets</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>

          {/* Webhook & Automation Section */}
          <div className="bg-[#FFFCF8] rounded-[20px] border border-[#1C1917]/10 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#1C1917]/10">
              <div className="flex items-center gap-2">
                <Send className="w-5 h-5 text-[#1C1917]" />
                <h3 className="text-sm font-semibold text-[#1C1917]">
                  ซิงก์อัตโนมัติผ่าน Apps Script / Webhook
                </h3>
              </div>
              <StatusChip status="paid" label="Webhook Supported" />
            </div>

            <p className="text-xs text-[#78716C] leading-relaxed">
              สำหรับผู้ที่ใช้ Google Apps Script Web App (doPost), Make.com หรือ Zapier เพื่อสั่งบันทึกข้อมูลอัตโนมัติ
            </p>

            <form onSubmit={handleTriggerWebhookSync} className="space-y-3 pt-1">
              <div>
                <label className="block text-xs font-medium text-[#1C1917] mb-1">
                  Google Apps Script Web App URL *
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://script.google.com/macros/s/.../exec"
                  value={syncUrl}
                  onChange={(e) => setSyncUrl(e.target.value)}
                  className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-xs font-mono text-[#1C1917] focus:outline-none focus:border-[#1C1917]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1C1917] mb-1">
                  ข้อมูลที่ต้องการส่งผ่าน Webhook
                </label>
                <select
                  value={syncTarget}
                  onChange={(e: any) => setSyncTarget(e.target.value)}
                  className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-xs text-[#1C1917]"
                >
                  <option value="all">ข้อมูลทั้งหมด (All Data + Summary)</option>
                  <option value="summary">เฉพาะสรุปยอดพอร์ต (Summary Only)</option>
                  <option value="schedules">ตารางงวดชำระ (Payment Schedules)</option>
                  <option value="parties">รายชื่อคู่สัญญา (Parties List)</option>
                </select>
              </div>

              <Button
                type="submit"
                variant="secondary"
                size="md"
                fullWidth
                loading={webhookSyncLoading}
                icon={<Send className="w-4 h-4" />}
              >
                ส่งข้อมูลผ่าน Webhook
              </Button>
            </form>
          </div>
        </div>

        {/* Right: Data Structure Preview & JSON Backup */}
        <div className="lg:col-span-5 space-y-6">
          {/* Data Structure Summary Card */}
          <div className="bg-[#FFFCF8] rounded-[20px] border border-[#1C1917]/10 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#1C1917]/10">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-[#1C1917]" />
                <h3 className="text-sm font-semibold text-[#1C1917]">
                  โครงสร้างข้อมูลใน Google Sheets
                </h3>
              </div>
            </div>

            <div className="space-y-2.5 text-xs text-[#1C1917]">
              <div className="p-3 bg-[#F6F4F0] rounded-[12px] flex items-center justify-between">
                <div className="flex items-center gap-2 font-medium">
                  <span className="w-2 h-2 rounded-full bg-[#3F6B4B]" />
                  <span>1. ภาพรวมพอร์ต (Summary)</span>
                </div>
                <span className="text-[#78716C] font-mono">14 ตัวชี้วัด</span>
              </div>

              <div className="p-3 bg-[#F6F4F0] rounded-[12px] flex items-center justify-between">
                <div className="flex items-center gap-2 font-medium">
                  <span className="w-2 h-2 rounded-full bg-[#1C1917]" />
                  <span>2. คู่สัญญา (Parties)</span>
                </div>
                <span className="text-[#78716C] font-mono">
                  {exportQuery.data?.parties?.length || 0} รายการ
                </span>
              </div>

              <div className="p-3 bg-[#F6F4F0] rounded-[12px] flex items-center justify-between">
                <div className="flex items-center gap-2 font-medium">
                  <span className="w-2 h-2 rounded-full bg-[#1C1917]" />
                  <span>3. รายการสัญญา (Contracts)</span>
                </div>
                <span className="text-[#78716C] font-mono">
                  {exportQuery.data?.contracts?.length || 0} สัญญา
                </span>
              </div>

              <div className="p-3 bg-[#F6F4F0] rounded-[12px] flex items-center justify-between">
                <div className="flex items-center gap-2 font-medium">
                  <span className="w-2 h-2 rounded-full bg-[#1C1917]" />
                  <span>4. ตารางงวดชำระ (Schedules)</span>
                </div>
                <span className="text-[#78716C] font-mono">
                  {exportQuery.data?.schedules?.length || 0} งวด
                </span>
              </div>

              <div className="p-3 bg-[#F6F4F0] rounded-[12px] flex items-center justify-between">
                <div className="flex items-center gap-2 font-medium">
                  <span className="w-2 h-2 rounded-full bg-[#1C1917]" />
                  <span>5. ประวัติธุรกรรม (Transactions)</span>
                </div>
                <span className="text-[#78716C] font-mono">
                  {exportQuery.data?.transactions?.length || 0} รายการ
                </span>
              </div>
            </div>
          </div>

          {/* Backup File Download */}
          <div className="bg-[#FFFCF8] rounded-[20px] border border-[#1C1917]/10 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#1C1917]/10">
              <div className="flex items-center gap-2">
                <Download className="w-5 h-5 text-[#1C1917]" />
                <h3 className="text-sm font-semibold text-[#1C1917]">
                  สำรองข้อมูล (JSON Backup)
                </h3>
              </div>
            </div>

            <p className="text-xs text-[#78716C] leading-relaxed">
              ดาวน์โหลดสำเนาข้อมูลลูกหนี้ เจ้าหนี้ สัญญา และประวัติธุรกรรมทั้งหมดเก็บไว้ในเครื่องของคุณ
            </p>

            <div className="space-y-3 pt-1">
              <Button
                variant="primary"
                fullWidth
                size="md"
                onClick={handleDownloadBackup}
                icon={<Download className="w-4 h-4" />}
              >
                ดาวน์โหลดไฟล์สำรองข้อมูล (JSON)
              </Button>

              <div className="p-3.5 bg-[#F6F4F0] rounded-[12px] border border-[#1C1917]/5 text-xs text-[#78716C] space-y-1">
                <div className="font-semibold text-[#1C1917] flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#3F6B4B]" />
                  ระบบความปลอดภัยข้อมูล
                </div>
                <p className="text-[11px]">
                  เข้าถึงข้อมูล Google Drive & Sheets ด้วยมาตรฐานความปลอดภัย OAuth 2.0 สิทธิ์เฉพาะที่ได้รับอนุมัติ
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Workspace Data Export */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-[#FFFCF8] rounded-[20px] border border-[#1C1917]/15 p-6 max-w-md w-full shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-[#3F6B4B]/10 flex items-center justify-center shrink-0">
                <FileSpreadsheet className="w-5 h-5 text-[#3F6B4B]" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#1C1917]">
                  ยืนยันการส่งออกข้อมูลไปยัง Google Sheets
                </h3>
                <p className="text-xs text-[#78716C] mt-1">
                  ระบบจะเขียนข้อมูลบัญชี สัญญา ตารางงวด และประวัติธุรกรรม ({exportQuery.data?.contracts?.length || 0} สัญญา, {exportQuery.data?.schedules?.length || 0} งวด) ไปยัง Google Sheets
                </p>
              </div>
            </div>

            <div className="p-3 bg-[#F6F4F0] rounded-[12px] text-xs text-[#1C1917] space-y-1 font-mono">
              <div>• โหมด: {syncTargetMode === "new" ? "สร้างสเปรดชีตใหม่" : "อัปเดตสเปรดชีตเดิม"}</div>
              <div>• บัญชี Google: {currentUser?.email}</div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <Button
                variant="secondary"
                size="md"
                onClick={() => setShowConfirmModal(false)}
              >
                ยกเลิก
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={handleConfirmExport}
                icon={<Check className="w-4 h-4" />}
              >
                ยืนยันการส่งออก
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
