import { getDb } from "./db";
import { categorize, extractMerchant, fallbackCategoryId, loadRules } from "./categorize";
import { detectPayrolls } from "./payroll";
import { addDays, todayISO } from "./dates";
import { toCents } from "./money";
import * as bank from "./gocardless";

export type SyncResult = {
  accounts: number;
  imported: number;
  skipped: number;
  errors: string[];
  newSpending: Array<{ merchant: string; amount_cents: number; booked_date: string }>;
  totalNewSpentCents: number;
};

type AccountRow = {
  id: number;
  external_id: string;
  name: string;
  currency: string;
  last_synced_at: string | null;
};

/**
 * Stable key used to dedupe a movement across syncs.
 * Banks that omit ids get a content key; `seen` disambiguates genuine repeats
 * (two identical coffees the same day) by their position within the batch,
 * which the bank returns in a stable order.
 */
function externalKey(
  accountId: number,
  tx: bank.BankTransaction,
  description: string,
  seen: Map<string, number>,
): string {
  const id = tx.transactionId ?? tx.internalTransactionId ?? tx.endToEndId;
  if (id) return `${accountId}:${id}`;

  const date = tx.bookingDate ?? tx.valueDate ?? "";
  const base = `${accountId}:${date}:${tx.transactionAmount.amount}:${description.slice(0, 40)}`;
  const occurrence = (seen.get(base) ?? 0) + 1;
  seen.set(base, occurrence);
  return occurrence === 1 ? base : `${base}#${occurrence}`;
}

function describe(tx: bank.BankTransaction): string {
  const parts = [
    tx.remittanceInformationUnstructured,
    ...(tx.remittanceInformationUnstructuredArray ?? []),
    tx.creditorName,
    tx.debtorName,
    tx.additionalInformation,
  ].filter(Boolean) as string[];
  const seen = new Set<string>();
  return parts.filter((p) => !seen.has(p) && seen.add(p)).join(" · ").trim();
}

export async function syncAllAccounts(): Promise<SyncResult> {
  const db = getDb();
  const accounts = db
    .prepare(
      `SELECT id, external_id, name, currency, last_synced_at
         FROM accounts WHERE archived = 0 AND external_id IS NOT NULL`,
    )
    .all() as AccountRow[];

  const result: SyncResult = {
    accounts: accounts.length,
    imported: 0,
    skipped: 0,
    errors: [],
    newSpending: [],
    totalNewSpentCents: 0,
  };

  if (accounts.length === 0) return result;

  const rules = loadRules();
  const fallback = fallbackCategoryId();

  const insert = db.prepare(
    `INSERT INTO transactions
       (account_id, external_id, source, booked_date, value_date, amount_cents, currency,
        merchant, description, category_id)
     VALUES (@account_id, @external_id, 'bank', @booked_date, @value_date, @amount_cents,
             @currency, @merchant, @description, @category_id)
     ON CONFLICT(external_id) DO NOTHING`,
  );

  for (const account of accounts) {
    try {
      // Re-fetch a short overlap so movements that settled late are not missed.
      const from = account.last_synced_at
        ? addDays(account.last_synced_at.slice(0, 10), -7)
        : undefined;
      const [txs, balances] = await Promise.all([
        bank.getTransactions(account.external_id, from),
        bank.getBalances(account.external_id).catch(() => null),
      ]);

      const booked = txs.transactions?.booked ?? [];
      const seen = new Map<string, number>();
      db.transaction(() => {
        for (const tx of booked) {
          const description = describe(tx);
          const merchant = extractMerchant(tx.creditorName || tx.debtorName || description);
          const amount_cents = toCents(tx.transactionAmount.amount);
          const booked_date = (tx.bookingDate ?? tx.valueDate ?? todayISO()).slice(0, 10);
          const category_id = categorize(`${merchant} ${description}`, rules) ?? fallback;
          const info = insert.run({
            account_id: account.id,
            external_id: externalKey(account.id, tx, description, seen),
            booked_date,
            value_date: (tx.valueDate ?? booked_date).slice(0, 10),
            amount_cents,
            currency: tx.transactionAmount.currency || account.currency,
            merchant,
            description,
            category_id,
          });
          if (info.changes > 0) {
            result.imported += 1;
            if (amount_cents < 0) {
              result.newSpending.push({ merchant, amount_cents, booked_date });
              result.totalNewSpentCents += -amount_cents;
            }
          } else {
            result.skipped += 1;
          }
        }

        const balance = balances?.balances?.find(
          (b) => b.balanceType === "interimAvailable" || b.balanceType === "closingBooked",
        ) ?? balances?.balances?.[0];

        db.prepare(
          `UPDATE accounts
              SET last_synced_at = datetime('now'),
                  balance_cents  = COALESCE(?, balance_cents),
                  balance_at     = CASE WHEN ? IS NULL THEN balance_at ELSE datetime('now') END
            WHERE id = ?`,
        ).run(
          balance ? toCents(balance.balanceAmount.amount) : null,
          balance ? 1 : null,
          account.id,
        );
      })();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`${account.name}: ${message}`);
    }
  }

  if (result.imported > 0) detectPayrolls();
  return result;
}

/** Re-runs the rule engine over movements, useful after editing rules. */
export function recategorizeAll(onlyUncategorized: boolean): number {
  const db = getDb();
  const rules = loadRules();
  const fallback = fallbackCategoryId();
  const rows = db
    .prepare(
      `SELECT id, merchant, description FROM transactions
        ${onlyUncategorized ? "WHERE category_id IS NULL OR category_id = COALESCE(?, -1)" : ""}`,
    )
    .all(...(onlyUncategorized ? [fallback] : [])) as Array<{
    id: number;
    merchant: string;
    description: string;
  }>;

  const update = db.prepare("UPDATE transactions SET category_id = ? WHERE id = ?");
  let changed = 0;
  db.transaction(() => {
    for (const row of rows) {
      const match = categorize(`${row.merchant} ${row.description}`, rules);
      if (match !== null) {
        update.run(match, row.id);
        changed += 1;
      }
    }
  })();
  return changed;
}
