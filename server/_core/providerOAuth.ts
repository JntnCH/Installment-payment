import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import axios from "axios";
import type { Express, Request, Response } from "express";
import { parse as parseCookieHeader } from "cookie";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import * as db from "../db";
import { ENV } from "./env";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { getGoogleDriveAccessToken, getGoogleSheetsStatus, saveGoogleRefreshToken } from "../googleSheets";

type Provider = "google" | "line";

const STATE_COOKIE: Record<Provider, string> = {
  google: "google_oauth_state",
  line: "line_oauth_state",
};

function makeState() {
  return randomBytes(32).toString("base64url");
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function redirectUri(provider: Provider) {
  return provider === "google" ? ENV.googleRedirectUri : ENV.lineRedirectUri;
}

function providerConfig(provider: Provider) {
  if (provider === "google") {
    return {
      clientId: ENV.googleClientId,
      clientSecret: ENV.googleClientSecret,
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenEndpoint: "https://oauth2.googleapis.com/token",
      scopes: "openid email profile https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly",
    };
  }
  return {
    clientId: ENV.lineChannelId,
    clientSecret: ENV.lineChannelSecret,
    authorizationEndpoint: "https://access.line.me/oauth2/v2.1/authorize",
    tokenEndpoint: "https://api.line.me/oauth2/v2.1/token",
    scopes: "openid profile email",
  };
}

function isConfigured(provider: Provider) {
  const config = providerConfig(provider);
  return Boolean(
    config.clientId &&
    config.clientSecret &&
    redirectUri(provider) &&
    ENV.cookieSecret &&
    ENV.databaseUrl &&
    (provider !== "google" || /^[a-f0-9]{64}$/i.test(ENV.googleTokenEncryptionKey))
  );
}

async function startLogin(provider: Provider, req: Request, res: Response) {
  if (!isConfigured(provider)) {
    res.status(503).send(`${provider} OAuth is not configured`);
    return;
  }

  const handoffCode = provider === "google" && typeof req.query.handoff === "string"
    ? req.query.handoff
    : "";
  const isTelegramHandoff = Boolean(handoffCode);
  if (isTelegramHandoff && !/^goh_[A-Za-z0-9_-]{40,}$/.test(handoffCode)) {
    res.status(400).send("Invalid Telegram handoff code");
    return;
  }

  const intent: "login" | "link" | "telegram-handoff" = isTelegramHandoff
    ? "telegram-handoff"
    : req.query.intent === "link" ? "link" : "login";
  let linkUserId: number | null = null;
  if (intent === "link") {
    try {
      const currentUser = await sdk.authenticateRequest(req);
      linkUserId = currentUser.id;
    } catch {
      res.redirect(302, "/?auth=link-session-required");
      return;
    }
  }

  const state = makeState();
  const stateCookie = Buffer.from(JSON.stringify({
    state,
    intent,
    linkUserId,
    handoffCodeHash: isTelegramHandoff
      ? createHash("sha256").update(handoffCode).digest("hex")
      : null,
  })).toString("base64url");
  res.cookie(STATE_COOKIE[provider], stateCookie, {
    ...getSessionCookieOptions(req),
    httpOnly: true,
    sameSite: "lax",
    maxAge: 10 * 60 * 1000,
  });

  const config = providerConfig(provider);
  const url = new URL(config.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri(provider));
  url.searchParams.set("scope", config.scopes);
  url.searchParams.set("state", state);
  if (provider === "google") {
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent select_account");
    url.searchParams.set("include_granted_scopes", "true");
  }
  res.redirect(302, url.toString());
}

async function exchangeCode(provider: Provider, code: string) {
  const config = providerConfig(provider);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(provider),
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });
  const response = await axios.post(config.tokenEndpoint, body.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 15000,
  });
  return response.data as { access_token?: string; id_token?: string; refresh_token?: string };
}

async function getGoogleProfile(accessToken: string) {
  const response = await axios.get("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 15000,
  });
  const profile = response.data as {
    sub?: string; name?: string; email?: string; email_verified?: boolean;
  };
  if (!profile.sub) throw new Error("Google did not return a verified subject");
  return {
    providerUserId: profile.sub,
    name: profile.name ?? null,
    email: profile.email_verified ? profile.email ?? null : null,
  };
}

async function getLineProfile(idToken: string) {
  const response = await axios.post(
    "https://api.line.me/oauth2/v2.1/verify",
    new URLSearchParams({ id_token: idToken, client_id: ENV.lineChannelId }).toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 15000 },
  );
  const profile = response.data as { sub?: string; name?: string; email?: string };
  if (!profile.sub) throw new Error("LINE did not return a verified subject");
  return {
    providerUserId: profile.sub,
    name: profile.name ?? null,
    email: profile.email ?? null,
  };
}

async function completeLogin(provider: Provider, req: Request, res: Response) {
  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const stateCookie = cookies[STATE_COOKIE[provider]] ?? "";
  let stateData: { state: string; intent: "login" | "link" | "telegram-handoff"; linkUserId: number | null; handoffCodeHash?: string | null } | null = null;
  try {
    stateData = JSON.parse(Buffer.from(stateCookie, "base64url").toString("utf8"));
  } catch {
    stateData = null;
  }

  res.clearCookie(STATE_COOKIE[provider], {
    ...getSessionCookieOptions(req),
    sameSite: "lax",
    maxAge: 0,
  });

  if (!state || !stateData?.state || !safeEqual(state, stateData.state) || !code) {
    res.status(403).send("Invalid or expired OAuth state");
    return;
  }

  try {
    const handoff = stateData.intent === "telegram-handoff"
      ? await db.consumeAuthHandoff(stateData.handoffCodeHash ?? "", "google_oauth")
      : null;

    const tokens = await exchangeCode(provider, code);
    const profile = provider === "google"
      ? (tokens.access_token ? await getGoogleProfile(tokens.access_token) : null)
      : (tokens.id_token ? await getLineProfile(tokens.id_token) : null);

    if (!profile) throw new Error("OAuth provider did not return required tokens");

    if (stateData.intent === "telegram-handoff") {
      if (provider !== "google" || !handoff) {
        throw new Error("Invalid Telegram Google handoff");
      }

      const telegramProviderUserId = handoff.telegramProviderUserId;
      let targetUser: NonNullable<Awaited<ReturnType<typeof db.getUserByAuthIdentity>>>;
      if (handoff.userId) {
        targetUser = await db.getUserByAuthIdentity("telegram", telegramProviderUserId);
        if (!targetUser || targetUser.id !== handoff.userId) {
          throw new Error("Telegram account changed during Google sign-in");
        }
        const existingGoogleUser = await db.getUserByAuthIdentity("google", profile.providerUserId);
        if (existingGoogleUser && existingGoogleUser.id !== targetUser.id) {
          throw new Error("Google account is already linked to a different application account");
        }
        await db.linkAuthIdentity({
          userId: targetUser.id,
          provider: "google",
          ...profile,
        });
      } else {
        targetUser = await db.getUserByAuthIdentity("google", profile.providerUserId)
          ?? await db.createUserForAuthIdentity({ provider: "google", ...profile });
        await db.linkAuthIdentity({
          userId: targetUser.id,
          provider: "telegram",
          providerUserId: telegramProviderUserId,
          name: profile.name,
          email: profile.email,
        });
      }

      if (tokens.refresh_token) {
        await saveGoogleRefreshToken(targetUser.id, tokens.refresh_token, profile.email);
      }
      const googleStatus = await getGoogleSheetsStatus(targetUser.id);
      if (!googleStatus.connected) {
        throw new Error("Google ไม่ได้ส่ง Refresh Token กลับมา กรุณาลองเชื่อมต่ออีกครั้ง");
      }
      if (!ENV.telegramBotUsername) {
        throw new Error("TELEGRAM_BOT_USERNAME is not configured");
      }

      const returnCode = `goh_${randomBytes(32).toString("base64url")}`;
      await db.createAuthHandoff({
        codeHash: createHash("sha256").update(returnCode).digest("hex"),
        userId: targetUser.id,
        telegramProviderUserId,
        purpose: "telegram_return",
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });
      res.set("Cache-Control", "no-store");
      res.redirect(302, `https://t.me/${ENV.telegramBotUsername}?startapp=${encodeURIComponent(returnCode)}`);
      return;
    }

    if (stateData.intent === "link") {
      if (!Number.isSafeInteger(stateData.linkUserId) || !stateData.linkUserId) {
        throw new Error("Invalid account-link state");
      }
      const currentUser = await sdk.authenticateRequest(req);
      if (currentUser.id !== stateData.linkUserId) {
        throw new Error("The signed-in account changed during provider linking");
      }
      await db.linkAuthIdentity({
        userId: currentUser.id,
        provider,
        ...profile,
      });
      if (provider === "google" && tokens.refresh_token) {
        await saveGoogleRefreshToken(currentUser.id, tokens.refresh_token, profile.email);
      }
      res.redirect(302, "/?auth=linked");
      return;
    }

    const user = await db.getUserByAuthIdentity(provider, profile.providerUserId)
      ?? await db.createUserForAuthIdentity({ provider, ...profile });
    if (provider === "google" && tokens.refresh_token) {
      await saveGoogleRefreshToken(user.id, tokens.refresh_token, profile.email);
    }

    await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });

    const sessionToken = await sdk.createSessionToken(user.openId, {
      name: user.name || profile.name || provider,
      expiresInMs: ONE_YEAR_MS,
    });
    res.cookie(COOKIE_NAME, sessionToken, {
      ...getSessionCookieOptions(req),
      maxAge: ONE_YEAR_MS,
    });
    res.redirect(302, "/");
  } catch (error) {
    console.error(`[${provider} OAuth] Callback failed:`, error);
    if (stateData.intent === "telegram-handoff") {
      if (ENV.telegramBotUsername) {
        res.redirect(302, `https://t.me/${ENV.telegramBotUsername}`);
      } else {
        res.status(500).send("Google sign-in failed. Return to Telegram and try again.");
      }
      return;
    }
    res.redirect(302, stateData.intent === "link" ? "/?auth=link-failed" : "/?auth=failed");
  }
}

async function googleAccessToken(req: Request, res: Response) {
  res.set("Cache-Control", "no-store, private");
  try {
    const user = await sdk.authenticateRequest(req);
    const status = await getGoogleSheetsStatus(user.id);
    if (!status.connected) {
      res.status(404).json({ connected: false });
      return;
    }
    const accessToken = await getGoogleDriveAccessToken(user.id);
    const identities = await db.listAuthIdentities(user.id);
    const googleIdentity = identities.find(identity => identity.provider === "google");
    res.status(200).json({
      connected: true,
      accessToken,
      user: {
        id: user.id,
        displayName: googleIdentity?.displayName || status.connectedEmail || user.name || "Google User",
        email: status.connectedEmail,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google account is not connected";
    const status = message.includes("Database") ? 503 : 401;
    res.status(status).json({ connected: false, message });
  }
}

export function registerProviderOAuthRoutes(app: Express) {
  app.get("/api/auth/google", (req, res) => void startLogin("google", req, res));
  app.get("/api/auth/google/callback", (req, res) => void completeLogin("google", req, res));
  app.get("/api/auth/google/access-token", (req, res) => void googleAccessToken(req, res));
  app.get("/api/auth/line", (req, res) => void startLogin("line", req, res));
  app.get("/api/auth/line/callback", (req, res) => void completeLogin("line", req, res));
}
