import React, { useState, useEffect, useMemo } from "react";
import {
  Bot,
  FileSpreadsheet,
  RefreshCw,
  Search,
  Filter,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
  Calendar,
  ExternalLink,
  Download,
  Check,
  Sparkles,
  AlertCircle,
  Copy,
  ChevronLeft,
  ChevronRight,
  Database,
  ArrowRight,
  LogIn,
  SlidersHorizontal,
  Send,
  Layers,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { User } from "firebase/auth";
import { trpc } from "@/lib/trpc";
import {
  initAuth,
  googleSignIn,
  listGoogleSpreadsheets,
  getSpreadsheetDetails,
  readSpreadsheetValues,
  appendSpreadsheetRow,
  parseDialogflowSheetRows,
  DialogflowSheetRow,
  GoogleDriveFile,
} from "@/lib/googleAuth";
import {
  PageHeader,
  StatCard,
  Button,
  StatusChip,
} from "./design-system";

export default function DialogflowSheetViewer() {
  // Google Auth State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Spreadsheet Selection State
  const [spreadsheets, setSpreadsheets] = useState<GoogleDriveFile[]>([]);
  const [loadingDrive, setLoadingDrive] = useState(false);
  const [selectedSheetId, setSelectedSheetId] = useState<string>(() => {
    return localStorage.getItem("df_sheet_id") || "";
  });
  const [customSheetUrl, setCustomSheetUrl] = useState<string>("");
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [sheetTabs, setSheetTabs] = useState<{ title: string; sheetId: number; rowCount?: number }[]>([]);
  const [selectedTabName, setSelectedTabName] = useState<string>(() => {
    return localStorage.getItem("df_sheet_tab") || "";
  });
  const [spreadsheetTitle, setSpreadsheetTitle] = useState<string>("");

  // Data State
  const [loadingRows, setLoadingRows] = useState(false);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [records, setRecords] = useState<DialogflowSheetRow[]>([]);
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  // Filtering & Pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "income" | "expense">("all");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "7days" | "month">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Quick Entry Form
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSubmittingEntry, setIsSubmittingEntry] = useState(false);
  const [newEntry, setNewEntry] = useState({
    date: new Date().toLocaleDateString("en-GB"), // DD/MM/YYYY e.g. 29/8/2026
    itemType: "expense" as "income" | "expense",
    list: "",
    amount: "",
    note: "",
  });

  // Dialogflow webhook code modal
  const [showWebhookGuide, setShowWebhookGuide] = useState(false);
  const [showServiceTester, setShowServiceTester] = useState(false);

  // Cloud Run Service state
  const [cloudRunUrl, setCloudRunUrl] = useState<string>(() => {
    return (
      localStorage.getItem("df_cloudrun_url") ||
      "https://income-expense-docker-274212739997.asia-southeast3.run.app/"
    );
  });
  const [cloudRunPath, setCloudRunPath] = useState<string>("/");
  const [cloudRunMethod, setCloudRunMethod] = useState<"GET" | "POST">("GET");
  const [cloudRunAuthToken, setCloudRunAuthToken] = useState<string>("");
  const [testPayloadText, setTestPayloadText] = useState<string>(
    JSON.stringify(
      {
        date: new Date().toLocaleDateString("en-GB"),
        type: "expense",
        list: "ทดสอบผ่านระบบ",
        amount: 100,
        note: "ทดสอบการเชื่อมต่อ",
      },
      null,
      2
    )
  );
  const [serviceTestResult, setServiceTestResult] = useState<any>(null);

  const testServiceMutation = trpc.ledger.callDialogflowService.useMutation();

  const handleTestService = async () => {
    if (!cloudRunUrl.trim()) {
      toast.error("กรุณาระบุ URL ของ Cloud Run Service");
      return;
    }
    localStorage.setItem("df_cloudrun_url", cloudRunUrl.trim());
    try {
      let parsedPayload: any = undefined;
      if (cloudRunMethod === "POST" && testPayloadText.trim()) {
        try {
          parsedPayload = JSON.parse(testPayloadText);
        } catch {
          toast.error("JSON Payload รูปแบบไม่ถูกต้อง");
          return;
        }
      }

      const res = await testServiceMutation.mutateAsync({
        endpointUrl: cloudRunUrl.trim(),
        method: cloudRunMethod,
        path: cloudRunPath.trim(),
        authToken: cloudRunAuthToken.trim() || undefined,
        payload: parsedPayload,
      });

      setServiceTestResult(res);
      if (res.success) {
        toast.success(`เชื่อมต่อ Cloud Run สำเร็จ (${res.statusCode} ${res.statusText})`);
      } else if (res.statusCode === 403) {
        toast.warning("Cloud Run ส่งกลับ 403 (ต้องการสิทธิ์ Invoker / Unauthenticated)");
      } else {
        toast.error(`เชื่อมต่อไม่สำเร็จ: Status ${res.statusCode} ${res.statusText}`);
      }
    } catch (err: any) {
      toast.error(`เกิดข้อผิดพลาดในการทดสอบ: ${err.message}`);
    }
  };

  // Import to ledger mutation
  const createTxMutation = trpc.ledger.createTransaction.useMutation();
  const partiesQuery = trpc.ledger.listParties.useQuery();
  const [importingRowIndex, setImportingRowIndex] = useState<number | null>(null);

  // Listen to Google Auth
  useEffect(() => {
    const unsubscribe = initAuth(
      async (user, token) => {
        setCurrentUser(user);
        setAccessToken(token);
        fetchSpreadsheets(token);
      },
      () => {
        setCurrentUser(null);
        setAccessToken(null);
      }
    );
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  // Fetch Spreadsheets List
  const fetchSpreadsheets = async (token: string) => {
    setLoadingDrive(true);
    try {
      const files = await listGoogleSpreadsheets(token);
      setSpreadsheets(files);
      if (files.length > 0 && !selectedSheetId) {
        setSelectedSheetId(files[0].id);
      }
    } catch (err: any) {
      console.warn("Could not list Google Drive files:", err.message);
    } finally {
      setLoadingDrive(false);
    }
  };

  // Google Sign-In Handler
  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    try {
      const res = await googleSignIn();
      if (res) {
        setCurrentUser(res.user);
        setAccessToken(res.accessToken);
        toast.success(`เข้าสู่ระบบ Google สำเร็จ (${res.user.displayName || res.user.email})`);
        fetchSpreadsheets(res.accessToken);
      }
    } catch (err: any) {
      toast.error(`เข้าสู่ระบบ Google ไม่สำเร็จ: ${err.message}`);
    } finally {
      setAuthLoading(false);
    }
  };

  // Extract ID
  const parseSheetId = (input: string) => {
    const trimmed = input.trim();
    const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match && match[1] ? match[1] : trimmed;
  };

  const effectiveSheetId = isCustomMode
    ? parseSheetId(customSheetUrl)
    : selectedSheetId;

  // Load Spreadsheet Details (Tabs & Titles)
  useEffect(() => {
    if (!accessToken || !effectiveSheetId) return;

    let isMounted = true;
    localStorage.setItem("df_sheet_id", effectiveSheetId);

    getSpreadsheetDetails(accessToken, effectiveSheetId)
      .then((details) => {
        if (!isMounted) return;
        setSpreadsheetTitle(details.title);
        setSheetTabs(details.sheets);
        if (details.sheets.length > 0) {
          const matchedTab = details.sheets.find((s) => s.title === selectedTabName);
          const firstTab = matchedTab ? matchedTab.title : details.sheets[0].title;
          setSelectedTabName(firstTab);
          localStorage.setItem("df_sheet_tab", firstTab);
        }
      })
      .catch((err) => {
        console.warn("Could not get sheet tabs:", err.message);
      });

    return () => {
      isMounted = false;
    };
  }, [accessToken, effectiveSheetId]);

  // Load Sheet Rows
  const loadSheetData = async () => {
    if (!accessToken || !effectiveSheetId) {
      toast.error("กรุณาเข้าสู่ระบบและเลือกไฟล์ Google Sheet ก่อน");
      return;
    }

    setLoadingRows(true);
    try {
      const range = selectedTabName ? `'${selectedTabName}'!A1:Z5000` : "A1:Z5000";
      const rawRows = await readSpreadsheetValues(accessToken, effectiveSheetId, range);
      const parsed = parseDialogflowSheetRows(rawRows);

      setRawHeaders(parsed.headers);
      setRecords(parsed.records);
      setTotalIncome(parsed.totalIncome);
      setTotalExpense(parsed.totalExpense);
      setLastSyncTime(new Date());
      setCurrentPage(1);

      toast.success(`โหลดข้อมูลจาก Dialogflow ชีตสำเร็จ (${parsed.records.length} รายการ)`);
    } catch (err: any) {
      toast.error(`อ่านข้อมูลไม่สำเร็จ: ${err.message}`);
    } finally {
      setLoadingRows(false);
    }
  };

  // Auto load when tab or sheet changes
  useEffect(() => {
    if (accessToken && effectiveSheetId && selectedTabName) {
      loadSheetData();
    }
  }, [accessToken, effectiveSheetId, selectedTabName]);

  // Append Quick Entry
  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !effectiveSheetId) {
      toast.error("กรุณาเข้าสู่ระบบ Google ก่อน");
      return;
    }
    if (!newEntry.list.trim() || !newEntry.amount) {
      toast.error("กรุณาระบุรายการและจำนวนเงิน");
      return;
    }

    setIsSubmittingEntry(true);
    try {
      const rowValues = [
        newEntry.date.trim(),
        newEntry.itemType,
        newEntry.list.trim(),
        parseFloat(newEntry.amount) || 0,
        newEntry.note.trim() || "",
      ];

      await appendSpreadsheetRow(
        accessToken,
        effectiveSheetId,
        selectedTabName || "Sheet1",
        rowValues
      );

      toast.success("เพิ่มรายการลง Google Sheet เรียบร้อยแล้ว!");
      setNewEntry({
        date: new Date().toLocaleDateString("en-GB"),
        itemType: "expense",
        list: "",
        amount: "",
        note: "",
      });
      setShowAddForm(false);
      loadSheetData();
    } catch (err: any) {
      toast.error(`ไม่สามารถบันทึกลงชีตได้: ${err.message}`);
    } finally {
      setIsSubmittingEntry(false);
    }
  };

  // Filter Records
  const filteredRecords = useMemo(() => {
    return records.filter((rec) => {
      // Type Filter
      if (typeFilter !== "all" && rec.itemType !== typeFilter) {
        return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesList = rec.list.toLowerCase().includes(q);
        const matchesDate = rec.date.toLowerCase().includes(q);
        const matchesNote = (rec.note || "").toLowerCase().includes(q);
        const matchesAmount = rec.rawAmount.includes(q);
        if (!matchesList && !matchesDate && !matchesNote && !matchesAmount) {
          return false;
        }
      }

      // Date Filter
      if (dateFilter !== "all") {
        const todayStr1 = new Date().toLocaleDateString("en-GB"); // DD/MM/YYYY e.g. 29/08/2026
        const todayParts = todayStr1.split("/");
        const recParts = rec.date.split(/[/.-]/);

        if (dateFilter === "today") {
          // Compare day and month roughly
          if (recParts.length >= 2 && todayParts.length >= 2) {
            const isToday =
              parseInt(recParts[0]) === parseInt(todayParts[0]) &&
              parseInt(recParts[1]) === parseInt(todayParts[1]);
            if (!isToday && !rec.date.includes(todayParts[0])) return false;
          }
        }
      }

      return true;
    });
  }, [records, typeFilter, searchQuery, dateFilter]);

  // Filtered Summary
  const filteredIncome = useMemo(() => {
    return filteredRecords
      .filter((r) => r.itemType === "income")
      .reduce((sum, r) => sum + r.amount, 0);
  }, [filteredRecords]);

  const filteredExpense = useMemo(() => {
    return filteredRecords
      .filter((r) => r.itemType === "expense")
      .reduce((sum, r) => sum + r.amount, 0);
  }, [filteredRecords]);

  const filteredNet = filteredIncome - filteredExpense;

  // Pagination Slice
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, currentPage, pageSize]);

  // Today's Date String
  const todayDisplay = new Date().toLocaleDateString("th-TH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-8">
      {/* 1. Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader
          kicker="BOT & DIALOGFLOW INTEGRATION"
          title="ข้อมูลจาก Dialogflow (รายรับ-รายจ่าย)"
          description="เรียกดู ตรวจสอบ และจัดการข้อมูลที่บันทึกผ่าน Dialogflow LINE Bot จาก Google Sheets โดยตรงแบบเรียลไทม์"
        />

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            variant={showServiceTester ? "primary" : "secondary"}
            size="md"
            onClick={() => setShowServiceTester(!showServiceTester)}
            icon={<Bot className="w-4 h-4" />}
          >
            {showServiceTester ? "ซ่อนตัวทดสอบ Cloud Run" : "Cloud Run Service"}
          </Button>

          <Button
            variant="secondary"
            size="md"
            onClick={() => setShowWebhookGuide(true)}
            icon={<FileSpreadsheet className="w-4 h-4 text-[#1C1917]" />}
          >
            คู่มือ Webhook
          </Button>

          <Button
            variant="primary"
            size="md"
            onClick={() => setShowAddForm(!showAddForm)}
            icon={<Plus className="w-4 h-4" />}
          >
            {showAddForm ? "ปิดฟอร์ม" : "เพิ่มรายการใหม่"}
          </Button>
        </div>
      </div>

      {/* Cloud Run Service Connection Card & Tester */}
      <div className="bg-[#FFFCF8] rounded-[20px] border border-[#1C1917]/10 p-5 space-y-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[#1C1917]/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[12px] bg-[#1C1917] text-white flex items-center justify-center font-bold text-xs">
              GCP
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#1C1917]">
                  Dialogflow Cloud Run Service Endpoint
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#3F6B4B]/10 text-[#3F6B4B] font-mono font-medium">
                  asia-southeast3
                </span>
              </div>
              <p className="text-[11px] text-[#78716C] mt-0.5">
                URL บอท Docker: <code className="font-mono text-[#1C1917]">{cloudRunUrl}</code>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(cloudRunUrl);
                toast.success("คัดลอก Cloud Run URL เรียบร้อย");
              }}
              className="h-8 px-3 bg-white hover:bg-[#F6F4F0] border border-[#1C1917]/15 rounded-[8px] text-xs font-medium text-[#1C1917] flex items-center gap-1.5 cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>คัดลอก URL</span>
            </button>
            <a
              href={cloudRunUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="h-8 px-3 bg-white hover:bg-[#F6F4F0] border border-[#1C1917]/15 rounded-[8px] text-xs font-medium text-[#1C1917] flex items-center gap-1.5 cursor-pointer"
            >
              <span>เปิด URL</span>
              <ExternalLink className="w-3.5 h-3.5 text-[#78716C]" />
            </a>
            <Button
              variant="primary"
              size="sm"
              onClick={handleTestService}
              disabled={testServiceMutation.isPending}
              icon={<RefreshCw className={`w-3.5 h-3.5 ${testServiceMutation.isPending ? "animate-spin" : ""}`} />}
            >
              {testServiceMutation.isPending ? "กำลังทดสอบ..." : "ทดสอบเชื่อมต่อ"}
            </Button>
          </div>
        </div>

        {/* Cloud Run Live Details & Tester Accordion */}
        {showServiceTester && (
          <div className="p-4 bg-[#F6F4F0] rounded-[16px] space-y-4 border border-[#1C1917]/10 animate-in fade-in duration-200">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-6">
                <label className="block text-[11px] font-semibold text-[#1C1917] mb-1">
                  Service URL
                </label>
                <input
                  type="text"
                  value={cloudRunUrl}
                  onChange={(e) => setCloudRunUrl(e.target.value)}
                  placeholder="https://income-expense-docker-274212739997.asia-southeast3.run.app/"
                  className="w-full h-9 px-3 bg-white border border-[#1C1917]/15 rounded-[8px] text-xs font-mono text-[#1C1917]"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-[11px] font-semibold text-[#1C1917] mb-1">
                  Method & Path
                </label>
                <div className="flex gap-1.5">
                  <select
                    value={cloudRunMethod}
                    onChange={(e) => setCloudRunMethod(e.target.value as any)}
                    className="h-9 px-2 bg-white border border-[#1C1917]/15 rounded-[8px] text-xs font-mono text-[#1C1917]"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                  </select>
                  <input
                    type="text"
                    value={cloudRunPath}
                    onChange={(e) => setCloudRunPath(e.target.value)}
                    placeholder="/"
                    className="flex-1 h-9 px-3 bg-white border border-[#1C1917]/15 rounded-[8px] text-xs font-mono text-[#1C1917]"
                  />
                </div>
              </div>

              <div className="md:col-span-3">
                <label className="block text-[11px] font-semibold text-[#1C1917] mb-1">
                  Bearer / ID Token (ถ้ามี)
                </label>
                <input
                  type="password"
                  value={cloudRunAuthToken}
                  onChange={(e) => setCloudRunAuthToken(e.target.value)}
                  placeholder="Bearer token หรือเว้นว่าง"
                  className="w-full h-9 px-3 bg-white border border-[#1C1917]/15 rounded-[8px] text-xs font-mono text-[#1C1917]"
                />
              </div>
            </div>

            {cloudRunMethod === "POST" && (
              <div>
                <label className="block text-[11px] font-semibold text-[#1C1917] mb-1">
                  JSON Payload (จำลองข้อมูลจาก Dialogflow / Webhook):
                </label>
                <textarea
                  rows={4}
                  value={testPayloadText}
                  onChange={(e) => setTestPayloadText(e.target.value)}
                  className="w-full p-3 bg-white border border-[#1C1917]/15 rounded-[8px] text-xs font-mono text-[#1C1917] leading-relaxed"
                />
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="text-[11px] text-[#78716C] flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-[#3F6B4B]" />
                <span>คำขอจะถูกยิงผ่าน Proxy บนเซิร์ฟเวอร์เพื่อความปลอดภัยและหลีกเลี่ยง CORS</span>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={handleTestService}
                disabled={testServiceMutation.isPending}
                icon={<Send className="w-3.5 h-3.5" />}
              >
                {testServiceMutation.isPending ? "กำลังส่งคำขอ..." : "ส่งคำขอ (Send Request)"}
              </Button>
            </div>

            {/* Test Result Inspector */}
            {serviceTestResult && (
              <div className="p-3.5 bg-white rounded-[12px] border border-[#1C1917]/10 space-y-2 text-xs">
                <div className="flex items-center justify-between border-b border-[#1C1917]/10 pb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-[6px] font-mono font-bold text-[11px] text-white ${
                        serviceTestResult.statusCode >= 200 && serviceTestResult.statusCode < 300
                          ? "bg-[#3F6B4B]"
                          : serviceTestResult.statusCode === 403
                          ? "bg-[#D97706]"
                          : "bg-[#A33B2B]"
                      }`}
                    >
                      HTTP {serviceTestResult.statusCode} {serviceTestResult.statusText}
                    </span>
                    <span className="text-[#78716C] font-mono text-[11px]">
                      เวลาตอบสนอง: {serviceTestResult.elapsedMs} ms
                    </span>
                  </div>
                  <span className="text-[11px] text-[#78716C] font-mono truncate max-w-[300px]">
                    {serviceTestResult.url}
                  </span>
                </div>

                {serviceTestResult.recommendation && (
                  <div className="p-2.5 bg-[#FFFBEB] text-[#92400E] rounded-[8px] text-[11px] leading-relaxed flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#D97706]" />
                    <span>{serviceTestResult.recommendation}</span>
                  </div>
                )}

                <div>
                  <div className="font-semibold text-[11px] text-[#78716C] mb-1">Response Data:</div>
                  <pre className="p-2.5 bg-[#1C1917] text-[#F6F4F0] rounded-[8px] text-[11px] font-mono overflow-x-auto max-h-48">
                    {typeof serviceTestResult.data === "object"
                      ? JSON.stringify(serviceTestResult.data, null, 2)
                      : String(serviceTestResult.data || "(No Content)")}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Google Sheets Connector Toolbar */}
      <div className="bg-[#FFFCF8] rounded-[20px] border border-[#1C1917]/10 p-5 space-y-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-[#1C1917]/10">
          {/* Left: Google Account status */}
          <div className="flex items-center gap-3">
            {currentUser?.photoURL ? (
              <img
                src={currentUser.photoURL}
                alt="Avatar"
                className="w-10 h-10 rounded-full border border-[#1C1917]/10"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-[#1C1917]/5 flex items-center justify-center">
                <FileSpreadsheet className="w-5 h-5 text-[#3F6B4B]" />
              </div>
            )}

            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#1C1917]">
                  {currentUser ? currentUser.displayName || currentUser.email : "บัญชี Google"}
                </span>
                <StatusChip
                  status={currentUser ? "paid" : "pending"}
                  label={currentUser ? "เชื่อมต่อแล้ว" : "ยังไม่เข้าสู่ระบบ"}
                />
              </div>
              <p className="text-[11px] text-[#78716C] mt-0.5">
                {currentUser
                  ? `เข้าถึงชีต: ${spreadsheetTitle || effectiveSheetId || "พร้อมโหลดข้อมูล"}`
                  : "กรุณาเข้าสู่ระบบ Google เพื่ออ่านข้อมูลจาก Google Sheets"}
              </p>
            </div>
          </div>

          {/* Right: Sign in / Switch Mode */}
          <div className="flex items-center gap-2">
            {!currentUser ? (
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={authLoading}
                className="h-9 px-4 bg-white hover:bg-[#F6F4F0] border border-[#1C1917]/20 rounded-[10px] shadow-xs flex items-center gap-2 text-xs font-medium text-[#1C1917] cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>{authLoading ? "กำลังเชื่อมต่อ..." : "Sign in with Google"}</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setIsCustomMode(!isCustomMode)}
                  className="h-9 px-3 bg-white hover:bg-[#F6F4F0] border border-[#1C1917]/15 rounded-[10px] text-xs font-medium text-[#1C1917] cursor-pointer"
                >
                  {isCustomMode ? "เลือกจาก Drive" : "ระบุ URL ชีตเอง"}
                </button>

                {effectiveSheetId && (
                  <a
                    href={`https://docs.google.com/spreadsheets/d/${effectiveSheetId}/edit`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="h-9 px-3 bg-white hover:bg-[#F6F4F0] border border-[#1C1917]/15 rounded-[10px] text-xs font-medium text-[#1C1917] flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>เปิดชีตจริง</span>
                    <ExternalLink className="w-3.5 h-3.5 text-[#78716C]" />
                  </a>
                )}

                <button
                  type="button"
                  onClick={loadSheetData}
                  disabled={loadingRows}
                  className="h-9 px-3.5 bg-[#1C1917] text-white hover:bg-[#2C2927] rounded-[10px] text-xs font-medium flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingRows ? "animate-spin" : ""}`} />
                  <span>รีเฟรชข้อมูล</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Sheet & Tab Selectors */}
        {currentUser && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
            {/* Sheet Selector */}
            <div className="md:col-span-7">
              <label className="block text-[11px] font-medium text-[#78716C] mb-1">
                {isCustomMode ? "Google Spreadsheet URL หรือ ID" : "เลือกไฟล์ Google Sheets ใน Drive"}
              </label>
              {isCustomMode ? (
                <input
                  type="text"
                  placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"
                  value={customSheetUrl}
                  onChange={(e) => setCustomSheetUrl(e.target.value)}
                  className="w-full h-9 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-xs font-mono text-[#1C1917] focus:outline-none focus:border-[#1C1917]"
                />
              ) : (
                <select
                  value={selectedSheetId}
                  onChange={(e) => setSelectedSheetId(e.target.value)}
                  disabled={loadingDrive}
                  className="w-full h-9 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-xs text-[#1C1917] focus:outline-none focus:border-[#1C1917]"
                >
                  {spreadsheets.length === 0 && <option value="">กำลังค้นหาไฟล์ใน Google Drive...</option>}
                  {spreadsheets.map((s) => (
                    <option key={s.id} value={s.id}>
                      📄 {s.name} {s.modifiedTime ? `(${new Date(s.modifiedTime).toLocaleDateString("th-TH")})` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Tab / Sheet Name Selector */}
            <div className="md:col-span-5">
              <label className="block text-[11px] font-medium text-[#78716C] mb-1">
                เลือกแท็บชีต (Worksheet Tab)
              </label>
              <div className="flex items-center gap-2">
                {sheetTabs.length > 0 ? (
                  <select
                    value={selectedTabName}
                    onChange={(e) => {
                      setSelectedTabName(e.target.value);
                      localStorage.setItem("df_sheet_tab", e.target.value);
                    }}
                    className="w-full h-9 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-xs font-medium text-[#1C1917] focus:outline-none focus:border-[#1C1917]"
                  >
                    {sheetTabs.map((tab) => (
                      <option key={tab.sheetId} value={tab.title}>
                        📑 {tab.title} {tab.rowCount ? `(~${tab.rowCount} แถว)` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="Sheet1"
                    value={selectedTabName}
                    onChange={(e) => {
                      setSelectedTabName(e.target.value);
                      localStorage.setItem("df_sheet_tab", e.target.value);
                    }}
                    className="w-full h-9 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-xs text-[#1C1917]"
                  />
                )}

                {lastSyncTime && (
                  <span className="text-[10px] text-[#78716C] shrink-0 font-mono">
                    อัปเดต: {lastSyncTime.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Quick Entry Form Accordion */}
      {showAddForm && (
        <div className="bg-[#FFFCF8] rounded-[20px] border border-[#1C1917]/15 p-6 shadow-sm animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-[#1C1917]/10 mb-4">
            <div className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-[#1C1917]" />
              <h3 className="text-sm font-bold text-[#1C1917]">
                เพิ่มรายการใหม่ลง Google Sheet (Date | item type | list | Amount)
              </h3>
            </div>
            <span className="text-xs text-[#78716C]">
              บันทึกตรงเข้าแท็บ: <b>{selectedTabName || "Sheet1"}</b>
            </span>
          </div>

          <form onSubmit={handleAddEntry} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#1C1917] mb-1">
                  วันที่ (Date) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="29/8/2026"
                  value={newEntry.date}
                  onChange={(e) => setNewEntry({ ...newEntry, date: e.target.value })}
                  className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-xs font-mono text-[#1C1917]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1C1917] mb-1">
                  ประเภท (item type) *
                </label>
                <div className="grid grid-cols-2 gap-1 bg-[#F6F4F0] p-1 rounded-[10px]">
                  <button
                    type="button"
                    onClick={() => setNewEntry({ ...newEntry, itemType: "expense" })}
                    className={`h-8 rounded-[8px] text-xs font-medium transition-all cursor-pointer ${
                      newEntry.itemType === "expense"
                        ? "bg-[#A33B2B] text-white shadow-xs"
                        : "text-[#78716C] hover:text-[#1C1917]"
                    }`}
                  >
                    expense (จ่าย)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewEntry({ ...newEntry, itemType: "income" })}
                    className={`h-8 rounded-[8px] text-xs font-medium transition-all cursor-pointer ${
                      newEntry.itemType === "income"
                        ? "bg-[#3F6B4B] text-white shadow-xs"
                        : "text-[#78716C] hover:text-[#1C1917]"
                    }`}
                  >
                    income (รับ)
                  </button>
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-[#1C1917] mb-1">
                  ชื่อรายการ (list) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="เช่น ซื้อกับข้าว, เติมน้ำมัน, รับเงิน..."
                  value={newEntry.list}
                  onChange={(e) => setNewEntry({ ...newEntry, list: e.target.value })}
                  className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-xs text-[#1C1917]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1C1917] mb-1">
                  จำนวนเงิน (Amount) *
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="0.00"
                  value={newEntry.amount}
                  onChange={(e) => setNewEntry({ ...newEntry, amount: e.target.value })}
                  className="w-full h-10 px-3 bg-white border border-[#1C1917]/15 rounded-[10px] text-xs font-mono text-[#1C1917]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => setShowAddForm(false)}
              >
                ยกเลิก
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="md"
                loading={isSubmittingEntry}
                icon={<Send className="w-4 h-4" />}
              >
                บันทึกลง Google Sheet
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* 4. Top Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="รายการทั้งหมดในชีต"
          rawDisplay={
            <span className="text-2xl font-bold font-mono text-[#1C1917]">
              {records.length.toLocaleString()} แถว
            </span>
          }
          subtitle={`กำลังแสดงผล ${filteredRecords.length} รายการ`}
        />

        <StatCard
          label="รายรับรวม (Income)"
          rawDisplay={
            <span className="text-2xl font-bold font-mono text-[#3F6B4B]">
              ฿{totalIncome.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          }
          subtitle={`กรองแล้ว: ฿${filteredIncome.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`}
          accentBar="income"
        />

        <StatCard
          label="รายจ่ายรวม (Expense)"
          rawDisplay={
            <span className="text-2xl font-bold font-mono text-[#A33B2B]">
              ฿{totalExpense.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          }
          subtitle={`กรองแล้ว: ฿${filteredExpense.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`}
          accentBar="expense"
        />

        <StatCard
          label="ส่วนต่างสุทธิ (Net Balance)"
          rawDisplay={
            <span
              className={`text-2xl font-bold font-mono ${
                totalIncome - totalExpense >= 0 ? "text-[#3F6B4B]" : "text-[#A33B2B]"
              }`}
            >
              {totalIncome - totalExpense >= 0 ? "+" : ""}
              ฿{(totalIncome - totalExpense).toLocaleString("th-TH", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          }
          subtitle={`พอร์ตชีต: ${selectedTabName || "Dialogflow"}`}
        />
      </div>

      {/* 5. Filter & Search Toolbar */}
      <div className="bg-[#FFFCF8] rounded-[20px] border border-[#1C1917]/10 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search Box */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#78716C]" />
          <input
            type="text"
            placeholder="ค้นหาชื่อรายการ, วันที่, ยอดเงิน..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full h-10 pl-9 pr-3 bg-[#F6F4F0] border border-transparent rounded-[10px] text-xs text-[#1C1917] focus:bg-white focus:border-[#1C1917]/20 focus:outline-none"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Type Filter Chips */}
          <div className="flex items-center gap-1 bg-[#F6F4F0] p-1 rounded-[10px]">
            <button
              type="button"
              onClick={() => {
                setTypeFilter("all");
                setCurrentPage(1);
              }}
              className={`h-8 px-3 rounded-[8px] text-xs font-medium transition-all cursor-pointer ${
                typeFilter === "all"
                  ? "bg-[#1C1917] text-white shadow-xs"
                  : "text-[#78716C] hover:text-[#1C1917]"
              }`}
            >
              ทั้งหมด
            </button>
            <button
              type="button"
              onClick={() => {
                setTypeFilter("income");
                setCurrentPage(1);
              }}
              className={`h-8 px-3 rounded-[8px] text-xs font-medium transition-all cursor-pointer flex items-center gap-1 ${
                typeFilter === "income"
                  ? "bg-[#3F6B4B] text-white shadow-xs"
                  : "text-[#78716C] hover:text-[#3F6B4B]"
              }`}
            >
              <ArrowDownLeft className="w-3 h-3" />
              <span>รายรับ</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setTypeFilter("expense");
                setCurrentPage(1);
              }}
              className={`h-8 px-3 rounded-[8px] text-xs font-medium transition-all cursor-pointer flex items-center gap-1 ${
                typeFilter === "expense"
                  ? "bg-[#A33B2B] text-white shadow-xs"
                  : "text-[#78716C] hover:text-[#A33B2B]"
              }`}
            >
              <ArrowUpRight className="w-3 h-3" />
              <span>รายจ่าย</span>
            </button>
          </div>

          {/* Page size */}
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="h-10 px-3 bg-[#F6F4F0] border border-transparent rounded-[10px] text-xs text-[#1C1917] font-mono cursor-pointer"
          >
            <option value={25}>25 แถว</option>
            <option value={50}>50 แถว</option>
            <option value={100}>100 แถว</option>
            <option value={250}>250 แถว</option>
          </select>
        </div>
      </div>

      {/* 6. Main Data Table matching the screenshot structure */}
      <div className="bg-[#FFFCF8] rounded-[20px] border border-[#1C1917]/10 overflow-hidden shadow-xs">
        {/* Table Header / Top Bar */}
        <div className="px-6 py-4 border-b border-[#1C1917]/10 flex items-center justify-between bg-[#FFFCF8]">
          <div className="flex items-center gap-2.5">
            <div className="w-3 h-3 rounded-full bg-[#1C1917]" />
            <h3 className="text-sm font-bold text-[#1C1917]">
              ตารางบันทึกรายการ (Dialogflow Live Records)
            </h3>
            <span className="text-xs font-mono text-[#78716C]">
              ({filteredRecords.length} รายการ)
            </span>
          </div>

          {loadingRows && (
            <div className="flex items-center gap-1.5 text-xs text-[#78716C]">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#1C1917]" />
              <span>กำลังดึงข้อมูลจาก Google Sheets...</span>
            </div>
          )}
        </div>

        {/* Scrollable Table View */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              {/* Header row styling: Dark Charcoal background matching the image */}
              <tr className="bg-[#2D2A26] text-white font-medium select-none">
                <th className="py-3 px-4 w-16 text-center font-mono text-[#A8A29E] border-r border-[#44403C]">
                  # แถว
                </th>
                <th className="py-3 px-4 w-32 font-semibold border-r border-[#44403C]">
                  Date (วันที่)
                </th>
                <th className="py-3 px-4 w-32 font-semibold text-center border-r border-[#44403C]">
                  item type
                </th>
                <th className="py-3 px-4 font-semibold border-r border-[#44403C]">
                  list (รายการ)
                </th>
                <th className="py-3 px-4 w-36 font-semibold text-right border-r border-[#44403C]">
                  Amount (จำนวนเงิน)
                </th>
                <th className="py-3 px-4 w-44 font-semibold border-r border-[#44403C]">
                  บันทึก / บัญชี
                </th>
                <th className="py-3 px-3 w-28 text-center font-semibold">
                  จัดการ
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1C1917]/5 font-sans">
              {paginatedRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#78716C]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <FileSpreadsheet className="w-8 h-8 text-[#78716C]/40" />
                      <p className="text-sm font-medium">
                        {loadingRows
                          ? "กำลังโหลดข้อมูลจาก Google Sheets..."
                          : records.length === 0
                          ? "ไม่พบข้อมูลในชีต หรือยังไม่ได้เข้าสู่ระบบ Google"
                          : "ไม่พบรายการที่ตรงกับเงื่อนไขการค้นหา"}
                      </p>
                      {!currentUser && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={handleGoogleSignIn}
                          icon={<LogIn className="w-3.5 h-3.5" />}
                        >
                          Sign in with Google เพื่อโหลดข้อมูล
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedRecords.map((item, idx) => {
                  const isExpense = item.itemType === "expense";
                  const isIncome = item.itemType === "income";

                  return (
                    <tr
                      key={`${item.rowIndex}-${idx}`}
                      className="hover:bg-[#F6F4F0]/70 transition-colors"
                    >
                      {/* Row index from Google Sheets */}
                      <td className="py-3 px-4 text-center font-mono text-[11px] text-[#78716C] bg-[#F6F4F0]/30 border-r border-[#1C1917]/5">
                        {item.rowIndex}
                      </td>

                      {/* Date */}
                      <td className="py-3 px-4 font-mono text-xs text-[#1C1917] border-r border-[#1C1917]/5 whitespace-nowrap">
                        {item.date || "-"}
                      </td>

                      {/* Item Type with exact background badges matching screenshot */}
                      <td className="py-3 px-4 text-center border-r border-[#1C1917]/5">
                        <span
                          className={`inline-block px-3 py-1 rounded-[6px] text-xs font-semibold tracking-wide ${
                            isExpense
                              ? "bg-[#D9534F] text-white shadow-2xs"
                              : isIncome
                              ? "bg-[#5CB85C] text-white shadow-2xs"
                              : "bg-[#78716C] text-white"
                          }`}
                        >
                          {item.itemType}
                        </span>
                      </td>

                      {/* List Description */}
                      <td className="py-3 px-4 text-[#1C1917] font-medium border-r border-[#1C1917]/5">
                        <span className="line-clamp-1">{item.list}</span>
                      </td>

                      {/* Amount */}
                      <td
                        className={`py-3 px-4 text-right font-mono font-bold text-xs border-r border-[#1C1917]/5 ${
                          isExpense ? "text-[#A33B2B]" : "text-[#3F6B4B]"
                        }`}
                      >
                        {isExpense ? "-" : "+"}
                        {item.amount.toLocaleString("th-TH", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>

                      {/* Note / Account info */}
                      <td className="py-3 px-4 text-[#78716C] text-[11px] border-r border-[#1C1917]/5 truncate">
                        {item.note || item.rawValues[4] || "-"}
                      </td>

                      {/* Action: Copy / View */}
                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(
                              `${item.date}\t${item.itemType}\t${item.list}\t${item.amount}`
                            );
                            toast.success("คัดลอกข้อมูลแถวนี้แล้ว");
                          }}
                          title="คัดลอกข้อมูลแถวนี้"
                          className="p-1.5 rounded-[6px] text-[#78716C] hover:text-[#1C1917] hover:bg-[#1C1917]/5 transition-colors cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {filteredRecords.length > 0 && (
          <div className="px-6 py-4 border-t border-[#1C1917]/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#FFFCF8]">
            <div className="text-xs text-[#78716C]">
              แสดงลำดับที่{" "}
              <b className="text-[#1C1917]">{(currentPage - 1) * pageSize + 1}</b> ถึง{" "}
              <b className="text-[#1C1917]">
                {Math.min(currentPage * pageSize, filteredRecords.length)}
              </b>{" "}
              จากทั้งหมด <b className="text-[#1C1917]">{filteredRecords.length}</b> รายการ
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="h-8 px-3 rounded-[8px] border border-[#1C1917]/15 bg-white text-xs font-medium text-[#1C1917] disabled:opacity-40 hover:bg-[#F6F4F0] transition-colors cursor-pointer flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>ก่อนหน้า</span>
              </button>

              <span className="text-xs font-mono px-2 text-[#1C1917]">
                หน้า {currentPage} / {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="h-8 px-3 rounded-[8px] border border-[#1C1917]/15 bg-white text-xs font-medium text-[#1C1917] disabled:opacity-40 hover:bg-[#F6F4F0] transition-colors cursor-pointer flex items-center gap-1"
              >
                <span>ถัดไป</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 7. Dialogflow Webhook Guide Modal */}
      {showWebhookGuide && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-[#FFFCF8] rounded-[20px] border border-[#1C1917]/15 p-6 max-w-2xl w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#1C1917] text-white flex items-center justify-center">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#1C1917]">
                    โครงสร้างและวิธีส่งข้อมูลจาก Dialogflow / Apps Script
                  </h3>
                  <p className="text-xs text-[#78716C] mt-0.5">
                    รูปแบบคอลัมน์มาตรฐานที่บอทใช้บันทึกลง Google Sheets
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowWebhookGuide(false)}
                className="text-xs text-[#78716C] hover:text-[#1C1917] p-1 cursor-pointer"
              >
                ✕ ปิด
              </button>
            </div>

            <div className="p-4 bg-[#F6F4F0] rounded-[14px] text-xs text-[#1C1917] space-y-2">
              <div className="font-semibold text-xs text-[#1C1917]">
                ลำดับคอลัมน์ใน Google Sheets:
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
                <div className="p-2 bg-white rounded-[8px] border border-[#1C1917]/10">
                  <span className="text-[#78716C]">A: </span> <b>Date</b>
                </div>
                <div className="p-2 bg-white rounded-[8px] border border-[#1C1917]/10">
                  <span className="text-[#78716C]">B: </span> <b>item type</b>
                </div>
                <div className="p-2 bg-white rounded-[8px] border border-[#1C1917]/10">
                  <span className="text-[#78716C]">C: </span> <b>list</b>
                </div>
                <div className="p-2 bg-white rounded-[8px] border border-[#1C1917]/10">
                  <span className="text-[#78716C]">D: </span> <b>Amount</b>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#1C1917]">
                  ตัวอย่างโค้ด Google Apps Script (doPost สำหรับ Dialogflow / LINE Bot):
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const code = `function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = JSON.parse(e.postData.contents);
  
  // รับค่าจาก Dialogflow Fulfillment / LINE Webhook
  var dateStr = data.date || Utilities.formatDate(new Date(), "GMT+7", "d/M/yyyy");
  var itemType = data.type || "expense"; // expense หรือ income
  var list = data.list || data.item || "";
  var amount = Number(data.amount) || 0;
  var note = data.note || "";
  
  // บันทึกต่อท้ายแถวสุดท้าย
  sheet.appendRow([dateStr, itemType, list, amount, note]);
  
  return ContentService.createTextOutput(JSON.stringify({
    fulfillmentText: "บันทึก " + itemType + " " + list + " จำนวน " + amount + " บาท เรียบร้อยแล้ว"
  })).setMimeType(ContentService.MimeType.JSON);
}`;
                    navigator.clipboard.writeText(code);
                    toast.success("คัดลอกตัวอย่างโค้ด Apps Script แล้ว");
                  }}
                  className="text-xs text-[#3F6B4B] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>คัดลอกโค้ด</span>
                </button>
              </div>

              <pre className="p-3.5 bg-[#1C1917] text-[#F6F4F0] rounded-[12px] text-[11px] font-mono overflow-x-auto leading-relaxed">
{`function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = JSON.parse(e.postData.contents);
  
  var dateStr = data.date || Utilities.formatDate(new Date(), "GMT+7", "d/M/yyyy");
  var itemType = data.type || "expense"; // expense หรือ income
  var list = data.list || data.item || "";
  var amount = Number(data.amount) || 0;
  
  sheet.appendRow([dateStr, itemType, list, amount]);
  return ContentService.createTextOutput("OK");
}`}
              </pre>
            </div>

            <div className="pt-2 flex justify-end">
              <Button
                variant="primary"
                size="md"
                onClick={() => setShowWebhookGuide(false)}
              >
                เข้าใจแล้ว
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
