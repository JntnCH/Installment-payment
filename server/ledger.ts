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
