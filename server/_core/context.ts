import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { ENV } from "./env";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    if (ENV.isProduction) {
      // Never impersonate a database user in production. Doing so can assign
      // writes to a fabricated ownerId and violate ledger foreign keys.
      console.error("[Auth] Production request authentication failed:", error);
      user = null;
    } else {
      // Local development/preview fallback only.
      user = {
        id: 1,
        openId: "preview-admin",
        name: "ผู้ดูแลระบบ",
        email: "admin@installment.local",
        loginMethod: "local",
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      };
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
