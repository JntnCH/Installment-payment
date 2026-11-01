/**
 * Single source of truth: Google Sheets (via Income-and-expenses-by-manus backend).
 * Installment-payment must not invent mock financial rows for cashflow/balance.
 */

const DEFAULT_BACKEND =
  process.env.BACKEND_ADMIN_URL ||
  process.env.VITE_BACKEND_API_URL ||
  "https://income-and-expenses-by-manus-production.up.railway.app";

function getBackendBase(): string {
  return String(DEFAULT_BACKEND).replace(/\/$/, "");
}

function getAdminKey(): string {
  return (
    process.env.BACKEND_ADMIN_API_KEY ||
    process.env.ADMIN_API_KEY ||
    ""
  );
}

async function backendFetch(path: string, init: RequestInit = {}) {
  const base = getBackendBase();
  const key = getAdminKey();
  if (!key) {
    throw new Error(
      "BACKEND_ADMIN_API_KEY is not configured — cannot read real Google Sheets data",
    );
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${key}`,
    ...(init.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${base}${path}`, {
    ...init,
    headers,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (body as { message?: string }).message ||
        `Backend request failed (${res.status}) ${path}`,
    );
  }
  return body as Record<string, unknown>;
}

export async function getSheetsBalance() {
  const body = await backendFetch("/api/balance");
  return {
    source: "google-sheets" as const,
    ...(body.data as Record<string, unknown>),
  };
}

export async function listSheetsTransactions(limit = 100) {
  const body = await backendFetch(`/api/transactions?limit=${limit}`);
  return {
    source: "google-sheets" as const,
    count: (body.count as number) || 0,
    data: (body.data as unknown[]) || [],
  };
}

export async function createSheetsTransaction(input: {
  type?: string;
  item?: string;
  amount: number;
  category?: string;
  account?: string;
  recorderName?: string;
  channel?: string;
  note?: string;
}) {
  const body = await backendFetch("/api/transactions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return body;
}

export function sheetsProxyConfigured() {
  return Boolean(getAdminKey() && getBackendBase());
}
