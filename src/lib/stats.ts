import { getDb } from "./db";
import { addDays, monthEnd, monthKey, monthStart, shiftMonthKey, todayISO, type ISODate } from "./dates";
import { monthlyCostCents, occurrencesBetween, type RecurringItem } from "./recurrence";

export type CategoryTotal = {
  category_id: number | null;
  name: string;
  kind: string;
  color: string;
  spent_cents: number;
  budget_cents: number | null;
  count: number;
};

export type MonthSummary = {
  month: string;
  incomeCents: number;
  payrollCents: number;
  spentCents: number;
  savedCents: number;
  savingsRate: number;
  fixedCents: number;
  variableCents: number;
  savingsMovedCents: number;
  byCategory: CategoryTotal[];
  topMerchants: Array<{ merchant: string; spent_cents: number; count: number }>;
  daily: Array<{ date: ISODate; spent_cents: number }>;
  transactionCount: number;
};

export function monthSummary(month: string): MonthSummary {
  const db = getDb();
  const from = monthStart(month);
  const to = monthEnd(month);

  const totals = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN amount_cents > 0 THEN amount_cents END), 0)   AS income,
         COALESCE(SUM(CASE WHEN is_payroll = 1 THEN amount_cents END), 0)     AS payroll,
         COALESCE(-SUM(CASE WHEN amount_cents < 0 THEN amount_cents END), 0)  AS spent,
         COUNT(*) AS n
       FROM transactions
       WHERE excluded = 0 AND booked_date BETWEEN ? AND ?`,
    )
    .get(from, to) as { income: number; payroll: number; spent: number; n: number };

  const byCategory = db
    .prepare(
      `SELECT t.category_id,
              COALESCE(c.name, 'Sin categoría') AS name,
              COALESCE(c.kind, 'variable')      AS kind,
              COALESCE(c.color, '#8b97a8')      AS color,
              c.monthly_budget_cents            AS budget_cents,
              -SUM(t.amount_cents)              AS spent_cents,
              COUNT(*)                          AS count
         FROM transactions t
         LEFT JOIN categories c ON c.id = t.category_id
        WHERE t.excluded = 0 AND t.amount_cents < 0 AND t.booked_date BETWEEN ? AND ?
        GROUP BY t.category_id
        ORDER BY spent_cents DESC`,
    )
    .all(from, to) as CategoryTotal[];

  const sumKind = (kind: string) =>
    byCategory.filter((c) => c.kind === kind).reduce((s, c) => s + c.spent_cents, 0);

  const topMerchants = db
    .prepare(
      `SELECT merchant, -SUM(amount_cents) AS spent_cents, COUNT(*) AS count
         FROM transactions
        WHERE excluded = 0 AND amount_cents < 0 AND booked_date BETWEEN ? AND ?
          AND merchant <> ''
        GROUP BY LOWER(merchant)
        ORDER BY spent_cents DESC
        LIMIT 8`,
    )
    .all(from, to) as Array<{ merchant: string; spent_cents: number; count: number }>;

  const daily = db
    .prepare(
      `SELECT booked_date AS date, -SUM(amount_cents) AS spent_cents
         FROM transactions
        WHERE excluded = 0 AND amount_cents < 0 AND booked_date BETWEEN ? AND ?
        GROUP BY booked_date
        ORDER BY booked_date`,
    )
    .all(from, to) as Array<{ date: ISODate; spent_cents: number }>;

  const savedCents = totals.income - totals.spent;

  return {
    month,
    incomeCents: totals.income,
    payrollCents: totals.payroll,
    spentCents: totals.spent,
    savedCents,
    savingsRate: totals.income > 0 ? Math.round((savedCents / totals.income) * 1000) / 10 : 0,
    fixedCents: sumKind("fixed"),
    variableCents: sumKind("variable"),
    savingsMovedCents: sumKind("savings"),
    byCategory,
    topMerchants,
    daily,
    transactionCount: totals.n,
  };
}

export function monthlyTrend(months: number, endMonth = monthKey(todayISO())): Array<{
  month: string;
  income_cents: number;
  spent_cents: number;
}> {
  const db = getDb();
  const from = monthStart(shiftMonthKey(endMonth, -(months - 1)));
  const to = monthEnd(endMonth);
  const rows = db
    .prepare(
      `SELECT substr(booked_date, 1, 7) AS month,
              COALESCE(SUM(CASE WHEN amount_cents > 0 THEN amount_cents END), 0)  AS income_cents,
              COALESCE(-SUM(CASE WHEN amount_cents < 0 THEN amount_cents END), 0) AS spent_cents
         FROM transactions
        WHERE excluded = 0 AND booked_date BETWEEN ? AND ?
        GROUP BY month`,
    )
    .all(from, to) as Array<{ month: string; income_cents: number; spent_cents: number }>;

  const index = new Map(rows.map((r) => [r.month, r]));
  return Array.from({ length: months }, (_, i) => {
    const m = shiftMonthKey(endMonth, -(months - 1 - i));
    return index.get(m) ?? { month: m, income_cents: 0, spent_cents: 0 };
  });
}

export type UpcomingCharge = {
  date: ISODate;
  item: RecurringItem;
  categoryName: string | null;
  categoryColor: string | null;
};

export function listRecurring(kind?: string): RecurringItem[] {
  const db = getDb();
  const sql = kind
    ? "SELECT * FROM recurring WHERE kind = ? ORDER BY active DESC, name"
    : "SELECT * FROM recurring ORDER BY active DESC, kind, name";
  return (kind ? db.prepare(sql).all(kind) : db.prepare(sql).all()) as RecurringItem[];
}

export function upcomingCharges(days = 45, from: ISODate = todayISO()): UpcomingCharge[] {
  const db = getDb();
  const items = db.prepare("SELECT * FROM recurring WHERE active = 1").all() as RecurringItem[];
  const categories = new Map(
    (db.prepare("SELECT id, name, color FROM categories").all() as Array<{
      id: number;
      name: string;
      color: string;
    }>).map((c) => [c.id, c]),
  );
  const until = addDays(from, days);

  const out: UpcomingCharge[] = [];
  for (const item of items) {
    for (const date of occurrencesBetween(item, from, until)) {
      const cat = item.category_id ? categories.get(item.category_id) : undefined;
      out.push({
        date,
        item,
        categoryName: cat?.name ?? null,
        categoryColor: cat?.color ?? null,
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export type RecurringSummary = {
  subscriptionsMonthlyCents: number;
  fixedMonthlyCents: number;
  totalMonthlyCents: number;
  yearlyCents: number;
  activeCount: number;
};

export function recurringSummary(): RecurringSummary {
  const items = listRecurring().filter((i) => i.active && i.kind !== "income");
  const subs = items.filter((i) => i.kind === "subscription").reduce((s, i) => s + monthlyCostCents(i), 0);
  const fixed = items.filter((i) => i.kind === "fixed").reduce((s, i) => s + monthlyCostCents(i), 0);
  return {
    subscriptionsMonthlyCents: subs,
    fixedMonthlyCents: fixed,
    totalMonthlyCents: subs + fixed,
    yearlyCents: (subs + fixed) * 12,
    activeCount: items.length,
  };
}
