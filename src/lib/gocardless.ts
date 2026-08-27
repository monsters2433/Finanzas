import { getSetting, setSetting } from "./db";

const BASE = process.env.GOCARDLESS_BASE_URL ?? "https://bankaccountdata.gocardless.com/api/v2";

export class BankApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "BankApiError";
  }
}

export function isConfigured(): boolean {
  return Boolean(process.env.GOCARDLESS_SECRET_ID && process.env.GOCARDLESS_SECRET_KEY);
}

type TokenPair = { access: string; access_expires: number; refresh: string; refresh_expires: number };

async function requestToken(): Promise<string> {
  const secret_id = process.env.GOCARDLESS_SECRET_ID;
  const secret_key = process.env.GOCARDLESS_SECRET_KEY;
  if (!secret_id || !secret_key) {
    throw new BankApiError(
      "Faltan GOCARDLESS_SECRET_ID / GOCARDLESS_SECRET_KEY en el entorno.",
      500,
    );
  }
  const res = await fetch(`${BASE}/token/new/`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ secret_id, secret_key }),
  });
  if (!res.ok) {
    throw new BankApiError("No se pudo autenticar contra el proveedor bancario.", res.status, await safeJson(res));
  }
  const token = (await res.json()) as TokenPair;
  setSetting("gc_access_token", token.access);
  // Refresh a minute early so a request never races the expiry.
  setSetting("gc_access_expires_at", String(Date.now() + (token.access_expires - 60) * 1000));
  return token.access;
}

async function accessToken(): Promise<string> {
  const cached = getSetting("gc_access_token");
  const expiresAt = Number(getSetting("gc_access_expires_at") ?? 0);
  if (cached && Date.now() < expiresAt) return cached;
  return requestToken();
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const token = await accessToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (res.status === 401 && retry) {
    setSetting("gc_access_expires_at", "0");
    return api<T>(path, init, false);
  }
  if (!res.ok) {
    const detail = await safeJson(res);
    throw new BankApiError(describeError(detail, res.status), res.status, detail);
  }
  return (await res.json()) as T;
}

function describeError(detail: unknown, status: number): string {
  if (detail && typeof detail === "object") {
    const d = detail as Record<string, unknown>;
    const summary = d.summary ?? d.detail ?? d.error ?? d.status_code;
    if (typeof summary === "string") return summary;
  }
  if (status === 429) return "Límite de peticiones del banco alcanzado. Prueba de nuevo más tarde.";
  return `El proveedor bancario devolvió un error ${status}.`;
}

export type Institution = {
  id: string;
  name: string;
  bic?: string;
  transaction_total_days?: string;
  logo?: string;
  countries?: string[];
};

export function listInstitutions(country = "es"): Promise<Institution[]> {
  return api<Institution[]>(`/institutions/?country=${encodeURIComponent(country)}`);
}

export type Requisition = {
  id: string;
  status: string;
  link: string;
  accounts: string[];
  reference: string;
  institution_id: string;
  agreement?: string;
};

export async function createRequisition(params: {
  institutionId: string;
  redirect: string;
  reference: string;
  maxHistoricalDays?: number;
}): Promise<Requisition> {
  // A dedicated agreement lets us ask for the longest history the bank allows.
  let agreement: string | undefined;
  try {
    const created = await api<{ id: string }>("/agreements/enduser/", {
      method: "POST",
      body: JSON.stringify({
        institution_id: params.institutionId,
        max_historical_days: params.maxHistoricalDays ?? 730,
        access_valid_for_days: 180,
        access_scope: ["balances", "details", "transactions"],
      }),
    });
    agreement = created.id;
  } catch {
    // Some banks reject custom agreements; fall back to the provider default.
    agreement = undefined;
  }

  return api<Requisition>("/requisitions/", {
    method: "POST",
    body: JSON.stringify({
      redirect: params.redirect,
      institution_id: params.institutionId,
      reference: params.reference,
      user_language: "ES",
      ...(agreement ? { agreement } : {}),
    }),
  });
}

export function getRequisition(id: string): Promise<Requisition> {
  return api<Requisition>(`/requisitions/${id}/`);
}

export function deleteRequisition(id: string): Promise<unknown> {
  return api(`/requisitions/${id}/`, { method: "DELETE" });
}

export type AccountDetails = {
  account: {
    iban?: string;
    name?: string;
    displayName?: string;
    ownerName?: string;
    currency?: string;
    product?: string;
  };
};

export function getAccountDetails(accountId: string): Promise<AccountDetails> {
  return api<AccountDetails>(`/accounts/${accountId}/details/`);
}

export type Balances = {
  balances: Array<{
    balanceAmount: { amount: string; currency: string };
    balanceType: string;
    referenceDate?: string;
  }>;
};

export function getBalances(accountId: string): Promise<Balances> {
  return api<Balances>(`/accounts/${accountId}/balances/`);
}

export type BankTransaction = {
  transactionId?: string;
  internalTransactionId?: string;
  endToEndId?: string;
  bookingDate?: string;
  valueDate?: string;
  bookingDateTime?: string;
  transactionAmount: { amount: string; currency: string };
  creditorName?: string;
  debtorName?: string;
  remittanceInformationUnstructured?: string;
  remittanceInformationUnstructuredArray?: string[];
  additionalInformation?: string;
  proprietaryBankTransactionCode?: string;
};

export type TransactionsResponse = {
  transactions: { booked: BankTransaction[]; pending?: BankTransaction[] };
};

export function getTransactions(accountId: string, dateFrom?: string): Promise<TransactionsResponse> {
  const qs = dateFrom ? `?date_from=${encodeURIComponent(dateFrom)}` : "";
  return api<TransactionsResponse>(`/accounts/${accountId}/transactions/${qs}`);
}
