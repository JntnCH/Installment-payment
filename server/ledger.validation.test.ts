import { describe, expect, it } from "vitest";
import { contractInputSchema, contractUpdateInputSchema, partyInputSchema, partyUpdateInputSchema, schedulePaymentInputSchema, scheduleUpdateInputSchema, transactionInputSchema, transactionUpdateInputSchema } from "../shared/ledgerSchemas";

describe("persistent ledger input validation", () => {
  it("accepts a valid party and contract schedule", () => {
    expect(partyInputSchema.parse({ displayName: "สมชาย ใจดี", role: "debtor" }).displayName).toBe("สมชาย ใจดี");
    expect(contractInputSchema.parse({
      partyId: "party-1",
      title: "สัญญารายวัน",
      principal: 5_000,
      interestRate: 30,
      installmentCount: 2,
      startDate: "2026-08-22",
      schedules: [{ installmentNo: 1, dueDate: "2026-08-23", amount: 2_600 }],
    }).schedules).toHaveLength(1);
  });

  it("rejects invalid money values, dates, and transaction types", () => {
    expect(() => contractInputSchema.parse({ partyId: "party-1", title: "x", principal: 0, installmentCount: 1, startDate: "2026-08-22" })).toThrow();
    expect(() => transactionInputSchema.parse({ partyId: "party-1", type: "scheduled", amount: 100 })).toThrow();
    expect(() => schedulePaymentInputSchema.parse({ scheduleId: "schedule-1", paidAmount: -1 })).toThrow();
  });

  it("accepts bounded updates and rejects empty update requests", () => {
    expect(partyUpdateInputSchema.parse({ id: "party-1", status: "archived" }).status).toBe("archived");
    expect(contractUpdateInputSchema.parse({ id: "contract-1", status: "completed" }).status).toBe("completed");
    expect(scheduleUpdateInputSchema.parse({ id: "schedule-1", dueDate: "2026-08-23", amount: 2500 }).amount).toBe(2500);
    expect(transactionUpdateInputSchema.parse({ id: "transaction-1", source: "corrected" }).source).toBe("corrected");
    expect(() => partyUpdateInputSchema.parse({ id: "party-1" })).toThrow();
    expect(() => contractUpdateInputSchema.parse({ id: "contract-1" })).toThrow();
  });
});
