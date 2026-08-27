import { getDb, getSettingNumber } from "./db";
import { addMonths, monthKey, todayISO, type ISODate } from "./dates";

export const PAYROLL_PATTERN =
  /n[oó]mina|payroll|salario|sueldo|retribuci[oó]n|haberes|pago n[oó]mina|abono n[oó]mina/i;

export type PayrollTx = {
  id: number;
  booked_date: ISODate;
  amount_cents: number;
  merchant: string;
  description: string;
};

export type SalaryAnalysis = {
  payrolls: PayrollTx[];
  employer: string | null;
  /** Typical single payslip, robust against extra payments. */
  medianPayslipCents: number;
  lastPayslipCents: number | null;
  lastPayslipDate: ISODate | null;
  /** Payslips found in the trailing 12 months. */
  paymentsLast12: number;
  /** 12 or 14 in Spain; inferred, falls back to 12. */
  paymentsPerYear: number;
  /** Payslips clearly above the median — "pagas extra". */
  extras: PayrollTx[];
  monthsCovered: number;
  /** Real sum of the trailing 12 months when history allows, otherwise extrapolated. */
  annualNetCents: number;
  annualIsEstimated: boolean;
  /** annualNet / 12 — what you can actually budget every month. */
  budgetableMonthlyCents: number;
  /** Optional gross estimate from the user's declared deduction rate. */
  deductionRate: number;
  annualGrossCents: number | null;
};

/**
 * Flags incoming movements that look like a payslip and stores the flag.
 * Two independent signals: the description says "nómina", or the same
 * counterparty pays a similar amount on a roughly monthly cadence.
 */
export function detectPayrolls(): number {
  const db = getDb();
  const minCents = getSettingNumber("payroll_min_cents", 40_000);
  const incoming = db
    .prepare(
      `SELECT id, booked_date, amount_cents, merchant, description
         FROM transactions
        WHERE amount_cents > 0 AND excluded = 0
        ORDER BY booked_date ASC`,
    )
    .all() as PayrollTx[];

  const flagged = new Set<number>();

  for (const tx of incoming) {
    if (PAYROLL_PATTERN.test(`${tx.merchant} ${tx.description}`)) flagged.add(tx.id);
  }

  // Cadence signal: group sizeable incomes by counterparty.
  const byPayer = new Map<string, PayrollTx[]>();
  for (const tx of incoming) {
    if (tx.amount_cents < minCents) continue;
    const key = normalisePayer(tx.merchant || tx.description);
    if (!key) continue;
    const list = byPayer.get(key) ?? [];
    list.push(tx);
    byPayer.set(key, list);
  }

  for (const group of byPayer.values()) {
    if (group.length < 3) continue;
    const months = new Set(group.map((t) => monthKey(t.booked_date)));
    if (months.size < 3) continue;
    const amounts = group.map((t) => t.amount_cents).sort((a, b) => a - b);
    const med = median(amounts);
    // A salary is stable: most payslips sit close to the median.
    const stable = group.filter((t) => Math.abs(t.amount_cents - med) <= med * 0.35).length;
    if (stable / group.length < 0.6) continue;
    for (const tx of group) flagged.add(tx.id);
  }

  // Anything the user decided by hand wins over the detector, in both directions.
  const overrides = db
    .prepare("SELECT id, payroll_override FROM transactions WHERE payroll_override IS NOT NULL")
    .all() as Array<{ id: number; payroll_override: number }>;
  for (const row of overrides) {
    if (row.payroll_override) flagged.add(row.id);
    else flagged.delete(row.id);
  }

  const clear = db.prepare("UPDATE transactions SET is_payroll = 0 WHERE is_payroll = 1");
  const mark = db.prepare("UPDATE transactions SET is_payroll = 1 WHERE id = ?");
  db.transaction(() => {
    clear.run();
    for (const id of flagged) mark.run(id);
  })();

  return flagged.size;
}

function normalisePayer(text: string): string {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/nomina|transferencia|abono|pago|de\b|sl\b|s\.l\.|sa\b|s\.a\./g, " ")
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24);
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function analyzeSalary(today: ISODate = todayISO()): SalaryAnalysis {
  const db = getDb();
  const payrolls = db
    .prepare(
      `SELECT id, booked_date, amount_cents, merchant, description
         FROM transactions
        WHERE is_payroll = 1 AND excluded = 0
        ORDER BY booked_date DESC`,
    )
    .all() as PayrollTx[];

  const deductionRate = getSettingNumber("deduction_rate", 0);

  if (payrolls.length === 0) {
    return {
      payrolls: [],
      employer: null,
      medianPayslipCents: 0,
      lastPayslipCents: null,
      lastPayslipDate: null,
      paymentsLast12: 0,
      paymentsPerYear: 12,
      extras: [],
      monthsCovered: 0,
      annualNetCents: 0,
      annualIsEstimated: true,
      budgetableMonthlyCents: 0,
      deductionRate,
      annualGrossCents: null,
    };
  }

  const yearAgo = addMonths(today, -12);
  const last12 = payrolls.filter((t) => t.booked_date > yearAgo);
  const sortedAmounts = payrolls.map((t) => t.amount_cents).sort((a, b) => a - b);
  const med = median(sortedAmounts);

  // "Pagas extra": clearly above a normal payslip.
  const extras = payrolls.filter((t) => t.amount_cents > med * 1.4);

  const oldest = payrolls[payrolls.length - 1].booked_date;
  const monthsCovered = monthsSpan(oldest, payrolls[0].booked_date) + 1;

  // Payments per year: measured when we have a full year, otherwise inferred
  // from the presence of extra payslips (Spain's 12- vs 14-payment split).
  let paymentsPerYear: number;
  if (monthsCovered >= 12) {
    paymentsPerYear = Math.max(last12.length, 12);
  } else {
    const extrasPerYear = extras.length > 0 ? Math.round((extras.length * 12) / monthsCovered) : 0;
    paymentsPerYear = 12 + Math.min(2, extrasPerYear);
  }

  const hasFullYear = monthsCovered >= 12 && last12.length >= 11;
  const annualNetCents = hasFullYear
    ? last12.reduce((sum, t) => sum + t.amount_cents, 0)
    : med * paymentsPerYear;

  const annualGrossCents =
    deductionRate > 0 && deductionRate < 0.9
      ? Math.round(annualNetCents / (1 - deductionRate))
      : null;

  return {
    payrolls,
    employer: mostCommon(payrolls.map((t) => t.merchant).filter(Boolean)),
    medianPayslipCents: med,
    lastPayslipCents: payrolls[0].amount_cents,
    lastPayslipDate: payrolls[0].booked_date,
    paymentsLast12: last12.length,
    paymentsPerYear,
    extras,
    monthsCovered,
    annualNetCents,
    annualIsEstimated: !hasFullYear,
    budgetableMonthlyCents: Math.round(annualNetCents / 12),
    deductionRate,
    annualGrossCents,
  };
}

function monthsSpan(from: ISODate, to: ISODate): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

function mostCommon(values: string[]): string | null {
  if (values.length === 0) return null;
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
