import React, { useState, useEffect } from "react";
import {
  FileSpreadsheet,
  Download,
  RefreshCw,
  Check,
  ExternalLink,
  ShieldCheck,
  Send,
  Plus,
  LogOut,
  FolderSync,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import { User } from "firebase/auth";
import { trpc } from "@/lib/trpc";
import {
  initAuth,
  googleSignIn,
  logout,
  listGoogleSpreadsheets,
  getSpreadsheetDetails,
  createSpreadsheetTab,
  exportDataToSpecificTab,
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

  // Sheet Tabs (Worksheets)
  const [availableTabs, setAvailableTabs] = useState<{ title: string; sheetId: number; rowCount?: number }[]>([]);
  const [loadingTabs, setLoadingTabs] = useState(false);
  const [activeSpreadsheetTitle, setActiveSpreadsheetTitle] = useState<string>("");

  // Sync mode & operations
  const [syncTargetMode, setSyncTargetMode] = useState<"new" | "existing" | "custom">("existing");
  const [exportStructureMode, setExportStructureMode] = useState<"standard_5tabs" | "specific_tab">("specific_tab");
  const [targetTabAction, setTargetTabAction] = useState<"existing_tab" | "new_tab">("existing_tab");
  const [selectedExistingTab, setSelectedExistingTab] = useState<string>("");
  const [newTabNameInput, setNewTabNameInput] = useState<string>("");
  const [specificDataType, setSpecificDataType] = useState<
    "all_combined" | "contracts_schedules" | "goods_installments" | "installments_only" | "transactions" | "summary"
  >("all_combined");

  // Create new tab modal
  const [showCreateTabModal, setShowCreateTabModal] = useState(false);
  const [newTabModalInput, setNewTabModalInput] = useState("");
  const [isCreatingTabModal, setIsCreatingTabModal] = useState(false);

  const [isExporting, setIsExporting] = useState(false);
  const [lastExportedUrl, setLastExportedUrl] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Webhook sync state
  const [syncUrl, setSyncUrl] = useState("");
  const [syncTarget, setSyncTarget] = useState<"all" | "summary" | "schedules" | "parties">("all");
  const [webhookSyncLoading, setWebhookSyncLoading] = useState(false);

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
        setAvailableTabs([]);
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
      setAvailableTabs([]);
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

  const effectiveSheetId =
    syncTargetMode === "existing"
      ? selectedSheetId
      : syncTargetMode === "custom"
      ? parseSpreadsheetId(customSheetUrl)
      : "";

  // Fetch Tabs for selected spreadsheet
  const fetchTabs = async (targetId?: string) => {
    const idToUse = targetId || effectiveSheetId;
    if (!accessToken || !idToUse || syncTargetMode === "new") {
      setAvailableTabs([]);
      return;
    }

    setLoadingTabs(true);
    try {
      const details = await getSpreadsheetDetails(accessToken, idToUse);
      setActiveSpreadsheetTitle(details.title);
      setAvailableTabs(details.sheets);
      if (details.sheets.length > 0) {
        if (!selectedExistingTab || !details.sheets.some((s) => s.title === selectedExistingTab)) {
          setSelectedExistingTab(details.sheets[0].title);
        }
      }
    } catch (err: any) {
      console.warn("Could not fetch sheet tabs:", err.message);
    } finally {
      setLoadingTabs(false);
    }
  };

  useEffect(() => {
    if (accessToken && effectiveSheetId && syncTargetMode !== "new") {
      fetchTabs(effectiveSheetId);
    }
  }, [accessToken, effectiveSheetId, syncTargetMode]);

  // Create New Tab Quick Action
  const handleCreateNewTabDirectly = async (tabName?: string) => {
    const titleToCreate = (tabName || newTabModalInput).trim();
    if (!titleToCreate) {
      toast.error("กรุณาระบุชื่อแผ่นงานใหม่");
      return;
    }
    if (!accessToken || !effectiveSheetId) {
      toast.error("กรุณาเข้าสู่ระบบ Google และเลือกไฟล์ชีตก่อน");
      return;
    }

    setIsCreatingTabModal(true);
    try {
      const initialHeaders = [
        "วันที่",
        "ประเภท",
        "ชื่อสัญญา/รายการ",
        "คู่สัญญา",
        "เงินต้น/ราคา",
        "ได้รับจริง",
        "ดอกเบี้ย",
        "ค่างวด",
        "ชำระแล้ว",
        "คงเหลือ",
        "สถานะ",
        "หมายเหตุ",
      ];
      const created = await createSpreadsheetTab(
        accessToken,
        effectiveSheetId,
        titleToCreate,
        initialHeaders
      );

      toast.success(`สร้างแผ่นงาน '${created.title}' ใน Google Sheets สำเร็จ!`);
      setShowCreateTabModal(false);
      setNewTabModalInput("");
      await fetchTabs(effectiveSheetId);
      setSelectedExistingTab(created.title);
      setTargetTabAction("existing_tab");
    } catch (err: any) {
      toast.error(`สร้างแผ่นงานไม่สำเร็จ: ${err.message}`);
    } finally {
      setIsCreatingTabModal(false);
    }
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
    if (
      exportStructureMode === "specific_tab" &&
      targetTabAction === "new_tab" &&
      !newTabNameInput.trim()
    ) {
      toast.error("กรุณาระบุชื่อแผ่นงานใหม่ที่ต้องการบันทึกลง");
      return;
    }
    setShowConfirmModal(true);
  };

  // Helper to compile rows for specific tab export
  const buildSpecificTabRows = (): (string | number)[][] => {
    const contracts = exportQuery.data?.contracts || [];
    const parties = exportQuery.data?.parties || [];
    const schedules = exportQuery.data?.schedules || [];
    const transactions = exportQuery.data?.transactions || [];
    const stats = statsQuery.data;

    if (specificDataType === "all_combined") {
      const headerRow = [
        "วันที่ทำสัญญา",
        "รหัสสัญญา",
        "ชื่อสัญญา/รายการ",
        "ชื่อคู่สัญญา",
        "บทบาท",
        "เบอร์โทรศัพท์",
        "เงินต้น (บาท)",
        "อัตราดอกเบี้ย (%)",
        "จำนวนงวด",
        "สถานะสัญญา",
      ];

      const dataRows = contracts.map((c) => [
        c.startDate ? c.startDate.slice(0, 10) : "-",
        c.contractId,
        c.title,
        c.customerName,
        c.customerRole === "debtor" ? "ลูกหนี้ (ให้ยืม/ผ่อน)" : "เจ้าหนี้ (กู้ยืมมา)",
        c.customerPhone || "-",
        Number(c.principal || 0),
        Number(c.interestRate || 0),
        Number(c.installmentCount || 1),
        c.status === "active" ? "กำลังผ่อนชำระ" : c.status === "completed" ? "ปิดยอดแล้ว" : c.status,
      ]);

      return [headerRow, ...dataRows];
    }

    if (specificDataType === "goods_installments") {
      const headerRow = [
        "วันที่สัญญา",
        "รหัสสัญญา",
        "ชื่อสินค้า / รายการผ่อน",
        "ผู้ซื้อ/ผู้ผ่อน",
        "เบอร์โทร",
        "เงินต้น/ราคาสินค้า (บาท)",
        "ดอกเบี้ย (%)",
        "จำนวนงวด",
        "สถานะ",
      ];

      const dataRows = contracts.map((c) => [
        c.startDate ? c.startDate.slice(0, 10) : "-",
        c.contractId,
        c.title,
        c.customerName,
        c.customerPhone || "-",
        Number(c.principal || 0),
        Number(c.interestRate || 0),
        Number(c.installmentCount || 1),
        c.status === "active" ? "กำลังผ่อนชำระ" : c.status === "completed" ? "ปิดยอดแล้ว" : c.status,
      ]);

      return [headerRow, ...dataRows];
    }

    if (specificDataType === "contracts_schedules") {
      const headerRow = [
        "รหัสสัญญา",
        "ชื่อสัญญา",
        "คู่สัญญา",
        "บทบาท",
        "เงินต้น (บาท)",
        "ดอกเบี้ย (%)",
        "จำนวนงวด",
        "วันที่เริ่ม",
        "สถานะ",
      ];

      const dataRows = contracts.map((c) => [
        c.contractId,
        c.title,
        c.customerName,
        c.customerRole === "debtor" ? "ลูกหนี้" : "เจ้าหนี้",
        Number(c.principal || 0),
        Number(c.interestRate || 0),
        Number(c.installmentCount || 1),
        c.startDate ? c.startDate.slice(0, 10) : "-",
        c.status === "active" ? "ใช้งานอยู่" : c.status === "completed" ? "ปิดยอดแล้ว" : c.status,
      ]);

      return [headerRow, ...dataRows];
    }

    if (specificDataType === "installments_only") {
      const headerRow = [
        "รหัสงวด",
        "ชื่อสัญญา",
        "คู่สัญญา",
        "เบอร์โทร",
        "งวดที่",
        "วันครบกำหนด",
        "ยอดที่ต้องชำระ (บาท)",
        "ยอดที่ชำระแล้ว (บาท)",
        "สถานะงวด",
        "วันที่ชำระจริง",
        "หมายเหตุ",
      ];

      const dataRows = schedules.map((s) => [
        s.scheduleId,
        s.contractTitle,
        s.partyName,
        s.partyPhone || "-",
        s.installmentNo,
        s.dueDate ? s.dueDate.slice(0, 10) : "-",
        Number(s.amount || 0),
        Number(s.paidAmount || 0),
        s.status === "paid" ? "ชำระแล้ว" : s.status === "pending" ? "รอชำระ" : "ยกเว้น",
        s.paidAt ? new Date(s.paidAt).toLocaleDateString("th-TH") : "-",
        s.note || "",
      ]);

      return [headerRow, ...dataRows];
    }

    if (specificDataType === "transactions") {
      const headerRow = [
        "วันที่ทำรายการ",
        "รหัสธุรกรรม",
        "ประเภทรายการ",
        "จำนวนเงิน (บาท)",
        "คู่สัญญา",
        "บทบาท",
        "ชื่อสัญญา",
        "แหล่งที่มา/ช่องทาง",
        "หมายเหตุ",
      ];

      const dataRows = transactions.map((t) => [
        t.occurredAt ? new Date(t.occurredAt).toLocaleString("th-TH") : "-",
        t.transactionId,
        t.type === "payment" ? "ชำระค่างวด" : t.type === "disbursement" ? "ปล่อยกู้/ส่งมอบเงิน" : "ปรับปรุงยอด",
        Number(t.amount || 0),
        t.partyName,
        t.partyRole === "debtor" ? "ลูกหนี้" : "เจ้าหนี้",
        t.contractTitle || "-",
        t.source || "ระบบ",
        t.note || "",
      ]);

      return [headerRow, ...dataRows];
    }

    // Default: Summary metrics
    const headerRow = ["หัวข้อตัวชี้วัด", "มูลค่า", "หน่วย", "คำอธิบาย"];
    const dataRows = [
      ["ยอดเงินต้นรวมทั้งหมด (Total Principal)", Number(stats?.totalPrincipal || 0), "บาท", "เงินต้นสัญญาทั้งหมดในพอร์ต"],
      ["ยอดเรียกเก็บตามงวดทั้งหมด (Total Scheduled)", Number(stats?.totalScheduled || 0), "บาท", "ยอดรวมทุกงวดตามกำหนด"],
      ["ยอดรับชำระแล้วสะสม (Total Collected)", Number(stats?.totalCollected || 0), "บาท", "ยอดเงินที่ได้รับชำระสะสม"],
      ["ยอดหนี้คงค้างสุทธิ (Total Outstanding)", Number(stats?.totalOutstanding || 0), "บาท", "ยอดหนี้ที่ยังรอรับชำระ"],
      ["จำนวนสัญญาทั้งหมด", contracts.length, "สัญญา", "สัญญาทั้งหมดในพอร์ต"],
      ["สัญญากำลังผ่อนชำระ (Active)", contracts.filter((c) => c.status === "active").length, "สัญญา", "สัญญาที่ยังมีการผ่อนชำระต่อเนื่อง"],
      ["งวดที่เกินกำหนด (Overdue Count)", Number(stats?.overdue?.count || 0), "งวด", "งวดชำระที่เลยกำหนดเวลา"],
      ["ยอดเงินเกินกำหนด (Overdue Amount)", Number(stats?.overdue?.amount || 0), "บาท", "ยอดเงินค้างชำระเกินกำหนด"],
      ["วันที่ส่งออกข้อมูล", new Date().toLocaleString("th-TH"), "วัน-เวลา", "เวลาที่ทำการซิงก์ข้อมูล"],
    ];

    return [headerRow, ...dataRows];
  };

  const handleConfirmExport = async () => {
    setShowConfirmModal(false);
    if (!accessToken) {
      toast.error("เซสชัน Google หมดอายุ กรุณาเข้าสู่ระบบใหม่");
      return;
    }

    setIsExporting(true);
    try {
      let targetId = "";
      let targetUrl = "";

      if (syncTargetMode === "new") {
        const title =
          newSheetTitle.trim() ||
          `สมุดบัญชีสัญญาและสินเชื่อ - ${new Date().toISOString().slice(0, 10)}`;
        const created = await createLedgerSpreadsheet(accessToken, title);
        targetId = created.spreadsheetId;
        targetUrl = created.spreadsheetUrl;

        // If standard 5 tabs
        if (exportStructureMode === "standard_5tabs") {
          const ledgerData = {
            summary: statsQuery.data,
            parties: exportQuery.data?.parties || [],
            contracts: exportQuery.data?.contracts || [],
            schedules: exportQuery.data?.schedules || [],
            transactions: exportQuery.data?.transactions || [],
          };
          await exportLedgerToGoogleSheet(accessToken, targetId, ledgerData);
        } else {
          // Specific tab to new sheet
          const tabTitle = newTabNameInput.trim() || "ข้อมูลสัญญาและสินเชื่อ";
          const allRows = buildSpecificTabRows();
          await exportDataToSpecificTab(accessToken, targetId, tabTitle, allRows);
        }
      } else {
        // Existing or Custom Sheet
        targetId =
          syncTargetMode === "existing"
            ? selectedSheetId
            : parseSpreadsheetId(customSheetUrl);
        targetUrl = `https://docs.google.com/spreadsheets/d/${targetId}/edit`;

        if (exportStructureMode === "standard_5tabs") {
          const ledgerData = {
            summary: statsQuery.data,
            parties: exportQuery.data?.parties || [],
            contracts: exportQuery.data?.contracts || [],
            schedules: exportQuery.data?.schedules || [],
            transactions: exportQuery.data?.transactions || [],
          };
          await exportLedgerToGoogleSheet(accessToken, targetId, ledgerData);
        } else {
          // Specific tab mode
          const targetTabName =
            targetTabAction === "new_tab"
              ? newTabNameInput.trim() || `บันทึก-${new Date().toISOString().slice(0, 10)}`
              : selectedExistingTab || "Sheet1";

          const allRows = buildSpecificTabRows();
          await exportDataToSpecificTab(accessToken, targetId, targetTabName, allRows);
          await fetchTabs(targetId);
        }
      }

      setLastExportedUrl(targetUrl);
      toast.success("บันทึกและซิงก์ข้อมูลไปยัง Google Sheets สำเร็จเรียบร้อยแล้ว!");
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
        description="เชื่อมต่อ เลือกแผ่นงาน หรือสร้างหน้าใหม่ เพื่อบันทึกข้อมูลสินเชื่อ สัญญาผ่อนสินค้า และตารางงวดชำระลง Google Sheets แบบเรียลไทม์"
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

            {/* Target File Mode Selector */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-[#1C1917]">
                1. เลือกไฟล์ Google Spreadsheet
              </label>
              <div className="grid grid-cols-3 gap-2">
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
                  onClick={() => setSyncTargetMode("new")}
                  className={`h-10 px-2 rounded-[10px] text-xs font-medium border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    syncTargetMode === "new"
                      ? "bg-[#1C1917] text-white border-[#1C1917]"
                      : "bg-white border-[#1C1917]/15 text-[#1C1917] hover:bg-[#F6F4F0]"
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  สร้างไฟล์ใหม่
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

            {/* 2. Export Structure Mode: 5 Standard Tabs vs Specific Tab */}
            <div className="space-y-3 pt-2 border-t border-[#1C1917]/10">
              <label className="block text-xs font-medium text-[#1C1917]">
                2. เลือกรูปแบบการจัดเก็บข้อมูล (Export Structure)
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setExportStructureMode("specific_tab")}
                  className={`p-3 rounded-[12px] border text-left transition-all cursor-pointer ${
                    exportStructureMode === "specific_tab"
                      ? "bg-[#1C1917] text-white border-[#1C1917] shadow-xs"
                      : "bg-white border-[#1C1917]/15 text-[#1C1917] hover:bg-[#F6F4F0]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs flex items-center gap-1.5">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-[#3F6B4B]" />
                      บันทึกลงแผ่นงานเฉพาะ
                    </span>
                    {exportStructureMode === "specific_tab" && <Check className="w-3.5 h-3.5 text-[#3F6B4B]" />}
                  </div>
                  <p className={`text-[11px] leading-relaxed ${exportStructureMode === "specific_tab" ? "text-white/80" : "text-[#78716C]"}`}>
                    เลือกแผ่นงานที่มีอยู่ หรือกดสร้างหน้าใหม่เพื่อเก็บข้อมูลเฉพาะหมวด
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setExportStructureMode("standard_5tabs")}
                  className={`p-3 rounded-[12px] border text-left transition-all cursor-pointer ${
                    exportStructureMode === "standard_5tabs"
                      ? "bg-[#1C1917] text-white border-[#1C1917] shadow-xs"
                      : "bg-white border-[#1C1917]/15 text-[#1C1917] hover:bg-[#F6F4F0]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-[#3F6B4B]" />
                      ส่งออกแยก 5 แท็บมาตรฐาน
                    </span>
                    {exportStructureMode === "standard_5tabs" && <Check className="w-3.5 h-3.5 text-[#3F6B4B]" />}
                  </div>
                  <p className={`text-[11px] leading-relaxed ${exportStructureMode === "standard_5tabs" ? "text-white/80" : "text-[#78716C]"}`}>
                    สร้าง 5 แท็บ: ภาพรวม, คู่สัญญา, สัญญา, ตารางงวด, และธุรกรรม
                  </p>
                </button>
              </div>
            </div>

            {/* Specific Tab Settings */}
            {exportStructureMode === "specific_tab" && (
              <div className="p-4 bg-[#F6F4F0] rounded-[16px] border border-[#1C1917]/10 space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1C1917] flex items-center gap-1.5">
                    <FileSpreadsheet className="w-4 h-4 text-[#3F6B4B]" />
                    กำหนดแผ่นงานและชุดข้อมูล (Worksheet Target)
                  </span>

                  {effectiveSheetId && (
                    <button
                      type="button"
                      onClick={() => setShowCreateTabModal(true)}
                      className="text-xs font-semibold text-[#3F6B4B] hover:text-[#2E5037] flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ สร้างหน้าใหม่ในชีตนี้</span>
                    </button>
                  )}
                </div>

                {/* Target Tab Action (Existing vs New) */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTargetTabAction("existing_tab")}
                    className={`h-9 px-2 rounded-[8px] text-xs font-medium border transition-all cursor-pointer ${
                      targetTabAction === "existing_tab"
                        ? "bg-white border-[#1C1917] text-[#1C1917] font-bold shadow-xs"
                        : "bg-transparent border-[#1C1917]/15 text-[#78716C] hover:bg-white/60"
                    }`}
                  >
                    เลือกแผ่นงานที่มีอยู่
                  </button>

                  <button
                    type="button"
                    onClick={() => setTargetTabAction("new_tab")}
                    className={`h-9 px-2 rounded-[8px] text-xs font-medium border transition-all cursor-pointer ${
                      targetTabAction === "new_tab"
                        ? "bg-white border-[#1C1917] text-[#1C1917] font-bold shadow-xs"
                        : "bg-transparent border-[#1C1917]/15 text-[#78716C] hover:bg-white/60"
                    }`}
                  >
                    + สร้างหน้าใหม่ (New Tab)
                  </button>
                </div>

                {targetTabAction === "existing_tab" ? (
                  <div>
                    <label className="block text-[11px] font-medium text-[#78716C] mb-1">
                      เลือกแผ่นงานเป้าหมาย (Worksheet Tab)
                    </label>
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedExistingTab}
                        onChange={(e) => setSelectedExistingTab(e.target.value)}
                        className="flex-1 h-9 px-3 bg-white border border-[#1C1917]/15 rounded-[8px] text-xs font-medium text-[#1C1917]"
                      >
                        {availableTabs.length > 0 ? (
                          availableTabs.map((tab) => (
                            <option key={tab.sheetId} value={tab.title}>
                              📑 {tab.title} {tab.rowCount ? `(~${tab.rowCount} แถว)` : ""}
                            </option>
                          ))
                        ) : (
                          <option value="Sheet1">📑 Sheet1 (ค่าเริ่มต้น)</option>
                        )}
                      </select>

                      <button
                        type="button"
                        onClick={() => fetchTabs()}
                        disabled={loadingTabs}
                        title="รีเฟรชรายชื่อแผ่นงาน"
                        className="h-9 px-2.5 bg-white hover:bg-[#EBE7DF] border border-[#1C1917]/15 rounded-[8px] text-xs text-[#1C1917] cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${loadingTabs ? "animate-spin" : ""}`} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-medium text-[#78716C]">
                      ชื่อหน้าใหม่ที่ต้องการสร้าง (New Tab Name) *
                    </label>
                    <input
                      type="text"
                      placeholder={`สัญญาและสินเชื่อ_${new Date().toLocaleDateString("th-TH", { month: "short", year: "numeric" }).replace(" ", "")}`}
                      value={newTabNameInput}
                      onChange={(e) => setNewTabNameInput(e.target.value)}
                      className="w-full h-9 px-3 bg-white border border-[#1C1917]/20 rounded-[8px] text-xs font-medium text-[#1C1917] focus:outline-none focus:border-[#1C1917]"
                    />
                    <div className="flex flex-wrap gap-1 pt-1">
                      {[
                        `บันทึกสัญญา_${new Date().getFullYear() + 543}`,
                        "สัญญาผ่อนสินค้า_อุปกรณ์",
                        "ตารางงวดชำระ",
                        "ประวัติรับชำระ",
                      ].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setNewTabNameInput(preset)}
                          className="px-2 py-0.5 rounded-[4px] bg-white border border-[#1C1917]/10 text-[10px] text-[#1C1917] hover:bg-[#EBE7DF] cursor-pointer"
                        >
                          + {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Data Scope */}
                <div>
                  <label className="block text-[11px] font-medium text-[#78716C] mb-1">
                    ชุดข้อมูลที่จะบันทึกลงแผ่นงานนี้:
                  </label>
                  <select
                    value={specificDataType}
                    onChange={(e) => setSpecificDataType(e.target.value as any)}
                    className="w-full h-9 px-3 bg-white border border-[#1C1917]/15 rounded-[8px] text-xs font-medium text-[#1C1917]"
                  >
                    <option value="all_combined">
                      📊 รวมข้อมูลสัญญา เงินต้น ได้รับจริง ดอกเบี้ย และยอดคงเหลือ (All-in-One)
                    </option>
                    <option value="goods_installments">
                      🛒 ข้อมูลผ่อนสินค้า & อุปกรณ์ (ราคาสินค้า, ค่าทำสัญญา, งวด 7/15/30 วัน, ดอกเบี้ย)
                    </option>
                    <option value="contracts_schedules">
                      📄 ข้อมูลสัญญาและผู้กู้/ผู้ให้กู้ (Contracts Only)
                    </option>
                    <option value="installments_only">
                      📅 ตารางงวดชำระและวันครบกำหนด (Installment Schedules)
                    </option>
                    <option value="transactions">
                      💳 ประวัติธุรกรรมและรับเงินชำระ (Transactions Log)
                    </option>
                    <option value="summary">
                      📈 สรุปภาพรวมพอร์ตและตัวชี้วัด (Portfolio Summary)
                    </option>
                  </select>
                </div>
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
                  : exportStructureMode === "specific_tab"
                  ? targetTabAction === "new_tab"
                    ? `สร้างแผ่นงาน '${newTabNameInput.trim() || "ใหม่"}' & บันทึกข้อมูล`
                    : `บันทึกลงแผ่นงาน '${selectedExistingTab || "Sheet1"}'`
                  : syncTargetMode === "new"
                  ? "สร้าง Google Sheet ใหม่ 5 แท็บ"
                  : "อัปเดต 5 แท็บลง Google Sheet ที่เลือก"}
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
                  ชุดข้อมูลที่ต้องการส่งออก
                </label>
                <select
                  value={syncTarget}
                  onChange={(e) => setSyncTarget(e.target.value as any)}
                  className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-xs text-[#1C1917]"
                >
                  <option value="all">ข้อมูลทั้งหมด (All Data)</option>
                  <option value="summary">เฉพาะสรุปภาพรวม (Summary)</option>
                  <option value="schedules">ตารางงวดชำระ (Schedules)</option>
                  <option value="parties">รายชื่อคู่สัญญา (Parties)</option>
                </select>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  variant="secondary"
                  size="md"
                  fullWidth
                  loading={webhookSyncLoading}
                  icon={<Send className="w-4 h-4" />}
                >
                  ส่งข้อมูลเข้า Webhook ทันที
                </Button>
              </div>
            </form>
          </div>
        </div>

        {/* Right: Data Preview & Backup Actions */}
        <div className="lg:col-span-5 space-y-6">
          {/* Data Summary Box */}
          <div className="bg-[#FFFCF8] rounded-[20px] border border-[#1C1917]/10 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#1C1917]/10">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-[#1C1917]" />
                <h3 className="text-sm font-semibold text-[#1C1917]">
                  ข้อมูลพร้อมส่งออก
                </h3>
              </div>
              <span className="text-xs font-mono text-[#3F6B4B] font-bold">
                {exportQuery.data?.contracts?.length || 0} สัญญา
              </span>
            </div>

            <div className="space-y-2.5 text-xs text-[#1C1917]">
              <div className="p-3 bg-[#F6F4F0] rounded-[12px] flex items-center justify-between">
                <div className="flex items-center gap-2 font-medium">
                  <span className="w-2 h-2 rounded-full bg-[#1C1917]" />
                  <span>1. สรุปภาพรวมพอร์ต (Summary)</span>
                </div>
                <span className="text-[#78716C] font-mono">
                  {statsQuery.data?.totalContracts || 0} รายการ
                </span>
              </div>

              <div className="p-3 bg-[#F6F4F0] rounded-[12px] flex items-center justify-between">
                <div className="flex items-center gap-2 font-medium">
                  <span className="w-2 h-2 rounded-full bg-[#1C1917]" />
                  <span>2. คู่สัญญา (Parties)</span>
                </div>
                <span className="text-[#78716C] font-mono">
                  {exportQuery.data?.parties?.length || 0} ราย
                </span>
              </div>

              <div className="p-3 bg-[#F6F4F0] rounded-[12px] flex items-center justify-between">
                <div className="flex items-center gap-2 font-medium">
                  <span className="w-2 h-2 rounded-full bg-[#1C1917]" />
                  <span>3. สัญญาสินเชื่อ & ผ่อนสินค้า</span>
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
                  {exportStructureMode === "specific_tab"
                    ? `ระบบจะบันทึกข้อมูลลงแผ่นงาน '${targetTabAction === "new_tab" ? newTabNameInput.trim() : selectedExistingTab}' ใน Google Sheets`
                    : `ระบบจะเขียนข้อมูล 5 แท็บมาตรฐาน (${exportQuery.data?.contracts?.length || 0} สัญญา, {exportQuery.data?.schedules?.length || 0} งวด) ไปยัง Google Sheets`}
                </p>
              </div>
            </div>

            <div className="p-3 bg-[#F6F4F0] rounded-[12px] text-xs text-[#1C1917] space-y-1 font-mono">
              <div>• สเปรดชีต: {activeSpreadsheetTitle || (syncTargetMode === "new" ? newSheetTitle || "ไฟล์ใหม่" : effectiveSheetId)}</div>
              <div>
                • โหมด:{" "}
                {exportStructureMode === "specific_tab"
                  ? `แผ่นงานเฉพาะ (${targetTabAction === "new_tab" ? "สร้างหน้าใหม่" : "แผ่นงานเดิม"})`
                  : "ส่งออก 5 แท็บมาตรฐาน"}
              </div>
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

      {/* Direct Create Worksheet Tab Modal */}
      {showCreateTabModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-[#FFFCF8] rounded-[20px] border border-[#1C1917]/15 p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#3F6B4B]/10 text-[#3F6B4B] flex items-center justify-center">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#1C1917]">
                    สร้างแผ่นงานใหม่ (Create Worksheet Tab)
                  </h3>
                  <p className="text-xs text-[#78716C] mt-0.5">
                    เพิ่มหน้าใหม่ใน: {activeSpreadsheetTitle || effectiveSheetId}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowCreateTabModal(false)}
                className="text-xs text-[#78716C] hover:text-[#1C1917] p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#1C1917] mb-1.5">
                  ชื่อแผ่นงานใหม่ (Tab Name) *
                </label>
                <input
                  type="text"
                  autoFocus
                  placeholder="เช่น สัญญาและหนี้สิน_2569, ผ่อนสินค้า_สิงหาคม"
                  value={newTabModalInput}
                  onChange={(e) => setNewTabModalInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleCreateNewTabDirectly();
                    }
                  }}
                  className="w-full h-10 px-3.5 bg-white border border-[#1C1917]/20 rounded-[10px] text-xs font-medium text-[#1C1917] focus:outline-none focus:border-[#1C1917]"
                />
              </div>

              <div>
                <span className="text-[11px] text-[#78716C] mb-1.5 block">แนะนำชื่อแผ่นงาน:</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    `สัญญาและสินเชื่อ_${new Date().getFullYear() + 543}`,
                    "ผ่อนสินค้า_อุปกรณ์",
                    "ประวัติรับชำระรายเดือน",
                    "ตารางงวดชำระ",
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setNewTabModalInput(preset)}
                      className="px-2.5 py-1 rounded-[6px] bg-[#F6F4F0] hover:bg-[#EBE7DF] text-[11px] text-[#1C1917] font-medium transition-colors cursor-pointer border border-[#1C1917]/10"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <Button
                variant="secondary"
                size="md"
                onClick={() => setShowCreateTabModal(false)}
              >
                ยกเลิก
              </Button>
              <Button
                variant="primary"
                size="md"
                loading={isCreatingTabModal}
                onClick={() => handleCreateNewTabDirectly()}
                icon={<Plus className="w-4 h-4" />}
              >
                สร้างแผ่นงานทันที
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
