import { randomBytes, timingSafeEqual } from "node:crypto";
import axios from "axios";
import type { Express, Request, Response } from "express";
import { parse as parseCookieHeader } from "cookie";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import * as db from "../db";
import { ENV } from "./env";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

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
      scopes: "openid email profile",
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
    ENV.databaseUrl
  );
}

async function startLogin(provider: Provider, req: Request, res: Response) {
  if (!isConfigured(provider)) {
    res.status(503).send(`${provider} OAuth is not configured`);
    return;
  }

  const intent = req.query.intent === "link" ? "link" : "login";
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
    url.searchParams.set("access_type", "online");
    url.searchParams.set("prompt", "select_account");
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
  return response.data as { access_token?: string; id_token?: string };
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
  let stateData: { state: string; intent: "login" | "link"; linkUserId: number | null } | null = null;
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
    const tokens = await exchangeCode(provider, code);
    const profile = provider === "google"
      ? (tokens.access_token ? await getGoogleProfile(tokens.access_token) : null)
      : (tokens.id_token ? await getLineProfile(tokens.id_token) : null);

    if (!profile) throw new Error("OAuth provider did not return required tokens");

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
      res.redirect(302, "/?auth=linked");
      return;
    }

    const user = await db.getUserByAuthIdentity(provider, profile.providerUserId)
      ?? await db.createUserForAuthIdentity({ provider, ...profile });

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
    res.redirect(302, stateData.intent === "link" ? "/?auth=link-failed" : "/?auth=failed");
  }
}

export function registerProviderOAuthRoutes(app: Express) {
  app.get("/api/auth/google", (req, res) => void startLogin("google", req, res));
  app.get("/api/auth/google/callback", (req, res) => void completeLogin("google", req, res));
  app.get("/api/auth/line", (req, res) => void startLogin("line", req, res));
  app.get("/api/auth/line/callback", (req, res) => void completeLogin("line", req, res));
}
