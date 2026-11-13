import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "./const";

function LoginScreen() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[#F6F4F0] p-6">
      <section className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm border border-stone-200">
        <h1 className="text-2xl font-semibold text-center text-stone-900">เข้าสู่ระบบ</h1>
        <p className="mt-2 text-sm text-center text-stone-500">เลือกบัญชีที่ต้องการใช้เพื่อเข้าใช้งานสมุดบัญชี</p>
        <div className="mt-7 grid gap-3">
          <button type="button" onClick={() => startLogin("google")} className="w-full rounded-xl bg-stone-900 px-4 py-3 text-sm font-medium text-white hover:bg-stone-700">
            เข้าสู่ระบบด้วย Google
          </button>
          <button type="button" onClick={() => startLogin("line")} className="w-full rounded-xl bg-[#06C755] px-4 py-3 text-sm font-medium text-white hover:bg-[#05ad4b]">
            เข้าสู่ระบบด้วย LINE
          </button>
        </div>
        {new URLSearchParams(window.location.search).get("auth") === "failed" && (
          <p role="alert" className="mt-4 text-center text-sm text-red-600">เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง</p>
        )}
      </section>
    </main>
  );
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
          <AuthenticatedApp />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
