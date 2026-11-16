import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import { useAuth } from "@/_core/hooks/useAuth";
import { authenticateWithTelegram, startLogin, startManusLogin } from "./const";

function LoginScreen() {
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [telegramError, setTelegramError] = useState("");
  const isTelegramMiniApp = Boolean(window.Telegram?.WebApp?.initData);
  const authError = new URLSearchParams(window.location.search).get("auth");

  const loginWithTelegram = async () => {
    setTelegramLoading(true);
    setTelegramError("");
    try {
      await authenticateWithTelegram("login");
    } catch (error) {
      setTelegramError(error instanceof Error ? error.message : "เข้าสู่ระบบ Telegram ไม่สำเร็จ");
      setTelegramLoading(false);
    }
  };

  const authErrorMessage: Record<string, string> = {
    failed: "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
    "link-session-required": "กรุณาเข้าสู่ระบบบัญชีเดิมก่อนเชื่อมบัญชีใหม่",
    "legacy-config-missing": "ระบบเข้าสู่ระบบบัญชีเดิมยังไม่ได้ตั้งค่า กรุณาติดต่อผู้ดูแลระบบ",
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#F6F4F0] p-6">
      <section className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm border border-stone-200">
        <h1 className="text-2xl font-semibold text-center text-stone-900">เข้าสู่ระบบ</h1>
        <p className="mt-2 text-sm text-center text-stone-500">เลือกบัญชีที่ต้องการใช้เพื่อเข้าใช้งานสมุดบัญชี</p>
        <div className="mt-7 grid gap-3">
          <button type="button" onClick={startManusLogin} className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-medium text-stone-900 hover:bg-stone-50">
            เข้าสู่ระบบด้วยบัญชีเดิม
          </button>
          {isTelegramMiniApp ? (
            <button type="button" disabled={telegramLoading} onClick={() => void loginWithTelegram()} className="w-full rounded-xl bg-[#229ED9] px-4 py-3 text-sm font-medium text-white hover:bg-[#168ac2] disabled:opacity-60">
              {telegramLoading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบด้วย Telegram"}
            </button>
          ) : (
            <p className="rounded-xl bg-sky-50 px-4 py-3 text-center text-xs text-sky-800">หากต้องการใช้ Telegram ให้เปิดหน้านี้ผ่าน Telegram Mini App</p>
          )}
          <button type="button" onClick={() => startLogin("google")} className="w-full rounded-xl bg-stone-900 px-4 py-3 text-sm font-medium text-white hover:bg-stone-700">
            เข้าสู่ระบบด้วย Google
          </button>
          <button type="button" onClick={() => startLogin("line")} className="w-full rounded-xl bg-[#06C755] px-4 py-3 text-sm font-medium text-white hover:bg-[#05ad4b]">
            เข้าสู่ระบบด้วย LINE
          </button>
        </div>
        {(telegramError || authErrorMessage[authError ?? ""]) && (
          <p role="alert" className="mt-4 text-center text-sm text-red-600">
            {telegramError || authErrorMessage[authError ?? ""]}
          </p>
        )}
      </section>
    </main>
  );
}

function TelegramGoogleHandoffGate({ children }: { children: ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    const code = webApp?.initDataUnsafe?.start_param;
    if (!code?.startsWith("goh_")) {
      setChecking(false);
      return;
    }

    if (!webApp?.initData) {
      setError("ไม่พบข้อมูลยืนยันตัวตนจาก Telegram กรุณาเปิด Mini App ใหม่");
      setChecking(false);
      return;
    }

    void fetch("/api/auth/google/handoff/complete", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: webApp.initData, code }),
    })
      .then(async response => {
        const result = await response.json().catch(() => ({})) as { success?: boolean; message?: string };
        if (!response.ok || !result.success) {
          throw new Error(result.message || "ยืนยันการกลับเข้า Telegram ไม่สำเร็จ");
        }
        setChecking(false);
      })
      .catch(reason => {
        setError(reason instanceof Error ? reason.message : "ยืนยันการกลับเข้า Telegram ไม่สำเร็จ");
        setChecking(false);
      });
  }, []);

  if (checking) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-stone-500">กำลังเชื่อมต่อบัญชี Google กลับเข้า Telegram...</div>;
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#F6F4F0] p-6">
        <section className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-red-600">{error}</p>
          <button type="button" onClick={() => window.location.replace("/")} className="mt-4 rounded-xl bg-stone-900 px-4 py-2 text-sm text-white">
            กลับหน้าเข้าสู่ระบบ
          </button>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}

function AuthenticatedApp() {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-stone-500">กำลังตรวจสอบการเข้าสู่ระบบ...</div>;
  }
  return user ? <Home /> : <LoginScreen />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <TelegramGoogleHandoffGate><AuthenticatedApp /></TelegramGoogleHandoffGate>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
