import { OAUTH_STATE_COOKIE, encodeOAuthState } from "@shared/const";

export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

export type AuthProvider = "google" | "line";
export type TelegramAuthIntent = "login" | "link";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        initDataUnsafe?: { start_param?: string };
        ready: () => void;
        expand: () => void;
        openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
      };
    };
  }
}

export async function startGoogleOAuth(intent: "login" | "link" = "login") {
  const webApp = window.Telegram?.WebApp;
  if (webApp?.initData) {
    const response = await fetch("/api/auth/google/handoff/start", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: webApp.initData }),
    });
    const result = await response.json().catch(() => ({})) as {
      success?: boolean;
      url?: string;
      message?: string;
    };
    if (!response.ok || !result.success || !result.url) {
      throw new Error(result.message || "ไม่สามารถเริ่ม Google Login ผ่าน Safari ได้");
    }
    if (!webApp.openLink) {
      throw new Error("Telegram ไม่รองรับการเปิด Safari จาก Mini App นี้");
    }
    webApp.openLink(result.url, { try_instant_view: false });
    return;
  }

  window.location.assign(`/api/auth/google${intent === "link" ? "?intent=link" : ""}`);
}

export const startGoogleLink = () => startGoogleOAuth("link");

export const startLogin = (provider: AuthProvider = "google") => {
  if (provider === "google") {
    void startGoogleOAuth("login").catch(error => {
      console.error("[Google OAuth] Could not start login:", error);
      window.alert(error instanceof Error ? error.message : "เริ่ม Google Login ไม่สำเร็จ");
    });
    return;
  }
  window.location.assign(`/api/auth/${provider}`);
};

/**
 * Keep the original Manus OAuth login available so existing users can sign in
 * to their original user row before linking Google, LINE, or Telegram.
 */
export const startManusLogin = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;

  if (!oauthPortalUrl || !appId) {
    window.location.assign("/?auth=legacy-config-missing");
    return;
  }

  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const nonce = crypto.randomUUID();

  document.cookie = `${OAUTH_STATE_COOKIE}=${nonce}; Path=/; Max-Age=600; SameSite=None; Secure`;
  const state = encodeOAuthState({ redirectUri, nonce });

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  window.location.assign(url.toString());
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
