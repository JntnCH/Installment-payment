import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  contractInputSchema,
  contractUpdateInputSchema,
  dialogflowServiceSchema,
  ledgerIdInputSchema,
  partyInputSchema,
  partyRoleSchema,
  partyUpdateInputSchema,
  schedulePaymentInputSchema,
  scheduleUpdateInputSchema,
  transactionInputSchema,
  transactionUpdateInputSchema,
  webhookSyncInputSchema,
} from "../shared/ledgerSchemas";
import {
  callDialogflowServiceEndpoint,
  createLedgerContract,
  createLedgerParty,
  createLedgerTransaction,
  deleteLedgerContract,
  deleteLedgerParty,
  deleteLedgerTransaction,
  exportAllData,
  getContractLedger,
  getDashboardStats,
  getPartyLedger,
  listLedgerParties,
  markSchedulePaid,
  syncToGoogleSheetsWebhook,
  updateLedgerContract,
  updateLedgerParty,
  updateLedgerSchedule,
  updateLedgerTransaction,
} from "./ledger";
import {
  createSheetsTransaction,
  getSheetsBalance,
  listSheetsTransactions,
  sheetsProxyConfigured,
} from "./sheetsProxy";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

function isDemoId(id: unknown): boolean {
  return typeof id === "string" && id.startsWith("demo-");
}

function stripDemoExport(data: Awaited<ReturnType<typeof exportAllData>>) {
  return {
    ...data,
    parties: (data.parties || []).filter(p => !isDemoId((p as any).partyId || (p as any).id)),
    contracts: (data.contracts || []).filter(c => !isDemoId((c as any).contractId || (c as any).id)),
    schedules: (data.schedules || []).filter(s => !isDemoId((s as any).scheduleId || (s as any).id)),
    transactions: (data.transactions || []).filter(t => !isDemoId((t as any).transactionId || (t as any).id)),
  };
}

type DashboardStats = Awaited<ReturnType<typeof getDashboardStats>>;

function emptyStats(): DashboardStats {
  return {
    debtorCount: 0,
    creditorCount: 0,
    totalParties: 0,
    totalContracts: 0,
    activeContracts: 0,
    totalPrincipal: 0,
    totalScheduled: 0,
    totalCollected: 0,
    totalOutstanding: 0,
    debtorPrincipal: 0,
    debtorScheduled: 0,
    debtorCollected: 0,
    debtorOutstanding: 0,
    creditorPrincipal: 0,
    creditorScheduled: 0,
    creditorCollected: 0,
    creditorOutstanding: 0,
    totalInflow: 0,
    totalOutflow: 0,
    projectedInterest: 0,
    overdue: { count: 0, amount: 0 },
    today: { count: 0, amount: 0 },
    soon: { count: 0, amount: 0 },
    alerts: [],
    monthlyTimeline: [],
    recentTransactions: [],
  };
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  sheets: router({
    configured: publicProcedure.query(() => ({
      configured: sheetsProxyConfigured(),
      source: "google-sheets" as const,
    })),
    getBalance: protectedProcedure.query(async () => {
      try {
        return await getSheetsBalance();
      } catch (err) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: err instanceof Error ? err.message : "อ่านยอดจาก Google Sheets ไม่สำเร็จ",
        });
      }
    }),
    listTransactions: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(500).optional() }).optional())
      .query(async ({ input }) => {
        try {
          return await listSheetsTransactions(input?.limit ?? 100);
        } catch (err) {
          throw new TRPCError({
            code: "BAD_GATEWAY",
            message: err instanceof Error ? err.message : "อ่านรายการจาก Google Sheets ไม่สำเร็จ",
          });
        }
      }),
    createTransaction: protectedProcedure
      .input(
        z.object({
          type: z.string().optional(),
          item: z.string().optional(),
          amount: z.number().positive(),
          category: z.string().optional(),
          account: z.string().optional(),
          recorderName: z.string().optional(),
          channel: z.string().optional(),
          note: z.string().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        try {
          return await createSheetsTransaction(input);
        } catch (err) {
          throw new TRPCError({
            code: "BAD_GATEWAY",
            message: err instanceof Error ? err.message : "บันทึกลง Google Sheets ไม่สำเร็จ",
          });
        }
      }),
  }),
  ledger: router({
    getStats: protectedProcedure.query(async ({ ctx }) => {
      const stats = await getDashboardStats(ctx.user.id);
      const alerts = (stats.alerts || []).filter(a => !isDemoId((a as any).partyId) && !isDemoId((a as any).contractId) && !isDemoId((a as any).scheduleId));
      // If only demo data existed, return empty operational stats
      if ((stats.totalParties || 0) > 0 && alerts.length === 0 && (stats.totalContracts || 0) > 0) {
        const parties = await listLedgerParties(ctx.user.id);
        const realParties = (parties || []).filter(p => !isDemoId((p as any).partyId || (p as any).id));
        if (realParties.length === 0) return { ...emptyStats(), source: "real-only" };
      }
      return { ...stats, alerts };
    }),
    exportData: protectedProcedure.query(async ({ ctx }) => {
      const data = await exportAllData(ctx.user.id);
      return stripDemoExport(data);
    }),
    syncGoogleSheets: protectedProcedure
      .input(webhookSyncInputSchema)
      .mutation(({ ctx, input }) =>
        syncToGoogleSheetsWebhook(ctx.user.id, input.webhookUrl, input.syncTarget),
      ),
    callDialogflowService: publicProcedure
      .input(dialogflowServiceSchema)
      .mutation(async ({ input }) => callDialogflowServiceEndpoint(input)),
    listParties: protectedProcedure
      .input(partyRoleSchema.optional())
      .query(async ({ ctx, input }) => {
        const parties = await listLedgerParties(ctx.user.id, input);
        return (parties || []).filter(p => !isDemoId((p as any).partyId || (p as any).id));
      }),
    getParty: protectedProcedure.input(ledgerIdInputSchema).query(async ({ ctx, input }) => {
      if (isDemoId(input.id)) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบบัญชีคู่สัญญา" });
      const result = await getPartyLedger(ctx.user.id, input.id);
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบบัญชีคู่สัญญา" });
      return result;
    }),
    getContract: protectedProcedure.input(ledgerIdInputSchema).query(async ({ ctx, input }) => {
      if (isDemoId(input.id)) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบสัญญา" });
      const result = await getContractLedger(ctx.user.id, input.id);
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบสัญญา" });
      return result;
    }),
    createParty: protectedProcedure
      .input(partyInputSchema)
      .mutation(({ ctx, input }) => createLedgerParty(ctx.user.id, input)),
    createContract: protectedProcedure
      .input(contractInputSchema)
      .mutation(({ ctx, input }) => createLedgerContract(ctx.user.id, input)),
    createTransaction: protectedProcedure
      .input(transactionInputSchema)
      .mutation(({ ctx, input }) =>
        createLedgerTransaction(ctx.user.id, input),
      ),
    markSchedulePaid: protectedProcedure
      .input(schedulePaymentInputSchema)
      .mutation(({ ctx, input }) => markSchedulePaid(ctx.user.id, input)),
    updateParty: protectedProcedure
      .input(partyUpdateInputSchema)
      .mutation(({ ctx, input }) => updateLedgerParty(ctx.user.id, input)),
    updateContract: protectedProcedure
      .input(contractUpdateInputSchema)
      .mutation(({ ctx, input }) => updateLedgerContract(ctx.user.id, input)),
    updateSchedule: protectedProcedure
      .input(scheduleUpdateInputSchema)
      .mutation(({ ctx, input }) => updateLedgerSchedule(ctx.user.id, input)),
    updateTransaction: protectedProcedure
      .input(transactionUpdateInputSchema)
      .mutation(({ ctx, input }) => updateLedgerTransaction(ctx.user.id, input)),
    deleteParty: protectedProcedure
      .input(ledgerIdInputSchema)
      .mutation(({ ctx, input }) => deleteLedgerParty(ctx.user.id, input.id)),
    deleteContract: protectedProcedure
      .input(ledgerIdInputSchema)
      .mutation(({ ctx, input }) => deleteLedgerContract(ctx.user.id, input.id)),
    deleteTransaction: protectedProcedure
      .input(ledgerIdInputSchema)
      .mutation(({ ctx, input }) => deleteLedgerTransaction(ctx.user.id, input.id)),
  }),
});

export type AppRouter = typeof appRouter;
