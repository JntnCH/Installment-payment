import axios from "axios";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  contractPaymentSchedules,
  contracts,
  ledgerTransactions,
  parties,
} from "../drizzle/schema";
import type {
  ContractInput,
  ContractUpdateInput,
  PartyInput,
  PartyUpdateInput,
  SchedulePaymentInput,
  ScheduleUpdateInput,
  TransactionInput,
  TransactionUpdateInput,
} from "../shared/ledgerSchemas";
import { getDb } from "./db";

const asAmount = (value: string | number | null | undefined) => Number(value ?? 0);
const asDate = (value: Date | string | null | undefined) => {
  if (!value) return "";
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
};
const asTimestamp = (value: Date | null | undefined) => (value ? value.toISOString() : "");

type PartyRow = typeof parties.$inferSelect;
type ContractRow = typeof contracts.$inferSelect;
type ScheduleRow = typeof contractPaymentSchedules.$inferSelect;
type TransactionRow = typeof ledgerTransactions.$inferSelect;

// In-memory fallback stores for local/preview environment when DATABASE_URL is not set
const memoryParties = new Map<string, PartyRow>();
const memoryContracts = new Map<string, ContractRow>();
const memorySchedules = new Map<string, ScheduleRow>();
const memoryTransactions = new Map<string, TransactionRow>();

let memoryInitialized = false;

function initializeMemoryStore(ownerId: number = 1) {
  if (memoryInitialized) return;
  memoryInitialized = true;

  const now = new Date();
  const party1Id = "demo-party-somchai";
  const party2Id = "demo-party-kanya";
  const party3Id = "demo-party-bank";

  // Debtor 1
  memoryParties.set(party1Id, {
    id: party1Id,
    ownerId,
    displayName: "สมชาย วัฒนากูล",
    role: "debtor",
    phone: "081-234-5678",
    note: "ลูกค้าผ่อนชำระโทรศัพท์มือถือและอุปกรณ์",
    status: "active",
    createdAt: now,
    updatedAt: now,
  });

  // Debtor 2
  memoryParties.set(party2Id, {
    id: party2Id,
    ownerId,
    displayName: "กัญญา อารีย์สุข",
    role: "debtor",
    phone: "089-876-5432",
    note: "ลูกค้าประจำ ผ่อนคอมพิวเตอร์โน้ตบุ๊ก",
    status: "active",
    createdAt: now,
    updatedAt: now,
  });

  // Creditor 1
  memoryParties.set(party3Id, {
    id: party3Id,
    ownerId,
    displayName: "ธนาคารพัฒนาการค้า",
    role: "creditor",
    phone: "02-123-4567",
    note: "วงเงินกู้หมุนเวียนธุรกิจระยะสั้น",
    status: "active",
    createdAt: now,
    updatedAt: now,
  });

  // Contract for Somchai
  const contract1Id = "demo-contract-phone";
  const startDate1 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  memoryContracts.set(contract1Id, {
    id: contract1Id,
    ownerId,
    partyId: party1Id,
    title: "สัญญาผ่อน iPhone 16 Pro 256GB",
    principal: "42000.00",
    interestRate: "0.0000",
    installmentCount: 6,
    startDate: startDate1,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });

  // Schedules for Somchai (6 installments: 1 paid, 1 today/due, 4 upcoming)
  const amount1 = "7000.00";
  for (let i = 1; i <= 6; i++) {
    const scheduleId = `demo-schedule-c1-${i}`;
    const scheduleDate = new Date(Date.now() + (i - 2) * 30 * 86400000).toISOString().slice(0, 10);
    const isPaid = i === 1;
    memorySchedules.set(scheduleId, {
      id: scheduleId,
      ownerId,
      partyId: party1Id,
      contractId: contract1Id,
      installmentNo: i,
      dueDate: scheduleDate,
      amount: amount1,
      paidAmount: isPaid ? amount1 : "0.00",
      status: isPaid ? "paid" : "pending",
      paidAt: isPaid ? new Date(Date.now() - 28 * 86400000) : null,
      note: `งวดที่ ${i}`,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Contract for Kanya
  const contract2Id = "demo-contract-laptop";
  const startDate2 = new Date().toISOString().slice(0, 10);
  memoryContracts.set(contract2Id, {
    id: contract2Id,
    ownerId,
    partyId: party2Id,
    title: "สัญญาผ่อน MacBook Air M3",
    principal: "39000.00",
    interestRate: "0.0000",
    installmentCount: 3,
    startDate: startDate2,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });

  // Schedules for Kanya
  for (let i = 1; i <= 3; i++) {
    const scheduleId = `demo-schedule-c2-${i}`;
    const scheduleDate = new Date(Date.now() + (i - 1) * 30 * 86400000).toISOString().slice(0, 10);
    memorySchedules.set(scheduleId, {
      id: scheduleId,
      ownerId,
      partyId: party2Id,
      contractId: contract2Id,
      installmentNo: i,
      dueDate: scheduleDate,
      amount: "13000.00",
      paidAmount: "0.00",
      status: "pending",
      paidAt: null,
      note: `งวดที่ ${i}`,
      createdAt: now,
      updatedAt: now,
    });
  }
}

function toParty(row: PartyRow) {
  return {
    partyId: row.id,
    displayName: row.displayName,
    role: row.role,
    phone: row.phone ?? "",
    note: row.note ?? "",
    status: row.status,
  };
}

function toContract(row: ContractRow) {
  return {
    contractId: row.id,
    partyId: row.partyId,
    title: row.title,
    principal: asAmount(row.principal),
    interestRate: asAmount(row.interestRate),
    installmentCount: row.installmentCount,
    startDate: asDate(row.startDate),
    status: row.status,
  };
}

function toScheduleTransaction(row: ScheduleRow) {
  return {
    transactionId: `schedule:${row.id}`,
    contractId: row.contractId,
    partyId: row.partyId,
    type: "scheduled" as const,
    amount: asAmount(row.amount),
    dueDate: asDate(row.dueDate),
    paidAt: asTimestamp(row.paidAt),
    source: "database:schedule",
    note: row.note ?? `งวดที่ ${row.installmentNo}`,
  };
}

function toLedgerTransaction(row: TransactionRow) {
  return {
    transactionId: row.id,
    contractId: row.contractId ?? "",
    partyId: row.partyId,
    type: row.type,
    amount: asAmount(row.amount),
    dueDate: "",
    paidAt: asTimestamp(row.occurredAt),
    source: row.source,
    note: row.note ?? "",
  };
}

async function getOwnedParty(ownerId: number, partyId: string) {
  const db = await getDb();
  if (db) {
    const [party] = await db
      .select()
      .from(parties)
      .where(and(eq(parties.ownerId, ownerId), eq(parties.id, partyId)))
      .limit(1);
    return party ?? null;
  }
  initializeMemoryStore(ownerId);
  const p = memoryParties.get(partyId);
  return p && p.ownerId === ownerId ? p : null;
}

async function getOwnedContract(ownerId: number, contractId: string) {
  const db = await getDb();
  if (db) {
    const [contract] = await db
      .select()
      .from(contracts)
      .where(and(eq(contracts.ownerId, ownerId), eq(contracts.id, contractId)))
      .limit(1);
    return contract ?? null;
  }
  initializeMemoryStore(ownerId);
  const c = memoryContracts.get(contractId);
  return c && c.ownerId === ownerId ? c : null;
}

export async function listLedgerParties(ownerId: number, role?: "debtor" | "creditor") {
  const db = await getDb();
  if (db) {
    const rows = await db
      .select()
      .from(parties)
      .where(role ? and(eq(parties.ownerId, ownerId), eq(parties.role, role)) : eq(parties.ownerId, ownerId))
      .orderBy(asc(parties.displayName));
    return rows.map(toParty);
  }

  initializeMemoryStore(ownerId);
  const result: PartyRow[] = [];
  for (const party of Array.from(memoryParties.values())) {
    if (party.ownerId === ownerId && (!role || party.role === role)) {
      result.push(party);
    }
  }
  result.sort((a, b) => a.displayName.localeCompare(b.displayName, "th"));
  return result.map(toParty);
}

export async function getPartyLedger(ownerId: number, partyId: string) {
  const party = await getOwnedParty(ownerId, partyId);
  if (!party) return null;

  const db = await getDb();
  if (db) {
    const partyContracts = await db
      .select()
      .from(contracts)
      .where(and(eq(contracts.ownerId, ownerId), eq(contracts.partyId, partyId)))
      .orderBy(desc(contracts.createdAt));
    const contractIds = partyContracts.map(contract => contract.id);
    const scheduleRows = contractIds.length
      ? await db
          .select()
          .from(contractPaymentSchedules)
          .where(and(eq(contractPaymentSchedules.ownerId, ownerId), inArray(contractPaymentSchedules.contractId, contractIds)))
          .orderBy(asc(contractPaymentSchedules.dueDate))
      : [];
    const transactionRows = await db
      .select()
      .from(ledgerTransactions)
      .where(and(eq(ledgerTransactions.ownerId, ownerId), eq(ledgerTransactions.partyId, partyId)))
      .orderBy(desc(ledgerTransactions.occurredAt));

    return {
      party: toParty(party),
      contracts: partyContracts.map(toContract),
      transactions: [...scheduleRows.map(toScheduleTransaction), ...transactionRows.map(toLedgerTransaction)],
    };
  }

  initializeMemoryStore(ownerId);
  const partyContracts: ContractRow[] = [];
  for (const c of Array.from(memoryContracts.values())) {
    if (c.ownerId === ownerId && c.partyId === partyId) {
      partyContracts.push(c);
    }
  }
  partyContracts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const contractIds = new Set(partyContracts.map(c => c.id));
  const scheduleRows: ScheduleRow[] = [];
  for (const s of Array.from(memorySchedules.values())) {
    if (s.ownerId === ownerId && contractIds.has(s.contractId)) {
      scheduleRows.push(s);
    }
  }
  scheduleRows.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const transactionRows: TransactionRow[] = [];
  for (const t of Array.from(memoryTransactions.values())) {
    if (t.ownerId === ownerId && t.partyId === partyId) {
      transactionRows.push(t);
    }
  }
  transactionRows.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  return {
    party: toParty(party),
    contracts: partyContracts.map(toContract),
    transactions: [...scheduleRows.map(toScheduleTransaction), ...transactionRows.map(toLedgerTransaction)],
  };
}

export async function getContractLedger(ownerId: number, contractId: string) {
  const contract = await getOwnedContract(ownerId, contractId);
  if (!contract) return null;
  const party = await getOwnedParty(ownerId, contract.partyId);

  const db = await getDb();
  if (db) {
    const schedules = await db
      .select()
      .from(contractPaymentSchedules)
      .where(and(eq(contractPaymentSchedules.ownerId, ownerId), eq(contractPaymentSchedules.contractId, contractId)))
      .orderBy(asc(contractPaymentSchedules.dueDate));
    const transactionRows = await db
      .select()
      .from(ledgerTransactions)
      .where(and(eq(ledgerTransactions.ownerId, ownerId), eq(ledgerTransactions.contractId, contractId)))
      .orderBy(desc(ledgerTransactions.occurredAt));

    return {
      party: party ? toParty(party) : null,
      contract: toContract(contract),
      transactions: [...schedules.map(toScheduleTransaction), ...transactionRows.map(toLedgerTransaction)],
    };
  }

  initializeMemoryStore(ownerId);
  const schedules: ScheduleRow[] = [];
  for (const s of Array.from(memorySchedules.values())) {
    if (s.ownerId === ownerId && s.contractId === contractId) {
      schedules.push(s);
    }
  }
  schedules.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const transactionRows: TransactionRow[] = [];
  for (const t of Array.from(memoryTransactions.values())) {
    if (t.ownerId === ownerId && t.contractId === contractId) {
      transactionRows.push(t);
    }
  }
  transactionRows.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  return {
    party: party ? toParty(party) : null,
    contract: toContract(contract),
    transactions: [...schedules.map(toScheduleTransaction), ...transactionRows.map(toLedgerTransaction)],
  };
}

export async function createLedgerParty(ownerId: number, input: PartyInput) {
  const db = await getDb();
  const id = crypto.randomUUID();
  const now = new Date();

  if (db) {
    await db.insert(parties).values({ id, ownerId, ...input, status: "active" });
    return getOwnedParty(ownerId, id).then(row => (row ? toParty(row) : null));
  }

  initializeMemoryStore(ownerId);
  const row: PartyRow = {
    id,
    ownerId,
    displayName: input.displayName,
    role: input.role,
    phone: input.phone || null,
    note: input.note || null,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  memoryParties.set(id, row);
  return toParty(row);
}

export async function updateLedgerParty(ownerId: number, input: PartyUpdateInput) {
  const db = await getDb();
  const party = await getOwnedParty(ownerId, input.id);
  if (!party) throw new Error("ไม่พบคู่สัญญาที่เลือก");

  if (db) {
    await db
      .update(parties)
      .set({
        ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
        ...(input.phone === undefined ? {} : { phone: input.phone || null }),
        ...(input.note === undefined ? {} : { note: input.note || null }),
        ...(input.status === undefined ? {} : { status: input.status }),
      })
      .where(and(eq(parties.ownerId, ownerId), eq(parties.id, input.id)));
    return getOwnedParty(ownerId, input.id).then(row => (row ? toParty(row) : null));
  }

  initializeMemoryStore(ownerId);
  const updated: PartyRow = {
    ...party,
    displayName: input.displayName ?? party.displayName,
    phone: input.phone !== undefined ? input.phone || null : party.phone,
    note: input.note !== undefined ? input.note || null : party.note,
    status: input.status ?? party.status,
    updatedAt: new Date(),
  };
  memoryParties.set(input.id, updated);
  return toParty(updated);
}

export async function createLedgerContract(ownerId: number, input: ContractInput) {
  const party = await getOwnedParty(ownerId, input.partyId);
  if (!party) throw new Error("ไม่พบคู่สัญญาที่เลือก");

  const contractId = crypto.randomUUID();
  const now = new Date();
  const db = await getDb();

  if (db) {
    await db.insert(contracts).values({
      id: contractId,
      ownerId,
      partyId: input.partyId,
      title: input.title,
      principal: input.principal.toFixed(2),
      interestRate: input.interestRate.toFixed(4),
      installmentCount: input.installmentCount,
      startDate: input.startDate,
      status: input.status,
    });

    if (input.schedules.length) {
      await db.insert(contractPaymentSchedules).values(
        input.schedules.map(schedule => ({
          id: crypto.randomUUID(),
          ownerId,
          partyId: input.partyId,
          contractId,
          installmentNo: schedule.installmentNo,
          dueDate: schedule.dueDate,
          amount: schedule.amount.toFixed(2),
          status: "pending" as const,
          note: schedule.note || null,
        }))
      );
    }

    return getContractLedger(ownerId, contractId);
  }

  initializeMemoryStore(ownerId);
  const contractRow: ContractRow = {
    id: contractId,
    ownerId,
    partyId: input.partyId,
    title: input.title,
    principal: input.principal.toFixed(2),
    interestRate: input.interestRate.toFixed(4),
    installmentCount: input.installmentCount,
    startDate: input.startDate,
    status: input.status,
    createdAt: now,
    updatedAt: now,
  };
  memoryContracts.set(contractId, contractRow);

  for (const s of input.schedules) {
    const sId = crypto.randomUUID();
    memorySchedules.set(sId, {
      id: sId,
      ownerId,
      partyId: input.partyId,
      contractId,
      installmentNo: s.installmentNo,
      dueDate: s.dueDate,
      amount: s.amount.toFixed(2),
      paidAmount: "0.00",
      status: "pending",
      paidAt: null,
      note: s.note || null,
      createdAt: now,
      updatedAt: now,
    });
  }

  return getContractLedger(ownerId, contractId);
}

export async function updateLedgerContract(ownerId: number, input: ContractUpdateInput) {
  const contract = await getOwnedContract(ownerId, input.id);
  if (!contract) throw new Error("ไม่พบสัญญาที่เลือก");

  const db = await getDb();
  if (db) {
    await db
      .update(contracts)
      .set({
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.principal === undefined ? {} : { principal: input.principal.toFixed(2) }),
        ...(input.interestRate === undefined ? {} : { interestRate: input.interestRate.toFixed(4) }),
        ...(input.installmentCount === undefined ? {} : { installmentCount: input.installmentCount }),
        ...(input.startDate === undefined ? {} : { startDate: input.startDate }),
        ...(input.status === undefined ? {} : { status: input.status }),
      })
      .where(and(eq(contracts.ownerId, ownerId), eq(contracts.id, input.id)));
    return getContractLedger(ownerId, input.id);
  }

  initializeMemoryStore(ownerId);
  const updated: ContractRow = {
    ...contract,
    title: input.title ?? contract.title,
    principal: input.principal !== undefined ? input.principal.toFixed(2) : contract.principal,
    interestRate: input.interestRate !== undefined ? input.interestRate.toFixed(4) : contract.interestRate,
    installmentCount: input.installmentCount ?? contract.installmentCount,
    startDate: input.startDate ?? contract.startDate,
    status: input.status ?? contract.status,
    updatedAt: new Date(),
  };
  memoryContracts.set(input.id, updated);
  return getContractLedger(ownerId, input.id);
}

export async function createLedgerTransaction(ownerId: number, input: TransactionInput) {
  const party = await getOwnedParty(ownerId, input.partyId);
  if (!party) throw new Error("ไม่พบคู่สัญญาที่เลือก");

  if (input.contractId) {
    const contract = await getOwnedContract(ownerId, input.contractId);
    if (!contract || contract.partyId !== input.partyId) throw new Error("สัญญาไม่สัมพันธ์กับคู่สัญญาที่เลือก");
  }

  const id = crypto.randomUUID();
  const occurredAt = input.occurredAt ?? new Date();
  const db = await getDb();

  if (db) {
    await db.insert(ledgerTransactions).values({
      id,
      ownerId,
      partyId: input.partyId,
      contractId: input.contractId ?? null,
      scheduleId: input.scheduleId ?? null,
      type: input.type,
      amount: input.amount.toFixed(2),
      occurredAt,
      source: input.source,
      note: input.note || null,
    });
    const [row] = await db
      .select()
      .from(ledgerTransactions)
      .where(and(eq(ledgerTransactions.ownerId, ownerId), eq(ledgerTransactions.id, id)))
      .limit(1);
    return row ? toLedgerTransaction(row) : null;
  }

  initializeMemoryStore(ownerId);
  const row: TransactionRow = {
    id,
    ownerId,
    partyId: input.partyId,
    contractId: input.contractId ?? null,
    scheduleId: input.scheduleId ?? null,
    type: input.type,
    amount: input.amount.toFixed(2),
    occurredAt,
    source: input.source,
    note: input.note || null,
    createdAt: new Date(),
  };
  memoryTransactions.set(id, row);
  return toLedgerTransaction(row);
}

export async function updateLedgerSchedule(ownerId: number, input: ScheduleUpdateInput) {
  const db = await getDb();
  if (db) {
    const [schedule] = await db
      .select()
      .from(contractPaymentSchedules)
      .where(and(eq(contractPaymentSchedules.ownerId, ownerId), eq(contractPaymentSchedules.id, input.id)))
      .limit(1);
    if (!schedule) throw new Error("ไม่พบงวดชำระที่เลือก");
    if (schedule.status !== "pending") throw new Error("แก้ไขได้เฉพาะงวดที่ยังรอชำระ");
    await db
      .update(contractPaymentSchedules)
      .set({
        ...(input.dueDate === undefined ? {} : { dueDate: input.dueDate }),
        ...(input.amount === undefined ? {} : { amount: input.amount.toFixed(2) }),
        ...(input.note === undefined ? {} : { note: input.note || null }),
      })
      .where(and(eq(contractPaymentSchedules.ownerId, ownerId), eq(contractPaymentSchedules.id, input.id)));
    const [updated] = await db
      .select()
      .from(contractPaymentSchedules)
      .where(and(eq(contractPaymentSchedules.ownerId, ownerId), eq(contractPaymentSchedules.id, input.id)))
      .limit(1);
    return updated ? toScheduleTransaction(updated) : null;
  }

  initializeMemoryStore(ownerId);
  const s = memorySchedules.get(input.id);
  if (!s || s.ownerId !== ownerId) throw new Error("ไม่พบงวดชำระที่เลือก");
  if (s.status !== "pending") throw new Error("แก้ไขได้เฉพาะงวดที่ยังรอชำระ");
  const updated: ScheduleRow = {
    ...s,
    dueDate: input.dueDate ?? s.dueDate,
    amount: input.amount !== undefined ? input.amount.toFixed(2) : s.amount,
    note: input.note !== undefined ? input.note || null : s.note,
    updatedAt: new Date(),
  };
  memorySchedules.set(input.id, updated);
  return toScheduleTransaction(updated);
}

export async function updateLedgerTransaction(ownerId: number, input: TransactionUpdateInput) {
  const db = await getDb();
  if (db) {
    const [transaction] = await db
      .select()
      .from(ledgerTransactions)
      .where(and(eq(ledgerTransactions.ownerId, ownerId), eq(ledgerTransactions.id, input.id)))
      .limit(1);
    if (!transaction) throw new Error("ไม่พบธุรกรรมที่เลือก");
    await db
      .update(ledgerTransactions)
      .set({
        ...(input.type === undefined ? {} : { type: input.type }),
        ...(input.amount === undefined ? {} : { amount: input.amount.toFixed(2) }),
        ...(input.occurredAt === undefined ? {} : { occurredAt: input.occurredAt }),
        ...(input.source === undefined ? {} : { source: input.source }),
        ...(input.note === undefined ? {} : { note: input.note || null }),
      })
      .where(and(eq(ledgerTransactions.ownerId, ownerId), eq(ledgerTransactions.id, input.id)));
    const [updated] = await db
      .select()
      .from(ledgerTransactions)
      .where(and(eq(ledgerTransactions.ownerId, ownerId), eq(ledgerTransactions.id, input.id)))
      .limit(1);
    return updated ? toLedgerTransaction(updated) : null;
  }

  initializeMemoryStore(ownerId);
  const t = memoryTransactions.get(input.id);
  if (!t || t.ownerId !== ownerId) throw new Error("ไม่พบธุรกรรมที่เลือก");
  const updated: TransactionRow = {
    ...t,
    type: input.type ?? t.type,
    amount: input.amount !== undefined ? input.amount.toFixed(2) : t.amount,
    occurredAt: input.occurredAt ?? t.occurredAt,
    source: input.source ?? t.source,
    note: input.note !== undefined ? input.note || null : t.note,
  };
  memoryTransactions.set(input.id, updated);
  return toLedgerTransaction(updated);
}

export async function markSchedulePaid(ownerId: number, input: SchedulePaymentInput) {
  const db = await getDb();
  const paidAt = input.paidAt ?? new Date();

  if (db) {
    const [schedule] = await db
      .select()
      .from(contractPaymentSchedules)
      .where(and(eq(contractPaymentSchedules.ownerId, ownerId), eq(contractPaymentSchedules.id, input.scheduleId)))
      .limit(1);
    if (!schedule) throw new Error("ไม่พบงวดชำระที่เลือก");

    await db
      .update(contractPaymentSchedules)
      .set({ status: "paid", paidAmount: input.paidAmount.toFixed(2), paidAt })
      .where(eq(contractPaymentSchedules.id, input.scheduleId));

    await createLedgerTransaction(ownerId, {
      partyId: schedule.partyId,
      contractId: schedule.contractId,
      scheduleId: schedule.id,
      type: "payment",
      amount: input.paidAmount,
      occurredAt: paidAt,
      source: input.source,
      note: input.note || `ชำระงวดที่ ${schedule.installmentNo}`,
    });
    const [updated] = await db
      .select()
      .from(contractPaymentSchedules)
      .where(eq(contractPaymentSchedules.id, input.scheduleId))
      .limit(1);
    return updated ? toScheduleTransaction(updated) : null;
  }

  initializeMemoryStore(ownerId);
  const s = memorySchedules.get(input.scheduleId);
  if (!s || s.ownerId !== ownerId) throw new Error("ไม่พบงวดชำระที่เลือก");

  const updated: ScheduleRow = {
    ...s,
    status: "paid",
    paidAmount: input.paidAmount.toFixed(2),
    paidAt,
    updatedAt: new Date(),
  };
  memorySchedules.set(input.scheduleId, updated);

  await createLedgerTransaction(ownerId, {
    partyId: s.partyId,
    contractId: s.contractId,
    scheduleId: s.id,
    type: "payment",
    amount: input.paidAmount,
    occurredAt: paidAt,
    source: input.source,
    note: input.note || `ชำระงวดที่ ${s.installmentNo}`,
  });

  return toScheduleTransaction(updated);
}

export async function deleteLedgerParty(ownerId: number, partyId: string) {
  const db = await getDb();
  if (db) {
    await db.delete(parties).where(and(eq(parties.ownerId, ownerId), eq(parties.id, partyId)));
    await db.delete(contracts).where(and(eq(contracts.ownerId, ownerId), eq(contracts.partyId, partyId)));
    await db.delete(contractPaymentSchedules).where(and(eq(contractPaymentSchedules.ownerId, ownerId), eq(contractPaymentSchedules.partyId, partyId)));
    await db.delete(ledgerTransactions).where(and(eq(ledgerTransactions.ownerId, ownerId), eq(ledgerTransactions.partyId, partyId)));
    return { success: true };
  }

  initializeMemoryStore(ownerId);
  memoryParties.delete(partyId);
  for (const [id, c] of Array.from(memoryContracts.entries())) {
    if (c.partyId === partyId) memoryContracts.delete(id);
  }
  for (const [id, s] of Array.from(memorySchedules.entries())) {
    if (s.partyId === partyId) memorySchedules.delete(id);
  }
  for (const [id, t] of Array.from(memoryTransactions.entries())) {
    if (t.partyId === partyId) memoryTransactions.delete(id);
  }
  return { success: true };
}

export async function deleteLedgerContract(ownerId: number, contractId: string) {
  const db = await getDb();
  if (db) {
    await db.delete(contracts).where(and(eq(contracts.ownerId, ownerId), eq(contracts.id, contractId)));
    await db.delete(contractPaymentSchedules).where(and(eq(contractPaymentSchedules.ownerId, ownerId), eq(contractPaymentSchedules.contractId, contractId)));
    await db.delete(ledgerTransactions).where(and(eq(ledgerTransactions.ownerId, ownerId), eq(ledgerTransactions.contractId, contractId)));
    return { success: true };
  }

  initializeMemoryStore(ownerId);
  memoryContracts.delete(contractId);
  for (const [id, s] of Array.from(memorySchedules.entries())) {
    if (s.contractId === contractId) memorySchedules.delete(id);
  }
  for (const [id, t] of Array.from(memoryTransactions.entries())) {
    if (t.contractId === contractId) memoryTransactions.delete(id);
  }
  return { success: true };
}

export async function deleteLedgerTransaction(ownerId: number, transactionId: string) {
  const db = await getDb();
  if (db) {
    await db.delete(ledgerTransactions).where(and(eq(ledgerTransactions.ownerId, ownerId), eq(ledgerTransactions.id, transactionId)));
    return { success: true };
  }

  initializeMemoryStore(ownerId);
  memoryTransactions.delete(transactionId);
  return { success: true };
}

export async function getDashboardStats(ownerId: number) {
  const allParties = await listLedgerParties(ownerId);
  const partyMap = new Map(allParties.map(p => [p.partyId, p]));

  const db = await getDb();
  let allContracts: ContractRow[] = [];
  let allSchedules: ScheduleRow[] = [];
  let allTransactions: TransactionRow[] = [];

  if (db) {
    allContracts = await db.select().from(contracts).where(eq(contracts.ownerId, ownerId));
    allSchedules = await db.select().from(contractPaymentSchedules).where(eq(contractPaymentSchedules.ownerId, ownerId));
    allTransactions = await db.select().from(ledgerTransactions).where(eq(ledgerTransactions.ownerId, ownerId));
  } else {
    initializeMemoryStore(ownerId);
    allContracts = Array.from(memoryContracts.values()).filter(c => c.ownerId === ownerId);
    allSchedules = Array.from(memorySchedules.values()).filter(s => s.ownerId === ownerId);
    allTransactions = Array.from(memoryTransactions.values()).filter(t => t.ownerId === ownerId);
  }

  const contractMap = new Map(allContracts.map(c => [c.id, c]));

  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  const todayMs = Date.parse(`${todayStr}T00:00:00+07:00`);

  let totalPrincipal = 0;
  let totalScheduled = 0;
  let totalCollected = 0;
  let totalOutstanding = 0;

  for (const c of allContracts) {
    totalPrincipal += asAmount(c.principal);
  }

  let overdueCount = 0;
  let overdueAmount = 0;
  let todayCount = 0;
  let todayAmount = 0;
  let soonCount = 0;
  let soonAmount = 0;

  const alerts: Array<{
    id: string;
    scheduleId: string;
    partyId: string;
    partyName: string;
    contractId: string;
    contractTitle: string;
    installmentNo: number;
    amount: number;
    dueDate: string;
    daysDiff: number;
    status: "overdue" | "today" | "soon";
  }> = [];

  for (const s of allSchedules) {
    const amount = asAmount(s.amount);
    const paidAmount = asAmount(s.paidAmount);
    totalScheduled += amount;
    totalCollected += paidAmount;

    if (s.status === "pending") {
      const remainingOnSchedule = Math.max(0, amount - paidAmount);
      totalOutstanding += remainingOnSchedule;

      const due = asDate(s.dueDate);
      if (due) {
        const dueMs = Date.parse(`${due}T00:00:00+07:00`);
        const daysDiff = Math.round((dueMs - todayMs) / 86_400_000);
        const party = partyMap.get(s.partyId);
        const contract = contractMap.get(s.contractId);

        if (daysDiff < 0) {
          overdueCount++;
          overdueAmount += remainingOnSchedule;
          alerts.push({
            id: `alert-overdue-${s.id}`,
            scheduleId: s.id,
            partyId: s.partyId,
            partyName: party?.displayName || "ไม่ระบุชื่อ",
            contractId: s.contractId,
            contractTitle: contract?.title || "สัญญาเงินกู้",
            installmentNo: s.installmentNo,
            amount: remainingOnSchedule,
            dueDate: due,
            daysDiff,
            status: "overdue",
          });
        } else if (daysDiff === 0) {
          todayCount++;
          todayAmount += remainingOnSchedule;
          alerts.push({
            id: `alert-today-${s.id}`,
            scheduleId: s.id,
            partyId: s.partyId,
            partyName: party?.displayName || "ไม่ระบุชื่อ",
            contractId: s.contractId,
            contractTitle: contract?.title || "สัญญาเงินกู้",
            installmentNo: s.installmentNo,
            amount: remainingOnSchedule,
            dueDate: due,
            daysDiff: 0,
            status: "today",
          });
        } else if (daysDiff <= 3) {
          soonCount++;
          soonAmount += remainingOnSchedule;
          alerts.push({
            id: `alert-soon-${s.id}`,
            scheduleId: s.id,
            partyId: s.partyId,
            partyName: party?.displayName || "ไม่ระบุชื่อ",
            contractId: s.contractId,
            contractTitle: contract?.title || "สัญญาเงินกู้",
            installmentNo: s.installmentNo,
            amount: remainingOnSchedule,
            dueDate: due,
            daysDiff,
            status: "soon",
          });
        }
      }
    }
  }

  alerts.sort((a, b) => a.daysDiff - b.daysDiff);

  const monthlyTimelineMap = new Map<string, { month: string; scheduled: number; collected: number; pending: number }>();
  for (const s of allSchedules) {
    const due = asDate(s.dueDate);
    const monthKey = due ? due.slice(0, 7) : "ไม่ระบุ";
    const current = monthlyTimelineMap.get(monthKey) || { month: monthKey, scheduled: 0, collected: 0, pending: 0 };
    const amt = asAmount(s.amount);
    const paid = asAmount(s.paidAmount);
    current.scheduled += amt;
    current.collected += paid;
    if (s.status === "pending") {
      current.pending += Math.max(0, amt - paid);
    }
    monthlyTimelineMap.set(monthKey, current);
  }

  const monthlyTimeline = Array.from(monthlyTimelineMap.values()).sort((a, b) => a.month.localeCompare(b.month));

  return {
    debtorCount: allParties.filter(p => p.role === "debtor").length,
    creditorCount: allParties.filter(p => p.role === "creditor").length,
    totalParties: allParties.length,
    totalContracts: allContracts.length,
    activeContracts: allContracts.filter(c => c.status === "active").length,
    totalPrincipal,
    totalScheduled,
    totalCollected,
    totalOutstanding,
    projectedInterest: Math.max(0, totalScheduled - totalPrincipal),
    overdue: { count: overdueCount, amount: overdueAmount },
    today: { count: todayCount, amount: todayAmount },
    soon: { count: soonCount, amount: soonAmount },
    alerts,
    monthlyTimeline,
    recentTransactions: allTransactions
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, 10)
      .map(toLedgerTransaction),
  };
}

export async function exportAllData(ownerId: number) {
  const allParties = await listLedgerParties(ownerId);
  const partyMap = new Map(allParties.map(p => [p.partyId, p]));

  const db = await getDb();
  let allContracts: ContractRow[] = [];
  let allSchedules: ScheduleRow[] = [];
  let allTransactions: TransactionRow[] = [];

  if (db) {
    allContracts = await db.select().from(contracts).where(eq(contracts.ownerId, ownerId));
    allSchedules = await db.select().from(contractPaymentSchedules).where(eq(contractPaymentSchedules.ownerId, ownerId));
    allTransactions = await db.select().from(ledgerTransactions).where(eq(ledgerTransactions.ownerId, ownerId));
  } else {
    initializeMemoryStore(ownerId);
    allContracts = Array.from(memoryContracts.values()).filter(c => c.ownerId === ownerId);
    allSchedules = Array.from(memorySchedules.values()).filter(s => s.ownerId === ownerId);
    allTransactions = Array.from(memoryTransactions.values()).filter(t => t.ownerId === ownerId);
  }

  const contractMap = new Map(allContracts.map(c => [c.id, c]));

  const enrichedContracts = allContracts.map(c => {
    const party = partyMap.get(c.partyId);
    return {
      contractId: c.id,
      partyId: c.partyId,
      customerName: party?.displayName || "—",
      customerRole: party?.role || "debtor",
      customerPhone: party?.phone || "—",
      title: c.title,
      principal: asAmount(c.principal),
      interestRate: asAmount(c.interestRate),
      installmentCount: c.installmentCount,
      startDate: asDate(c.startDate),
      status: c.status,
    };
  });

  const enrichedSchedules = allSchedules.map(s => {
    const party = partyMap.get(s.partyId);
    const contract = contractMap.get(s.contractId);
    return {
      scheduleId: s.id,
      partyName: party?.displayName || "—",
      partyPhone: party?.phone || "—",
      contractTitle: contract?.title || "—",
      installmentNo: s.installmentNo,
      dueDate: asDate(s.dueDate),
      amount: asAmount(s.amount),
      paidAmount: asAmount(s.paidAmount),
      status: s.status,
      paidAt: asTimestamp(s.paidAt),
      note: s.note || "",
    };
  });

  const enrichedTransactions = allTransactions.map(t => {
    const party = partyMap.get(t.partyId);
    const contract = t.contractId ? contractMap.get(t.contractId) : null;
    return {
      transactionId: t.id,
      partyName: party?.displayName || "—",
      contractTitle: contract?.title || "—",
      type: t.type,
      amount: asAmount(t.amount),
      occurredAt: asTimestamp(t.occurredAt),
      source: t.source,
      note: t.note || "",
    };
  });

  return {
    exportedAt: new Date().toISOString(),
    parties: allParties,
    contracts: enrichedContracts,
    schedules: enrichedSchedules,
    transactions: enrichedTransactions,
  };
}

export async function syncToGoogleSheetsWebhook(ownerId: number, webhookUrl: string, syncTarget: string = "all") {
  const axios = (await import("axios")).default;
  const payload = await exportAllData(ownerId);
  const stats = await getDashboardStats(ownerId);

  const requestBody = {
    timestamp: new Date().toISOString(),
    syncTarget,
    stats: {
      totalPrincipal: stats.totalPrincipal,
      totalScheduled: stats.totalScheduled,
      totalCollected: stats.totalCollected,
      totalOutstanding: stats.totalOutstanding,
      overdueCount: stats.overdue.count,
      overdueAmount: stats.overdue.amount,
      todayCount: stats.today.count,
      todayAmount: stats.today.amount,
    },
    parties: payload.parties,
    contracts: payload.contracts,
    schedules: payload.schedules,
    transactions: payload.transactions,
  };

  try {
    const response = await axios.post(webhookUrl, requestBody, {
      headers: { "Content-Type": "application/json" },
      timeout: 15000,
    });

    return {
      success: true,
      statusCode: response.status,
      message: "ซิงค์ข้อมูลกับ Google Sheet สำเร็จ",
      dataLength: {
        parties: payload.parties.length,
        contracts: payload.contracts.length,
        schedules: payload.schedules.length,
      },
    };
  } catch (err: any) {
    const errorMessage = err?.response?.data?.message || err?.message || "ไม่สามารถเชื่อมต่อกับ Google Apps Script Webhook ได้";
    return {
      success: false,
      statusCode: err?.response?.status || 500,
      message: `เกิดข้อผิดพลาดในการซิงค์: ${errorMessage}`,
    };
  }
}

/**
 * Call or test Dialogflow Cloud Run / Webhook service
 */
export async function callDialogflowServiceEndpoint(params: {
  endpointUrl: string;
  method?: "GET" | "POST" | "PUT";
  path?: string;
  authToken?: string;
  payload?: any;
}) {
  const method = params.method || "GET";
  const baseUrl = params.endpointUrl.replace(/\/$/, "");
  const subPath = params.path ? (params.path.startsWith("/") ? params.path : `/${params.path}`) : "";
  const fullUrl = `${baseUrl}${subPath}`;

  const headers: Record<string, string> = {
    "User-Agent": "DialogflowIntegration/1.0",
    Accept: "application/json, text/plain, */*",
  };

  if (params.payload && (method === "POST" || method === "PUT")) {
    headers["Content-Type"] = "application/json";
  }

  if (params.authToken) {
    const cleanToken = params.authToken.startsWith("Bearer ")
      ? params.authToken
      : `Bearer ${params.authToken}`;
    headers["Authorization"] = cleanToken;
  }

  const startTime = Date.now();

  try {
    const response = await axios({
      method,
      url: fullUrl,
      headers,
      data: params.payload,
      timeout: 20000,
      validateStatus: () => true, // Don't throw on 4xx/5xx so we can report status accurately
    });

    const elapsedMs = Date.now() - startTime;
    const isOk = response.status >= 200 && response.status < 300;

    let recommendation = "";
    if (response.status === 403) {
      recommendation =
        "Google Cloud Run ส่งรหัส 403 Forbidden เนื่องจาก Service มีการเปิดระบบความปลอดภัย (Require Authentication). วิธีแก้ไข: ไปที่ GCP Console > Cloud Run > เลือก Service 'income-expense-docker' > แท็บ Security / Ingress > เลือก 'Allow unauthenticated invocations' หรือส่ง Bearer ID Token มาในคำขอ";
    } else if (response.status === 404) {
      recommendation =
        `ไม่พบ Path (${subPath || "/"}) บนเซิร์ฟเวอร์ กรุณาตรวจสอบ Routing (เช่น /webhook, /api/summary/balance หรือ /)`;
    } else if (isOk) {
      recommendation = "เชื่อมต่อและรับข้อมูลจาก Dialogflow Service สำเร็จ!";
    }

    return {
      success: isOk,
      url: fullUrl,
      method,
      statusCode: response.status,
      statusText: response.statusText,
      elapsedMs,
      contentType: response.headers["content-type"] || "",
      data: response.data,
      recommendation,
    };
  } catch (err: any) {
    const elapsedMs = Date.now() - startTime;
    return {
      success: false,
      url: fullUrl,
      method,
      statusCode: err?.response?.status || 0,
      statusText: err?.message || "Network Error",
      elapsedMs,
      contentType: "",
      data: err?.response?.data || null,
      recommendation: `ไม่สามารถเชื่อมต่อไปยัง ${fullUrl}: ${err.message}`,
    };
  }
}

