import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { authIdentities, InsertUser, users, type AuthIdentity } from "../drizzle/schema";
import { createHash } from "node:crypto";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export type AuthProvider = AuthIdentity["provider"];

function providerOpenId(provider: AuthProvider, providerUserId: string): string {
  const prefix = provider === "google" ? "g_" : provider === "line" ? "l_" : "t_";
  const digest = createHash("sha256").update(providerUserId).digest("hex");
  return prefix + digest.slice(0, 62);
}

export async function getUserByAuthIdentity(provider: AuthProvider, providerUserId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db
    .select({ user: users })
    .from(authIdentities)
    .innerJoin(users, eq(authIdentities.userId, users.id))
    .where(and(eq(authIdentities.provider, provider), eq(authIdentities.providerUserId, providerUserId)))
    .limit(1);
  return rows[0]?.user;
}

export async function createUserForAuthIdentity(input: {
  provider: AuthProvider;
  providerUserId: string;
  name?: string | null;
  email?: string | null;
}) {
  if (!input.providerUserId) throw new Error("Provider user ID is required");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  try {
    return await db.transaction(async tx => {
    const existing = await tx
      .select({ user: users })
      .from(authIdentities)
      .innerJoin(users, eq(authIdentities.userId, users.id))
      .where(and(eq(authIdentities.provider, input.provider), eq(authIdentities.providerUserId, input.providerUserId)))
      .limit(1);
    if (existing[0]) return existing[0].user;

    const openId = providerOpenId(input.provider, input.providerUserId);
    await tx.insert(users).values({
      openId,
      name: input.name ?? null,
      email: input.email ?? null,
      loginMethod: input.provider,
      lastSignedIn: new Date(),
    });
    const createdRows = await tx.select().from(users).where(eq(users.openId, openId)).limit(1);
    const user = createdRows[0];
    if (!user) throw new Error("Failed to create user account");

    await tx.insert(authIdentities).values({
      userId: user.id,
      provider: input.provider,
      providerUserId: input.providerUserId,
      email: input.email ?? null,
      displayName: input.name ?? null,
    });
    return user;
    });
  } catch (error) {
    // A simultaneous first login can race on the unique provider identity.
    // Re-read only the exact provider subject; never merge by email.
    const existing = await getUserByAuthIdentity(input.provider, input.providerUserId);
    if (existing) return existing;
    throw error;
  }
}

export async function linkAuthIdentity(input: {
  userId: number;
  provider: AuthProvider;
  providerUserId: string;
  name?: string | null;
  email?: string | null;
}) {
  if (!input.providerUserId) throw new Error("Provider user ID is required");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  return db.transaction(async tx => {
    const owner = await tx.select({ id: users.id }).from(users)
      .where(eq(users.id, input.userId)).limit(1);
    if (!owner[0]) throw new Error("User account not found");

    const identity = await tx.select().from(authIdentities).where(and(
      eq(authIdentities.provider, input.provider),
      eq(authIdentities.providerUserId, input.providerUserId),
    )).limit(1);
    if (identity[0]) {
      if (identity[0].userId !== input.userId) {
        throw new Error("This provider account is already linked to another user");
      }
      return identity[0];
    }

    const sameProvider = await tx.select().from(authIdentities).where(and(
      eq(authIdentities.userId, input.userId),
      eq(authIdentities.provider, input.provider),
    )).limit(1);
    if (sameProvider[0]) throw new Error("This user already has an identity for this provider");

    await tx.insert(authIdentities).values({
      userId: input.userId,
      provider: input.provider,
      providerUserId: input.providerUserId,
      email: input.email ?? null,
      displayName: input.name ?? null,
    });
    const linked = await tx.select().from(authIdentities).where(and(
      eq(authIdentities.provider, input.provider),
      eq(authIdentities.providerUserId, input.providerUserId),
    )).limit(1);
    if (!linked[0]) throw new Error("Failed to link provider identity");
    return linked[0];
  });
}

export async function listAuthIdentities(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select({
    provider: authIdentities.provider,
    email: authIdentities.email,
    displayName: authIdentities.displayName,
    createdAt: authIdentities.createdAt,
  }).from(authIdentities).where(eq(authIdentities.userId, userId));
}
