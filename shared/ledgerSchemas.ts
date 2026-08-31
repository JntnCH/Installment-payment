import { z } from "zod";

export const partyRoleSchema = z.enum(["debtor", "creditor"]);
export const transactionTypeSchema = z.enum(["disbursement", "payment", "adjustment"]);
export const contractStatusSchema = z.enum(["active", "completed", "cancelled"]);
export const scheduleStatusSchema = z.enum(["pending", "paid", "waived"]);

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่ต้องอยู่ในรูปแบบ YYYY-MM-DD")
  .refine(value => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "วันที่ไม่ถูกต้อง");

export const partyInputSchema = z.object({
  displayName: z.string().trim().min(1, "โปรดระบุชื่อคู่สัญญา").max(160),
  role: partyRoleSchema,
  phone: z.string().trim().max(32).optional().default(""),
  note: z.string().trim().max(2_000).optional().default(""),
});

export const scheduleInputSchema = z.object({
  installmentNo: z.number().int().positive(),
  dueDate: isoDateSchema,
  amount: z.number().finite().positive(),
  note: z.string().trim().max(1_000).optional().default(""),
});

export const contractInputSchema = z.object({
  partyId: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1, "โปรดระบุชื่อสัญญา").max(255),
  principal: z.number().finite().positive(),
  interestRate: z.number().finite().min(0).max(1_000).default(0),
  installmentCount: z.number().int().positive().max(1_000),
  startDate: isoDateSchema,
  status: contractStatusSchema.default("active"),
  schedules: z.array(scheduleInputSchema).max(1_000).optional().default([]),
});

export const transactionInputSchema = z.object({
  partyId: z.string().trim().min(1).max(64),
  contractId: z.string().trim().min(1).max(64).optional(),
  scheduleId: z.string().trim().min(1).max(64).optional(),
  type: transactionTypeSchema,
  amount: z.number().finite().positive(),
  occurredAt: z.coerce.date().optional(),
  source: z.string().trim().max(64).optional().default("manual"),
  note: z.string().trim().max(2_000).optional().default(""),
});

export const schedulePaymentInputSchema = z.object({
  scheduleId: z.string().trim().min(1).max(64),
  paidAmount: z.number().finite().positive(),
  paidAt: z.coerce.date().optional(),
  source: z.string().trim().max(64).optional().default("manual"),
  note: z.string().trim().max(2_000).optional().default(""),
});

export const ledgerIdInputSchema = z.object({
  id: z.string().trim().min(1).max(64),
});

export const partyUpdateInputSchema = z.object({
  id: z.string().trim().min(1).max(64),
  displayName: z.string().trim().min(1).max(160).optional(),
  role: partyRoleSchema.optional(),
  phone: z.string().trim().max(32).optional(),
  note: z.string().trim().max(2_000).optional(),
  status: z.enum(["active", "archived"]).optional(),
}).refine(input => input.displayName !== undefined || input.role !== undefined || input.phone !== undefined || input.note !== undefined || input.status !== undefined, "โปรดระบุข้อมูลที่ต้องการแก้ไข");

export const contractUpdateInputSchema = z.object({
  id: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(255).optional(),
  principal: z.number().finite().positive().optional(),
  interestRate: z.number().finite().min(0).max(1_000).optional(),
  installmentCount: z.number().int().positive().max(1_000).optional(),
  startDate: isoDateSchema.optional(),
  status: contractStatusSchema.optional(),
}).refine(input => Object.keys(input).some(key => key !== "id"), "โปรดระบุข้อมูลที่ต้องการแก้ไข");

export const scheduleUpdateInputSchema = z.object({
  id: z.string().trim().min(1).max(64),
  dueDate: isoDateSchema.optional(),
  amount: z.number().finite().positive().optional(),
  note: z.string().trim().max(1_000).optional(),
}).refine(input => input.dueDate !== undefined || input.amount !== undefined || input.note !== undefined, "โปรดระบุข้อมูลที่ต้องการแก้ไข");

export const transactionUpdateInputSchema = z.object({
  id: z.string().trim().min(1).max(64),
  type: transactionTypeSchema.optional(),
  amount: z.number().finite().positive().optional(),
  occurredAt: z.coerce.date().optional(),
  source: z.string().trim().min(1).max(64).optional(),
  note: z.string().trim().max(2_000).optional(),
}).refine(input => Object.keys(input).some(key => key !== "id"), "โปรดระบุข้อมูลที่ต้องการแก้ไข");

export const webhookSyncInputSchema = z.object({
  webhookUrl: z.string().trim().url("โปรดระบุ URL ของ Google Apps Script หรือ Webhook ที่ถูกต้อง"),
  syncTarget: z.enum(["all", "summary", "schedules", "parties"]).default("all"),
});

export const batchScheduleGenerateInputSchema = z.object({
  partyId: z.string().trim().min(1).max(64),
  contractTitle: z.string().trim().min(1).max(255),
  loanType: z.enum(["daily_informal", "floating_interest", "flat_installment", "effective_amortization"]),
  principal: z.number().finite().positive(),
  interestRate: z.number().finite().min(0),
  installmentCount: z.number().int().positive().max(365),
  startDate: isoDateSchema,
  frequency: z.enum(["daily", "weekly", "biweekly", "monthly"]).default("monthly"),
  skipSundays: z.boolean().optional().default(false),
  feeAmount: z.number().finite().min(0).optional().default(0),
  firstDeductAmount: z.number().finite().min(0).optional().default(0),
});

export const dialogflowServiceSchema = z.object({
  endpointUrl: z.string().trim().url("โปรดระบุ URL ของ Dialogflow Service ให้ถูกต้อง"),
  method: z.enum(["GET", "POST", "PUT"]).default("GET"),
  path: z.string().trim().default(""),
  authToken: z.string().trim().optional(),
  payload: z.any().optional(),
});

export type DialogflowServiceInput = z.infer<typeof dialogflowServiceSchema>;

export type PartyInput = z.infer<typeof partyInputSchema>;
export type ContractInput = z.infer<typeof contractInputSchema>;
export type TransactionInput = z.infer<typeof transactionInputSchema>;
export type SchedulePaymentInput = z.infer<typeof schedulePaymentInputSchema>;
export type PartyUpdateInput = z.infer<typeof partyUpdateInputSchema>;
export type ContractUpdateInput = z.infer<typeof contractUpdateInputSchema>;
export type ScheduleUpdateInput = z.infer<typeof scheduleUpdateInputSchema>;
export type TransactionUpdateInput = z.infer<typeof transactionUpdateInputSchema>;
export type WebhookSyncInput = z.infer<typeof webhookSyncInputSchema>;
export type BatchScheduleGenerateInput = z.infer<typeof batchScheduleGenerateInputSchema>;
