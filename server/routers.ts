import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { contractInputSchema, contractUpdateInputSchema, dialogflowServiceSchema, ledgerIdInputSchema, partyInputSchema, partyRoleSchema, partyUpdateInputSchema, schedulePaymentInputSchema, scheduleUpdateInputSchema, transactionInputSchema, transactionUpdateInputSchema, webhookSyncInputSchema } from "../shared/ledgerSchemas";
import { callDialogflowServiceEndpoint, createLedgerContract, createLedgerParty, createLedgerTransaction, deleteLedgerContract, deleteLedgerParty, deleteLedgerTransaction, exportAllData, getContractLedger, getDashboardStats, getPartyLedger, listLedgerParties, markSchedulePaid, syncToGoogleSheetsWebhook, updateLedgerContract, updateLedgerParty, updateLedgerSchedule, updateLedgerTransaction } from "./ledger";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

export const appRouter = router({
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
    getStats: protectedProcedure.query(({ ctx }) => getDashboardStats(ctx.user.id)),
    exportData: protectedProcedure.query(({ ctx }) => exportAllData(ctx.user.id)),
    syncGoogleSheets: protectedProcedure.input(webhookSyncInputSchema).mutation(({ ctx, input }) => syncToGoogleSheetsWebhook(ctx.user.id, input.webhookUrl, input.syncTarget)),
    callDialogflowService: publicProcedure.input(dialogflowServiceSchema).mutation(async ({ input }) => {
      return callDialogflowServiceEndpoint(input);
    }),
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
    deleteParty: protectedProcedure.input(ledgerIdInputSchema).mutation(({ ctx, input }) => deleteLedgerParty(ctx.user.id, input.id)),
    deleteContract: protectedProcedure.input(ledgerIdInputSchema).mutation(({ ctx, input }) => deleteLedgerContract(ctx.user.id, input.id)),
    deleteTransaction: protectedProcedure.input(ledgerIdInputSchema).mutation(({ ctx, input }) => deleteLedgerTransaction(ctx.user.id, input.id)),
  }),
});

export type AppRouter = typeof appRouter;

