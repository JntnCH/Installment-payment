import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createAnonymousContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("ledger API authorization", () => {
  it("rejects an anonymous read without querying ledger data", async () => {
    const caller = appRouter.createCaller(createAnonymousContext());

    await expect(caller.ledger.listParties()).rejects.toMatchObject<Partial<TRPCError>>({
      code: "UNAUTHORIZED",
      message: "Please login (10001)",
    });
  });
});
