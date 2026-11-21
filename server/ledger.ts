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
import { uploadReceiptToGoogleDrive } from "./googleDrive";

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

// In-memory fallback stores when DATABASE_URL is not set. They start empty by design.
const memoryParties = new Map<string, PartyRow>();
const memoryContracts = new Map<string, ContractRow>();
const memorySchedules = new Map<string, ScheduleRow>();
const memoryTransactions = new Map<string, TransactionRow>();

function toParty(row: PartyRow) {
  return {
    partyId: row.id,
    displayName: row.displayName,
    role: row.role,
    phone: row.phone ?? "",
    note: row.note ?? "",
    status: row.status,
    createdAt: asTimestamp(row.createdAt),
    updatedAt: asTimestamp(row.updatedAt),
  };
}

function toContract(row: ContractRow) {
  return {
    contractId: row.id,
    partyId: row.partyId,
    title: row.title,
    principal: asAmount(row.principal),
    downPayment: asAmount(row.downPayment),
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
    installmentNo: row.installmentNo,
    amount: asAmount(row.amount),
    paidAmount: asAmount(row.paidAmount),
    status: row.status,
    dueDate: asDate(row.dueDate),
    paidAt: asTimestamp(row.paidAt),
    source: "database:schedule",
    note: row.note ?? `งวดที่ ${row.installmentNo}`,
    receiptKey: "",
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
    receiptKey: row.receiptKey ?? "",
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
  const result: PartyRow[] = [];
  for (const party of Array.from(memoryParties.values())) {
    if (party.ownerId === ownerId && (!role || party.role === role)) {
      result.push(party);
    }
  }
  result.sort((a, b) => a.displayName.localeCompare(b.displayName, "th"));
  return result.map(toParty);
}

export async function listLedgerPartiesWithContracts(ownerId: number, role?: "debtor" | "creditor") {
  const partyRows = await listLedgerParties(ownerId, role);
  if (partyRows.length === 0) return [];

  const db = await getDb();
  const partyIds = partyRows.map(party => party.partyId);
  const contractsByParty = new Map<string, string[]>();

  if (db) {
    const contractRows = await db
      .select({ partyId: contracts.partyId, title: contracts.title })
      .from(contracts)
      .where(and(eq(contracts.ownerId, ownerId), inArray(contracts.partyId, partyIds)));

    for (const contract of contractRows) {
      const titles = contractsByParty.get(contract.partyId) ?? [];
      titles.push(contract.title);
      contractsByParty.set(contract.partyId, titles);
    }
  } else {
    const ownedPartyIds = new Set(partyIds);
    for (const contract of memoryContracts.values()) {
      if (contract.ownerId !== ownerId || !ownedPartyIds.has(contract.partyId)) continue;
      const titles = contractsByParty.get(contract.partyId) ?? [];
      titles.push(contract.title);
      contractsByParty.set(contract.partyId, titles);
    }
  }

  return partyRows.map(party => ({
    party,
    contractTitles: contractsByParty.get(party.partyId) ?? [],
  }));
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
          .orderBy(asc(contractPaymentSchedules.installmentNo))
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
  scheduleRows.sort((a, b) => a.installmentNo - b.installmentNo);

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
      .orderBy(asc(contractPaymentSchedules.installmentNo));
    const transactionRows = await db
      .select()
      .from(ledgerTransactions)
      .where(and(eq(ledgerTransactions.ownerId, ownerId), eq(ledgerTransactions.contractId, contractId)))
      .orderBy(desc(ledgerTransactions.occurredAt));

    return {
      party: party ? toParty(party) : null,
      contract: toContract(contract),
      transactions: [...schedules.map(schedule => ({
        ...toScheduleTransaction(schedule),
        receiptKey: transactionRows.find(tx => tx.scheduleId === schedule.id && tx.receiptKey)?.receiptKey ?? "",
      })), ...transactionRows.map(toLedgerTransaction)],
    };
  }
  const schedules: ScheduleRow[] = [];
  for (const s of Array.from(memorySchedules.values())) {
    if (s.ownerId === ownerId && s.contractId === contractId) {
      schedules.push(s);
    }
  }
  schedules.sort((a, b) => a.installmentNo - b.installmentNo);

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
    transactions: [...schedules.map(schedule => ({
      ...toScheduleTransaction(schedule),
      receiptKey: transactionRows.find(tx => tx.scheduleId === schedule.id && tx.receiptKey)?.receiptKey ?? "",
    })), ...transactionRows.map(toLedgerTransaction)],
  };
}

export async function createLedgerParty(ownerId: number, input: PartyInput) {
  const db = await getDb();
  const id = crypto.randomUUID();
  const now = new Date();

  if (db) {
    try {
      // Avoid a duplicate insert when the client retries the same save.
      const [existing] = await db
        .select()
        .from(parties)
        .where(
          and(
            eq(parties.ownerId, ownerId),
            eq(parties.role, input.role),
            eq(parties.displayName, input.displayName)
          )
        )
        .limit(1);

      if (existing) return toParty(existing);

      await db.insert(parties).values({
        id,
        ownerId,
        displayName: input.displayName,
        role: input.role,
        phone: input.phone || null,
        note: input.note || null,
        status: "active",
      });
      return getOwnedParty(ownerId, id).then(row => (row ? toParty(row) : null));
    } catch (error) {
      const dbError = error as {
        code?: string;
        errno?: number;
        sqlMessage?: string;
        message?: string;
      };
      console.error("[Ledger] createLedgerParty database insert failed", {
        code: dbError.code,
        errno: dbError.errno,
        sqlMessage: dbError.sqlMessage,
        message: dbError.message,
      });

      // Another request may have inserted the same party between the lookup and insert.
      if (dbError.code === "ER_DUP_ENTRY" || dbError.errno === 1062) {
        const [existing] = await db
          .select()
          .from(parties)
          .where(
            and(
              eq(parties.ownerId, ownerId),
              eq(parties.role, input.role),
              eq(parties.displayName, input.displayName)
            )
          )
          .limit(1);
        if (existing) return toParty(existing);
      }
      throw error;
    }
  }
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
        ...(input.role === undefined ? {} : { role: input.role }),
        ...(input.phone === undefined ? {} : { phone: input.phone || null }),
        ...(input.note === undefined ? {} : { note: input.note || null }),
        ...(input.status === undefined ? {} : { status: input.status }),
      })
      .where(and(eq(parties.ownerId, ownerId), eq(parties.id, input.id)));
    return getOwnedParty(ownerId, input.id).then(row => (row ? toParty(row) : null));
  }
  const updated: PartyRow = {
    ...party,
    displayName: input.displayName ?? party.displayName,
    role: input.role ?? party.role,
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

  // Product installment contracts use a gross principal and deduct the down payment before interest.
  // Debt/loan contracts now create with downPayment = 0.
  const downPayment = input.downPayment || 0;
  if (downPayment > input.principal) throw new Error("เงินดาวน์ต้องไม่เกินราคา/เงินต้นตามสัญญา");
  const totalCents = Math.round(((input.principal - downPayment) * (1 + (input.interestRate || 0) / 100)) * 100);
  if (totalCents <= 0) throw new Error("ยอดเงินหลังหักเงินดาวน์ต้องมากกว่า 0 บาท");
  const count = Math.max(1, input.installmentCount || 1);
  const suppliedSchedules = input.schedules ?? [];
  const [baseYear, baseMonth, baseDay] = (input.startDate || new Date().toISOString().slice(0, 10)).split("-").map(Number);
  const baseDate = new Date(baseYear, baseMonth - 1, baseDay || 1);
  const baseCents = Math.floor(totalCents / count);
  let remainderCents = totalCents;
  const schedulesToInsert = Array.from({ length: count }, (_, index) => {
    const supplied = suppliedSchedules[index];
    const due = supplied?.dueDate
      ? supplied.dueDate
      : (() => {
          const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + index, baseDate.getDate());
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        })();
    const amountCents = index === count - 1 ? remainderCents : baseCents;
    remainderCents -= amountCents;
    return {
      installmentNo: index + 1,
      dueDate: due,
      amount: amountCents / 100,
      note: supplied?.note || `งวดที่ ${index + 1}/${count}`,
    };
  });

  if (db) {
    await db.insert(contracts).values({
      id: contractId,
      ownerId,
      partyId: input.partyId,
      title: input.title,
      principal: input.principal.toFixed(2),
      downPayment: (input.downPayment || 0).toFixed(2),
      interestRate: input.interestRate.toFixed(4),
      installmentCount: input.installmentCount,
      startDate: input.startDate,
      status: input.status,
    });

    if (schedulesToInsert.length) {
      await db.insert(contractPaymentSchedules).values(
        schedulesToInsert.map((schedule) => ({
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
  const contractRow: ContractRow = {
    id: contractId,
    ownerId,
    partyId: input.partyId,
    title: input.title,
    principal: input.principal.toFixed(2),
    downPayment: (input.downPayment || 0).toFixed(2),
    interestRate: input.interestRate.toFixed(4),
    installmentCount: input.installmentCount,
    startDate: input.startDate,
    status: input.status,
    createdAt: now,
    updatedAt: now,
  };
  memoryContracts.set(contractId, contractRow);

  for (const s of schedulesToInsert) {
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

  const principal = input.principal ?? asAmount(contract.principal);
  const interestRate = input.interestRate ?? asAmount(contract.interestRate);
  const downPayment = input.downPayment ?? asAmount(contract.downPayment);
  const installmentCount = input.installmentCount ?? contract.installmentCount;
  // Product contracts are created with the "ผ่อน " title prefix. Keep legacy debt formulas unchanged.
  const isProductInstallment = (input.title ?? contract.title).startsWith("ผ่อน ");
  if (isProductInstallment && downPayment > principal) {
    throw new Error("เงินดาวน์ต้องไม่เกินราคา/เงินต้นตามสัญญา");
  }
  if (!isProductInstallment && downPayment > principal * (1 + interestRate / 100)) {
    throw new Error("เงินดาวน์ต้องไม่เกินยอดรวมสัญญา");
  }
  const totalCents = Math.round((isProductInstallment
    ? (principal - downPayment) * (1 + interestRate / 100)
    : principal * (1 + interestRate / 100) - downPayment) * 100);
  if (totalCents <= 0) throw new Error("ยอดเงินหลังหักเงินดาวน์ต้องมากกว่า 0 บาท");

  const db = await getDb();
  const nextContractValues = {
    ...(input.title === undefined ? {} : { title: input.title }),
    principal: principal.toFixed(2),
    downPayment: downPayment.toFixed(2),
    interestRate: interestRate.toFixed(4),
    installmentCount,
    ...(input.startDate === undefined ? {} : { startDate: input.startDate }),
    ...(input.status === undefined ? {} : { status: input.status }),
  };

  if (db) {
    await db.transaction(async tx => {
      const rows = await tx.select().from(contractPaymentSchedules)
        .where(and(eq(contractPaymentSchedules.ownerId, ownerId), eq(contractPaymentSchedules.contractId, input.id)))
        .orderBy(asc(contractPaymentSchedules.installmentNo));

      const closedRows = rows.filter(row => row.status === "paid" || row.status === "waived");
      const openRows = rows.filter(row => row.status === "pending");
      const paidCents = rows.reduce((sum, row) => {
        if (row.status === "waived") return sum;
        const amountCents = Math.max(0, Math.round(asAmount(row.amount) * 100));
        const recordedPaid = Math.max(0, Math.round(asAmount(row.paidAmount) * 100));
        return sum + (row.status === "paid" ? Math.max(amountCents, recordedPaid) : recordedPaid);
      }, 0);
      let remainingCents = totalCents - paidCents;
      if (remainingCents < 0) throw new Error("ยอดสัญญาใหม่ต่ำกว่ายอดที่ชำระสะสมแล้ว กรุณาตรวจสอบยอดเงินต้น ดอกเบี้ย และเงินดาวน์");
      const partialRows = openRows.filter(row => asAmount(row.paidAmount) > 0);
      const desiredOpenCount = installmentCount - closedRows.length;
      if (desiredOpenCount < partialRows.length || desiredOpenCount < 0) {
        throw new Error("จำนวนงวดใหม่ต้องไม่น้อยกว่างวดที่ชำระแล้วหรือมีประวัติชำระบางส่วน");
      }
      if (desiredOpenCount === 0 && remainingCents > 0) {
        throw new Error("ยังมียอดคงเหลือ แต่จำนวนงวดใหม่ไม่เหลือสำหรับกระจายยอด");
      }
      if (desiredOpenCount > 0 && remainingCents < desiredOpenCount) {
        throw new Error("ยอดคงเหลือไม่เพียงพอสำหรับจำนวนงวดใหม่ กรุณาลดจำนวนงวดหรือปรับยอดสัญญา");
      }

      const flexibleRows = openRows.filter(row => asAmount(row.paidAmount) <= 0);
      const keepRows = [...partialRows, ...flexibleRows].slice(0, desiredOpenCount);
      const removeRows = [...partialRows, ...flexibleRows].slice(desiredOpenCount);
      if (removeRows.some(row => asAmount(row.paidAmount) > 0)) {
        throw new Error("ไม่สามารถลบงวดที่มีประวัติชำระเงินได้");
      }
      for (const row of removeRows) {
        await tx.delete(contractPaymentSchedules).where(eq(contractPaymentSchedules.id, row.id));
      }

      let latestDate = rows.reduce((latest, row) => row.dueDate > latest ? row.dueDate : latest, contract.startDate);
      const orderedDueDates = rows.map(row => row.dueDate).sort();
      const scheduleIntervalDays = orderedDueDates.length > 1
        ? Math.max(1, Math.round((new Date(`${orderedDueDates[orderedDueDates.length - 1]}T00:00:00`).getTime() - new Date(`${orderedDueDates[orderedDueDates.length - 2]}T00:00:00`).getTime()) / 86_400_000))
        : 30;
      let nextInstallmentNo = rows.reduce((max, row) => Math.max(max, row.installmentNo), 0) + 1;
      while (keepRows.length < desiredOpenCount) {
        const previous = new Date(`${latestDate}T00:00:00`);
        const next = scheduleIntervalDays >= 25
          ? new Date(previous.getFullYear(), previous.getMonth() + 1, previous.getDate())
          : new Date(previous.getFullYear(), previous.getMonth(), previous.getDate() + scheduleIntervalDays);
        latestDate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
        const newRow = {
          id: crypto.randomUUID(), ownerId, partyId: contract.partyId, contractId: input.id,
          installmentNo: nextInstallmentNo++, dueDate: latestDate, amount: "0.00", paidAmount: "0.00",
          status: "pending" as const, paidAt: null, note: `งวดที่ ${keepRows.length + 1}/${installmentCount}`,
        };
        await tx.insert(contractPaymentSchedules).values(newRow);
        keepRows.push(newRow as typeof rows[number]);
      }

      const baseAllocation = desiredOpenCount > 0 ? Math.floor(remainingCents / desiredOpenCount) : 0;
      let allocated = 0;
      for (let index = 0; index < keepRows.length; index++) {
        const row = keepRows[index];
        const alreadyPaid = Math.max(0, Math.round(asAmount(row.paidAmount) * 100));
        const allocation = index === keepRows.length - 1 ? remainingCents - allocated : baseAllocation;
        allocated += allocation;
        await tx.update(contractPaymentSchedules).set({
          amount: ((alreadyPaid + allocation) / 100).toFixed(2),
          note: row.note || `งวดที่ ${index + 1}/${installmentCount}`,
        }).where(eq(contractPaymentSchedules.id, row.id));
      }

      await tx.update(contracts).set(nextContractValues)
        .where(and(eq(contracts.ownerId, ownerId), eq(contracts.id, input.id)));
    });
    return getContractLedger(ownerId, input.id);
  }

  const rows = Array.from(memorySchedules.values())
    .filter(row => row.ownerId === ownerId && row.contractId === input.id)
    .sort((a, b) => a.installmentNo - b.installmentNo);
  const closedRows = rows.filter(row => row.status === "paid" || row.status === "waived");
  const openRows = rows.filter(row => row.status === "pending");
  const paidCents = rows.reduce((sum, row) => {
    if (row.status === "waived") return sum;
    const amountCents = Math.max(0, Math.round(asAmount(row.amount) * 100));
    const recordedPaid = Math.max(0, Math.round(asAmount(row.paidAmount) * 100));
    return sum + (row.status === "paid" ? Math.max(amountCents, recordedPaid) : recordedPaid);
  }, 0);
  let remainingCents = totalCents - paidCents;
  if (remainingCents < 0) throw new Error("ยอดสัญญาใหม่ต่ำกว่ายอดที่ชำระสะสมแล้ว กรุณาตรวจสอบยอดเงินต้น ดอกเบี้ย และเงินดาวน์");
  const partialRows = openRows.filter(row => asAmount(row.paidAmount) > 0);
  const desiredOpenCount = installmentCount - closedRows.length;
  if (desiredOpenCount < partialRows.length || desiredOpenCount < 0) throw new Error("จำนวนงวดใหม่ต้องไม่น้อยกว่างวดที่ชำระแล้วหรือมีประวัติชำระบางส่วน");
  if (desiredOpenCount === 0 && remainingCents > 0) throw new Error("ยังมียอดคงเหลือ แต่จำนวนงวดใหม่ไม่เหลือสำหรับกระจายยอด");
  if (desiredOpenCount > 0 && remainingCents < desiredOpenCount) throw new Error("ยอดคงเหลือไม่เพียงพอสำหรับจำนวนงวดใหม่ กรุณาลดจำนวนงวดหรือปรับยอดสัญญา");
  const flexibleRows = openRows.filter(row => asAmount(row.paidAmount) <= 0);
  const keepRows = [...partialRows, ...flexibleRows].slice(0, desiredOpenCount);
  const removeRows = [...partialRows, ...flexibleRows].slice(desiredOpenCount);
  if (removeRows.some(row => asAmount(row.paidAmount) > 0)) throw new Error("ไม่สามารถลบงวดที่มีประวัติชำระเงินได้");
  for (const row of removeRows) memorySchedules.delete(row.id);
  let latestDate = rows.reduce((latest, row) => row.dueDate > latest ? row.dueDate : latest, contract.startDate);
  const orderedDueDates = rows.map(row => row.dueDate).sort();
  const scheduleIntervalDays = orderedDueDates.length > 1
    ? Math.max(1, Math.round((new Date(`${orderedDueDates[orderedDueDates.length - 1]}T00:00:00`).getTime() - new Date(`${orderedDueDates[orderedDueDates.length - 2]}T00:00:00`).getTime()) / 86_400_000))
    : 30;
  let nextInstallmentNo = rows.reduce((max, row) => Math.max(max, row.installmentNo), 0) + 1;
  while (keepRows.length < desiredOpenCount) {
    const previous = new Date(`${latestDate}T00:00:00`);
    const next = scheduleIntervalDays >= 25
      ? new Date(previous.getFullYear(), previous.getMonth() + 1, previous.getDate())
      : new Date(previous.getFullYear(), previous.getMonth(), previous.getDate() + scheduleIntervalDays);
    latestDate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
    const id = crypto.randomUUID();
    const row: ScheduleRow = {
      id, ownerId, partyId: contract.partyId, contractId: input.id, installmentNo: nextInstallmentNo++,
      dueDate: latestDate, amount: "0.00", paidAmount: "0.00", status: "pending", paidAt: null,
      note: `งวดที่ ${keepRows.length + 1}/${installmentCount}`, createdAt: new Date(), updatedAt: new Date(),
    };
    memorySchedules.set(id, row);
    keepRows.push(row);
  }
  const baseAllocation = desiredOpenCount > 0 ? Math.floor(remainingCents / desiredOpenCount) : 0;
  let allocated = 0;
  for (let index = 0; index < keepRows.length; index++) {
    const row = keepRows[index];
    const alreadyPaid = Math.max(0, Math.round(asAmount(row.paidAmount) * 100));
    const allocation = index === keepRows.length - 1 ? remainingCents - allocated : baseAllocation;
    allocated += allocation;
    memorySchedules.set(row.id, {
      ...row, amount: ((alreadyPaid + allocation) / 100).toFixed(2),
      note: row.note || `งวดที่ ${index + 1}/${installmentCount}`, updatedAt: new Date(),
    });
  }
  const updated: ContractRow = {
    ...contract,
    title: input.title ?? contract.title,
    principal: principal.toFixed(2),
    downPayment: downPayment.toFixed(2),
    interestRate: interestRate.toFixed(4),
    installmentCount,
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
      receiptKey: input.receiptKey ?? null,
    });
    const [row] = await db
      .select()
      .from(ledgerTransactions)
      .where(and(eq(ledgerTransactions.ownerId, ownerId), eq(ledgerTransactions.id, id)))
      .limit(1);
    return row ? toLedgerTransaction(row) : null;
  }
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
    receiptKey: input.receiptKey ?? null,
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
    if (schedule.status === "waived") throw new Error("ไม่สามารถแก้ไขงวดที่ยกเว้นชำระแล้ว");
    const currentAmountCents = Math.max(0, Math.round(asAmount(schedule.amount) * 100));
    const recordedPaidCents = Math.max(0, Math.round(asAmount(schedule.paidAmount) * 100));
    const paidCents = schedule.status === "paid" ? Math.max(currentAmountCents, recordedPaidCents) : recordedPaidCents || (schedule.paidAt ? currentAmountCents : 0);
    const nextAmountCents = input.amount === undefined ? currentAmountCents : Math.round(input.amount * 100);
    if (nextAmountCents < paidCents) throw new Error("ยอดงวดใหม่ต้องไม่น้อยกว่ายอดที่ชำระไปแล้ว");
    await db
      .update(contractPaymentSchedules)
      .set({
        ...(input.dueDate === undefined ? {} : { dueDate: input.dueDate }),
        ...(input.amount === undefined ? {} : { amount: (nextAmountCents / 100).toFixed(2) }),
        paidAmount: (paidCents / 100).toFixed(2),
        status: nextAmountCents <= paidCents ? "paid" : "pending",
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
  const s = memorySchedules.get(input.id);
  if (!s || s.ownerId !== ownerId) throw new Error("ไม่พบงวดชำระที่เลือก");
  if (s.status === "waived") throw new Error("ไม่สามารถแก้ไขงวดที่ยกเว้นชำระแล้ว");
  const currentAmountCents = Math.max(0, Math.round(asAmount(s.amount) * 100));
  const recordedPaidCents = Math.max(0, Math.round(asAmount(s.paidAmount) * 100));
  const paidCents = s.status === "paid" ? Math.max(currentAmountCents, recordedPaidCents) : recordedPaidCents || (s.paidAt ? currentAmountCents : 0);
  const nextAmountCents = input.amount === undefined ? currentAmountCents : Math.round(input.amount * 100);
  if (nextAmountCents < paidCents) throw new Error("ยอดงวดใหม่ต้องไม่น้อยกว่ายอดที่ชำระไปแล้ว");
  const updated: ScheduleRow = {
    ...s,
    dueDate: input.dueDate ?? s.dueDate,
    amount: (nextAmountCents / 100).toFixed(2),
    paidAmount: (paidCents / 100).toFixed(2),
    status: nextAmountCents <= paidCents ? "paid" : "pending",
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

export async function uploadLedgerReceipt(
  ownerId: number,
  scheduleId: string,
  paidDate: string,
  fileName: string,
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf",
  base64: string,
) {
  const db = await getDb();
  if (db) {
    const [schedule] = await db.select({ id: contractPaymentSchedules.id, status: contractPaymentSchedules.status })
      .from(contractPaymentSchedules)
      .where(and(eq(contractPaymentSchedules.ownerId, ownerId), eq(contractPaymentSchedules.id, scheduleId)))
      .limit(1);
    if (!schedule || schedule.status !== "pending") throw new Error("ไม่พบงวดที่ยังเปิดให้ชำระ");
  } else {
    const schedule = memorySchedules.get(scheduleId);
    if (!schedule || schedule.ownerId !== ownerId || schedule.status !== "pending") throw new Error("ไม่พบงวดที่ยังเปิดให้ชำระ");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidDate)) throw new Error("วันที่ชำระไม่ถูกต้อง");
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length || buffer.length > 8 * 1024 * 1024) throw new Error("ไฟล์หลักฐานต้องมีขนาดไม่เกิน 8 MB");
  const uploaded = await uploadReceiptToGoogleDrive(ownerId, paidDate, fileName, mimeType, buffer);
  return { receiptKey: uploaded.fileId };
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
    if (schedule.status !== "pending") throw new Error("งวดนี้ถูกปิดยอดแล้ว");

    const contractSchedules = await db
      .select()
      .from(contractPaymentSchedules)
      .where(and(
        eq(contractPaymentSchedules.ownerId, ownerId),
        eq(contractPaymentSchedules.contractId, schedule.contractId)
      ))
      .orderBy(asc(contractPaymentSchedules.installmentNo));

    const pendingSchedules = contractSchedules.filter(row => row.status === "pending");
    if (!pendingSchedules.length) throw new Error("ไม่พบงวดที่ยังมียอดค้างชำระ");

    const outstandingCents = contractSchedules.reduce((sum, row) => {
      if (row.status === "waived") return sum;
      const amountCents = Math.max(0, Math.round(asAmount(row.amount) * 100));
      const paidCents = Math.max(0, Math.round(asAmount(row.paidAmount) * 100));
      const actualPaidCents = paidCents > 0 ? paidCents : row.paidAt ? amountCents : 0;
      return sum + Math.max(0, amountCents - actualPaidCents);
    }, 0);

    const paymentCents = Math.max(0, Math.round(input.paidAmount * 100));
    if (paymentCents > outstandingCents) {
      throw new Error("ยอดชำระสูงกว่ายอดหนี้คงเหลือทั้งหมด กรุณาตรวจสอบยอดอีกครั้ง");
    }

    let remainingCents = outstandingCents;
    const baseCents = Math.floor(outstandingCents / pendingSchedules.length);
    const allocations = pendingSchedules.map((row, index) => {
      const allocationCents = index === pendingSchedules.length - 1 ? remainingCents : baseCents;
      remainingCents -= allocationCents;
      return {
        row,
        allocationCents,
        previousPaidCents: Math.max(0, Math.round(asAmount(row.paidAmount) * 100)),
      };
    });

    const selectedIndex = allocations.findIndex(item => item.row.id === schedule.id);
    if (selectedIndex < 0) throw new Error("ไม่พบงวดที่เลือกในรายการค้างชำระ");

    // Allow an irregular/early larger payment when it is covered by the
    // contract's total outstanding balance. Redistribute the remainder
    // across the other unpaid installments instead of rejecting it.
    const selectedAllocation = allocations[selectedIndex];
    if (paymentCents > selectedAllocation.allocationCents) {
      const otherAllocations = allocations.filter((_, index) => index !== selectedIndex);
      if (otherAllocations.length === 0) {
        throw new Error("ยอดชำระสูงกว่ายอดคงเหลือของงวดสุดท้าย");
      }

      const redistributedCents = outstandingCents - paymentCents;
      const baseOtherCents = Math.floor(redistributedCents / otherAllocations.length);
      let otherRemainingCents = redistributedCents;
      let otherIndex = 0;

      for (let index = 0; index < allocations.length; index++) {
        if (index === selectedIndex) {
          allocations[index] = { ...allocations[index], allocationCents: paymentCents };
          continue;
        }

        const isLastOther = otherIndex === otherAllocations.length - 1;
        const allocationCents = isLastOther ? otherRemainingCents : baseOtherCents;
        allocations[index] = { ...allocations[index], allocationCents };
        otherRemainingCents -= allocationCents;
        otherIndex += 1;
      }
    }

    const finalSelectedAllocation = allocations[selectedIndex];
    const selectedTotalCents = finalSelectedAllocation.previousPaidCents + finalSelectedAllocation.allocationCents;
    const newPaidCents = finalSelectedAllocation.previousPaidCents + paymentCents;
    const isFullyPaid = newPaidCents >= selectedTotalCents;

    await db.transaction(async tx => {
      for (const item of allocations) {
        const revisedAmount = (item.previousPaidCents + item.allocationCents) / 100;
        await tx
          .update(contractPaymentSchedules)
          .set({ amount: revisedAmount.toFixed(2) })
          .where(eq(contractPaymentSchedules.id, item.row.id));
      }

      await tx
        .update(contractPaymentSchedules)
        .set({
          status: isFullyPaid ? "paid" : "pending",
          paidAmount: (newPaidCents / 100).toFixed(2),
          paidAt: isFullyPaid ? paidAt : null,
        })
        .where(eq(contractPaymentSchedules.id, schedule.id));

      await tx.insert(ledgerTransactions).values({
        id: crypto.randomUUID(),
        ownerId,
        partyId: schedule.partyId,
        contractId: schedule.contractId,
        scheduleId: schedule.id,
        type: "payment",
        amount: input.paidAmount.toFixed(2),
        occurredAt: paidAt,
        source: input.source,
        note: input.note || `ชำระงวดที่ ${schedule.installmentNo}`,
        receiptKey: input.receiptKey ?? null,
      });
    });

    const [updated] = await db
      .select()
      .from(contractPaymentSchedules)
      .where(eq(contractPaymentSchedules.id, input.scheduleId))
      .limit(1);
    return updated ? toScheduleTransaction(updated) : null;
  }
  const s = memorySchedules.get(input.scheduleId);
  if (!s || s.ownerId !== ownerId) throw new Error("ไม่พบงวดชำระที่เลือก");
  if (s.status !== "pending") throw new Error("งวดนี้ถูกปิดยอดแล้ว");
  const contractSchedules = Array.from(memorySchedules.values()).filter(row => row.ownerId === ownerId && row.contractId === s.contractId).sort((a, b) => a.installmentNo - b.installmentNo);
  const pendingSchedules = contractSchedules.filter(row => row.status === "pending");
  if (!pendingSchedules.length) throw new Error("ไม่พบงวดที่ยังมียอดค้างชำระ");
  const outstandingCents = contractSchedules.reduce((sum, row) => {
    if (row.status === "waived") return sum;
    const amountCents = Math.max(0, Math.round(asAmount(row.amount) * 100));
    const paidCents = Math.max(0, Math.round(asAmount(row.paidAmount) * 100));
    const actualPaidCents = paidCents > 0 ? paidCents : row.status === "paid" || row.paidAt ? amountCents : 0;
    return sum + Math.max(0, amountCents - actualPaidCents);
  }, 0);
  const paymentCents = Math.max(0, Math.round(input.paidAmount * 100));
  if (paymentCents > outstandingCents) throw new Error("ยอดชำระสูงกว่ายอดหนี้คงเหลือทั้งหมด กรุณาตรวจสอบยอดอีกครั้ง");
  const baseCents = Math.floor(outstandingCents / pendingSchedules.length);
  const allocations = pendingSchedules.map((row, index) => ({row, allocationCents: index === pendingSchedules.length - 1 ? outstandingCents - baseCents * (pendingSchedules.length - 1) : baseCents, previousPaidCents: Math.max(0, Math.round(asAmount(row.paidAmount) * 100))}));
  const selectedIndex = allocations.findIndex(item => item.row.id === s.id);
  if (selectedIndex < 0) throw new Error("ไม่พบงวดที่เลือกในรายการค้างชำระ");
  if (paymentCents > allocations[selectedIndex].allocationCents) {
    const others = allocations.filter((_, index) => index !== selectedIndex);
    if (!others.length) throw new Error("ยอดชำระสูงกว่ายอดคงเหลือของงวดสุดท้าย");
    const baseOther = Math.floor((outstandingCents - paymentCents) / others.length);
    let remainingOther = outstandingCents - paymentCents;
    let otherIndex = 0;
    for (let index = 0; index < allocations.length; index++) {
      if (index === selectedIndex) allocations[index].allocationCents = paymentCents;
      else {
        const allocation = otherIndex === others.length - 1 ? remainingOther : baseOther;
        allocations[index].allocationCents = allocation;
        remainingOther -= allocation;
        otherIndex++;
      }
    }
  }
  const selected = allocations[selectedIndex];
  const newPaidCents = selected.previousPaidCents + paymentCents;
  const newAmountCents = selected.previousPaidCents + selected.allocationCents;
  for (const item of allocations) {
    const revisedAmountCents = item.previousPaidCents + item.allocationCents;
    const isSelected = item.row.id === s.id;
    memorySchedules.set(item.row.id, {...item.row, amount: (revisedAmountCents / 100).toFixed(2), ...(isSelected ? {status: newPaidCents >= newAmountCents ? "paid" : "pending", paidAmount: (newPaidCents / 100).toFixed(2), paidAt: newPaidCents >= newAmountCents ? paidAt : null} : {}), updatedAt: new Date()});
  }
  await createLedgerTransaction(ownerId, {partyId: s.partyId, contractId: s.contractId, scheduleId: s.id, type: "payment", amount: input.paidAmount, occurredAt: paidAt, source: input.source, note: input.note || `ชำระงวดที่ ${s.installmentNo}`, receiptKey: input.receiptKey});
  const updated = memorySchedules.get(s.id);
  return updated ? toScheduleTransaction(updated) : null;
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
    allContracts = Array.from(memoryContracts.values()).filter(c => c.ownerId === ownerId);
    allSchedules = Array.from(memorySchedules.values()).filter(s => s.ownerId === ownerId);
    allTransactions = Array.from(memoryTransactions.values()).filter(t => t.ownerId === ownerId);
  }

  const contractMap = new Map(allContracts.map(c => [c.id, c]));
  const contractsByParty = new Map<string, ContractRow[]>();
  for (const contract of allContracts) {
    const partyContracts = contractsByParty.get(contract.partyId) ?? [];
    partyContracts.push(contract);
    contractsByParty.set(contract.partyId, partyContracts);
  }
  const scheduleMap = new Map(allSchedules.map(schedule => [schedule.id, schedule]));
  const resolveTransactionContract = (transaction: TransactionRow): ContractRow | undefined => {
    const linkedContract = transaction.contractId
      ? contractMap.get(transaction.contractId)
      : undefined;
    if (linkedContract?.partyId === transaction.partyId) return linkedContract;

    const linkedSchedule = transaction.scheduleId
      ? scheduleMap.get(transaction.scheduleId)
      : undefined;
    if (linkedSchedule?.partyId === transaction.partyId) {
      const scheduleContract = contractMap.get(linkedSchedule.contractId);
      if (scheduleContract?.partyId === transaction.partyId) return scheduleContract;
    }

    const partyContracts = contractsByParty.get(transaction.partyId) ?? [];
    return partyContracts.length === 1 ? partyContracts[0] : undefined;
  };

  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  const todayMs = Date.parse(`${todayStr}T00:00:00+07:00`);

  let totalPrincipal = 0;
  let totalScheduled = 0;
  let totalCollected = 0;
  let totalOutstanding = 0;

  let debtorPrincipal = 0;
  let debtorScheduled = 0;
  let debtorCollected = 0;
  let debtorOutstanding = 0;

  let creditorPrincipal = 0;
  let creditorScheduled = 0;
  let creditorCollected = 0;
  let creditorOutstanding = 0;

  for (const c of allContracts) {
    const p = partyMap.get(c.partyId);
    const pAmt = asAmount(c.principal);
    totalPrincipal += pAmt;
    if (p?.role === "creditor") {
      creditorPrincipal += pAmt;
    } else {
      debtorPrincipal += pAmt;
    }
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
    partyRole: "debtor" | "creditor";
    contractId: string;
    contractTitle: string;
    installmentNo: number;
    amount: number;
    dueDate: string;
    daysDiff: number;
    status: "overdue" | "today" | "soon";
  }> = [];

  for (const s of allSchedules) {
    if (s.status === "waived") continue;
    const amount = asAmount(s.amount);
    const paidAmount = asAmount(s.paidAmount);
    const party = partyMap.get(s.partyId);
    const isCreditor = party?.role === "creditor";

    totalScheduled += amount;
    totalCollected += paidAmount;

    if (isCreditor) {
      creditorScheduled += amount;
      creditorCollected += paidAmount;
    } else {
      debtorScheduled += amount;
      debtorCollected += paidAmount;
    }

    if (s.status === "pending") {
      // Only active contracts contribute to current outstanding debt.
      // Completed and cancelled contracts remain in historical totals but
      // must not inflate the amount still owed.
      const contract = contractMap.get(s.contractId);
      if (contract?.status !== "active") continue;

      const remainingOnSchedule = Math.max(0, amount - paidAmount);
      totalOutstanding += remainingOnSchedule;

      if (isCreditor) {
        creditorOutstanding += remainingOnSchedule;
      } else {
        debtorOutstanding += remainingOnSchedule;
      }

      const due = asDate(s.dueDate);
      if (due) {
        const dueMs = Date.parse(`${due}T00:00:00+07:00`);
        const daysDiff = Math.round((dueMs - todayMs) / 86_400_000);

        if (daysDiff < 0) {
          overdueCount++;
          overdueAmount += remainingOnSchedule;
          alerts.push({
            id: `alert-overdue-${s.id}`,
            scheduleId: s.id,
            partyId: s.partyId,
            partyName: party?.displayName || "ไม่ระบุชื่อ",
            partyRole: party?.role || "debtor",
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
            partyRole: party?.role || "debtor",
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
            partyRole: party?.role || "debtor",
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

  let totalInflow = 0;
  let totalOutflow = 0;

  for (const t of allTransactions) {
    const amt = asAmount(t.amount);
    const party = partyMap.get(t.partyId);
    const isCreditor = party?.role === "creditor";
    const contract = resolveTransactionContract(t);

    if (t.type === "payment" && isCreditor && contract) {
      // Outflow includes only creditor payments linked to a liability or product-installment contract.
      // Resolve missing contractId only through its schedule or a single unambiguous party contract.
      totalOutflow += amt;
    } else if (t.type === "payment" || (t.type === "disbursement" && isCreditor)) {
      // Debtor payments received and borrowed funds are inflow.
      totalInflow += amt;
    } else if (t.type === "adjustment" && amt >= 0) {
      // Positive adjustments remain inflow; negative adjustments are excluded from Outflow.
      totalInflow += amt;
    }
  }

  // Read-only diagnostic breakdown: identify exactly which payment groups contribute to Outflow.
  const outflowAuditMap = new Map<string, {
    classification: string;
    partyName: string;
    contractTitle: string;
    source: string;
    type: string;
    count: number;
    total: number;
  }>();
  for (const t of allTransactions) {
    const party = partyMap.get(t.partyId);
    const contract = resolveTransactionContract(t);
    const contractTitle = contract?.title || "ไม่มีสัญญา/ระบุไม่ได้";
    const isProductInstallment = Boolean(contract?.title.trim().startsWith("ผ่อน "));
    let classification = "ไม่เข้ากลุ่ม Outflow";
    if (t.type === "payment" && party?.role === "creditor") {
      classification = contract
        ? isProductInstallment ? "การผ่อนสินค้า" : "หนี้สิน"
        : "เจ้าหนี้ไม่มีสัญญา/ระบุสัญญาไม่ได้ (ไม่รวม)";
    } else if (t.type === "payment" && party?.role === "debtor") {
      classification = "รับชำระจากลูกหนี้ (ไม่รวม)";
    } else if (t.type === "disbursement" && party?.role === "creditor") {
      classification = "เงินกู้ที่ได้รับ (ไม่รวม)";
    } else if (t.type === "adjustment") {
      classification = asAmount(t.amount) >= 0
        ? "รายการปรับปรุงบวก (Inflow)"
        : "รายการปรับปรุงลบ (ไม่รวม)";
    } else if (!party) {
      classification = "ไม่พบข้อมูลคู่สัญญา (ตรวจสอบ)";
    }

    const partyName = party?.displayName || "ไม่ระบุคู่สัญญา";
    const source = t.source || "ไม่ระบุ";
    const key = JSON.stringify([classification, partyName, contractTitle, source, t.type]);
    const current = outflowAuditMap.get(key) || {
      classification,
      partyName,
      contractTitle,
      source,
      type: t.type,
      count: 0,
      total: 0,
    };
    current.count += 1;
    current.total += asAmount(t.amount);
    outflowAuditMap.set(key, current);
  }
  const outflowAudit = Array.from(outflowAuditMap.values())
    .sort((a, b) => b.total - a.total);

  const monthlyTimelineMap = new Map<string, { month: string; scheduled: number; collected: number; pending: number }>();
  for (const s of allSchedules) {
    if (s.status === "waived") continue;
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
    debtorPrincipal,
    debtorScheduled,
    debtorCollected,
    debtorOutstanding,
    creditorPrincipal,
    creditorScheduled,
    creditorCollected,
    creditorOutstanding,
    totalInflow,
    totalOutflow,
    outflowAudit,
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
      partyId: t.partyId,
      partyName: party?.displayName || "—",
      partyRole: party?.role || "debtor",
      contractId: t.contractId,
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

