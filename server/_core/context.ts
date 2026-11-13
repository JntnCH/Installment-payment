import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
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
    // Never create a shared fallback identity: unauthenticated requests must
    // remain anonymous so protected procedures cannot expose another user's data.
    if (process.env.NODE_ENV !== "production") {
      console.info("[Auth] Request has no valid session:", String(error));
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
