import { createHmac, timingSafeEqual } from "node:crypto";
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

function verifyTelegramInitData(initData: string) {
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

export function registerTelegramMiniAppAuthRoutes(app: Express) {
  app.post("/api/auth/telegram", (req, res) => void authenticateTelegram(req, res));
}
