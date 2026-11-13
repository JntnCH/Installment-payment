export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

export type AuthProvider = "google" | "line";
export type TelegramAuthIntent = "login" | "link";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        ready: () => void;
        expand: () => void;
      };
    };
  }
}

export const startLogin = (provider: AuthProvider = "google") => {
  window.location.assign(`/api/auth/${provider}`);
};

export async function authenticateWithTelegram(intent: TelegramAuthIntent = "login") {
  const webApp = window.Telegram?.WebApp;
  if (!webApp?.initData) {
    throw new Error("กรุณาเปิดแอปผ่าน Telegram Mini App ก่อน");
  }

  webApp.ready();
  webApp.expand();

  const response = await fetch("/api/auth/telegram", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData: webApp.initData, intent }),
  });
  const result = await response.json().catch(() => ({})) as { success?: boolean; message?: string };
  if (!response.ok || !result.success) {
    throw new Error(result.message || "เข้าสู่ระบบ Telegram ไม่สำเร็จ");
  }
  window.location.assign("/");
}
