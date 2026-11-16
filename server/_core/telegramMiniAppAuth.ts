import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import * as db from "../db";
import { ENV } from "./env";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export function verifyTelegramInitData(initData: string) {
  if (!ENV.telegramBotToken) throw new Error("Telegram Mini App is not configured");
  if (!initData || initData.length > 16_384) throw new Error("Invalid Telegram initData");

  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash") ?? "";
  if (!/^[a-f0-9]{64}$/i.test(receivedHash)) throw new Error("Invalid Telegram signature");

  params.delete("hash");
  const authDate = Number(params.get("auth_date"));
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(authDate) || authDate > now + 60 || now - authDate > 86_400) {
    throw new Error("Telegram initData has expired");
  }

  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(ENV.telegramBotToken).digest();
  const calculatedHash = createHmac("sha256", secretKey).update(dataCheckString).digest();
  const suppliedHash = Buffer.from(receivedHash, "hex");
  if (suppliedHash.length !== calculatedHash.length || !timingSafeEqual(suppliedHash, calculatedHash)) {
    throw new Error("Telegram signature verification failed");
  }

  const rawUser = params.get("user");
  if (!rawUser) throw new Error("Telegram user data is missing");
  const user = JSON.parse(rawUser) as TelegramUser;
  if (!Number.isSafeInteger(user.id) || user.id <= 0) throw new Error("Invalid Telegram user ID");

  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim()
    || (user.username ? `@${user.username}` : "Telegram user");

  return { providerUserId: String(user.id), name, email: null };
}

async function authenticateTelegram(req: Request, res: Response) {
  const initData = typeof req.body?.initData === "string" ? req.body.initData : "";
  const intent = req.body?.intent === "link" ? "link" : "login";

  try {
    const profile = verifyTelegramInitData(initData);

    if (intent === "link") {
      const currentUser = await sdk.authenticateRequest(req);
      await db.linkAuthIdentity({
        userId: currentUser.id,
        provider: "telegram",
        ...profile,
      });
      res.status(200).json({ success: true, linked: true });
      return;
    }

    const user = await db.getUserByAuthIdentity("telegram", profile.providerUserId)
      ?? await db.createUserForAuthIdentity({ provider: "telegram", ...profile });

    await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });
    const sessionToken = await sdk.createSessionToken(user.openId, {
      name: user.name || profile.name,
      expiresInMs: ONE_YEAR_MS,
    });

    res.cookie(COOKIE_NAME, sessionToken, {
      ...getSessionCookieOptions(req),
      maxAge: ONE_YEAR_MS,
    });
    res.status(200).json({ success: true, linked: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Telegram authentication failed";
    const status = message.includes("Database") ? 503 : 401;
    console.warn("[Telegram Mini App] Authentication rejected:", message);
    res.status(status).json({ success: false, message });
  }
}

async function startGoogleHandoff(req: Request, res: Response) {
  try {
    const initData = typeof req.body?.initData === "string" ? req.body.initData : "";
    const profile = verifyTelegramInitData(initData);
    if (!ENV.telegramBotUsername) {
      throw new Error("ระบบยังไม่ได้ตั้งค่า TELEGRAM_BOT_USERNAME");
    }
    if (!ENV.googleRedirectUri) {
      throw new Error("ระบบ Google OAuth ยังไม่ได้ตั้งค่า");
    }

    let currentUser: Awaited<ReturnType<typeof sdk.authenticateRequest>> | null = null;
    try {
      currentUser = await sdk.authenticateRequest(req);
    } catch {
      currentUser = null;
    }

    let userId: number | null = null;
    if (currentUser) {
      const linkedTelegramUser = await db.getUserByAuthIdentity("telegram", profile.providerUserId);
      if (linkedTelegramUser && linkedTelegramUser.id !== currentUser.id) {
        throw new Error("บัญชี Telegram นี้เชื่อมกับบัญชีอื่นอยู่แล้ว");
      }
      await db.linkAuthIdentity({ userId: currentUser.id, provider: "telegram", ...profile });
      userId = currentUser.id;
    } else {
      const existingTelegramUser = await db.getUserByAuthIdentity("telegram", profile.providerUserId);
      userId = existingTelegramUser?.id ?? null;
    }

    const code = `goh_${randomBytes(32).toString("base64url")}`;
    const codeHash = createHash("sha256").update(code).digest("hex");
    await db.createAuthHandoff({
      codeHash,
      userId,
      telegramProviderUserId: profile.providerUserId,
      purpose: "google_oauth",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    const oauthUrl = new URL("/api/auth/google", new URL(ENV.googleRedirectUri).origin);
    oauthUrl.searchParams.set("handoff", code);
    res.set("Cache-Control", "no-store");
    res.status(200).json({ success: true, url: oauthUrl.toString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ไม่สามารถเริ่ม Google OAuth ได้";
    const status = message.includes("Database") ? 503 : 401;
    res.status(status).json({ success: false, message });
  }
}

async function completeGoogleHandoff(req: Request, res: Response) {
  try {
    const initData = typeof req.body?.initData === "string" ? req.body.initData : "";
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    if (!/^goh_[A-Za-z0-9_-]{40,}$/.test(code)) {
      throw new Error("รหัสส่งต่อไม่ถูกต้อง");
    }

    const profile = verifyTelegramInitData(initData);
    const codeHash = createHash("sha256").update(code).digest("hex");
    const handoff = await db.consumeAuthHandoff(codeHash, "telegram_return", profile.providerUserId);
    if (!handoff.userId) throw new Error("รหัสส่งต่อไม่มีบัญชีผู้ใช้ที่ถูกต้อง");

    const user = await db.getUserByAuthIdentity("telegram", profile.providerUserId);
    if (!user || user.id !== handoff.userId) {
      throw new Error("รหัสส่งต่อไม่ตรงกับบัญชี Telegram นี้");
    }

    await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });
    const sessionToken = await sdk.createSessionToken(user.openId, {
      name: user.name || profile.name,
      expiresInMs: ONE_YEAR_MS,
    });
    res.cookie(COOKIE_NAME, sessionToken, {
      ...getSessionCookieOptions(req),
      maxAge: ONE_YEAR_MS,
    });
    res.set("Cache-Control", "no-store");
    res.status(200).json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ไม่สามารถกลับเข้า Telegram ได้";
    const status = message.includes("Database") ? 503 : 401;
    res.status(status).json({ success: false, message });
  }
}

export function registerTelegramMiniAppAuthRoutes(app: Express) {
  app.post("/api/auth/telegram", (req, res) => void authenticateTelegram(req, res));
  app.post("/api/auth/google/handoff/start", (req, res) => void startGoogleHandoff(req, res));
  app.post("/api/auth/google/handoff/complete", (req, res) => void completeGoogleHandoff(req, res));
}
