import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { contractInputSchema, contractUpdateInputSchema, ledgerIdInputSchema, partyInputSchema, partyRoleSchema, partyUpdateInputSchema, schedulePaymentInputSchema, scheduleUpdateInputSchema, transactionInputSchema, transactionUpdateInputSchema } from "../shared/ledgerSchemas";
import { createLedgerContract, createLedgerParty, createLedgerTransaction, getContractLedger, getPartyLedger, listLedgerParties, markSchedulePaid, updateLedgerContract, updateLedgerParty, updateLedgerSchedule, updateLedgerTransaction } from "./ledger";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  ledger: router({
    listParties: protectedProcedure.input(partyRoleSchema.optional()).query(({ ctx, input }) => listLedgerParties(ctx.user.id, input)),
    getParty: protectedProcedure.input(ledgerIdInputSchema).query(async ({ ctx, input }) => {
      const result = await getPartyLedger(ctx.user.id, input.id);
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบบัญชีคู่สัญญา" });
      return result;
    }),
    getContract: protectedProcedure.input(ledgerIdInputSchema).query(async ({ ctx, input }) => {
      const result = await getContractLedger(ctx.user.id, input.id);
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบสัญญา" });
      return result;
    }),
    createParty: protectedProcedure.input(partyInputSchema).mutation(({ ctx, input }) => createLedgerParty(ctx.user.id, input)),
    createContract: protectedProcedure.input(contractInputSchema).mutation(({ ctx, input }) => createLedgerContract(ctx.user.id, input)),
    createTransaction: protectedProcedure.input(transactionInputSchema).mutation(({ ctx, input }) => createLedgerTransaction(ctx.user.id, input)),
    markSchedulePaid: protectedProcedure.input(schedulePaymentInputSchema).mutation(({ ctx, input }) => markSchedulePaid(ctx.user.id, input)),
    updateParty: protectedProcedure.input(partyUpdateInputSchema).mutation(({ ctx, input }) => updateLedgerParty(ctx.user.id, input)),
    updateContract: protectedProcedure.input(contractUpdateInputSchema).mutation(({ ctx, input }) => updateLedgerContract(ctx.user.id, input)),
    updateSchedule: protectedProcedure.input(scheduleUpdateInputSchema).mutation(({ ctx, input }) => updateLedgerSchedule(ctx.user.id, input)),
    updateTransaction: protectedProcedure.input(transactionUpdateInputSchema).mutation(({ ctx, input }) => updateLedgerTransaction(ctx.user.id, input)),
  }),
});

export type AppRouter = typeof appRouter;
