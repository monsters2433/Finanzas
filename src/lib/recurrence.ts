import { addDays, addMonths, type ISODate } from "./dates";

export type Frequency = "weekly" | "monthly" | "quarterly" | "yearly";

export type RecurringItem = {
  id: number;
  name: string;
  kind: "subscription" | "fixed" | "income";
  amount_cents: number;
  currency: string;
  category_id: number | null;
  frequency: Frequency;
  interval_n: number;
  first_date: ISODate;
  end_date: ISODate | null;
  reminder_days: number;
  active: number;
  notes: string | null;
};

export type Occurrence = {
  date: ISODate;
  item: RecurringItem;
};

function step(date: ISODate, frequency: Frequency, interval: number): ISODate {
  switch (frequency) {
    case "weekly":
      return addDays(date, 7 * interval);
    case "monthly":
      return addMonths(date, interval);
    case "quarterly":
      return addMonths(date, 3 * interval);
    case "yearly":
      return addMonths(date, 12 * interval);
  }
}

/** Every charge date of an item inside [from, to], inclusive. */
export function occurrencesBetween(item: RecurringItem, from: ISODate, to: ISODate): ISODate[] {
  if (!item.active) return [];
  const interval = Math.max(1, item.interval_n || 1);
  const out: ISODate[] = [];
  let cursor = item.first_date;
  // Guard against pathological anchors far in the past.
  let guard = 0;
  while (cursor < from && guard++ < 5000) cursor = step(cursor, item.frequency, interval);
  while (cursor <= to && guard++ < 5000) {
    if (item.end_date && cursor > item.end_date) break;
    if (cursor >= from) out.push(cursor);
    cursor = step(cursor, item.frequency, interval);
  }
  return out;
}

export function nextOccurrence(item: RecurringItem, from: ISODate): ISODate | null {
  const horizon = addMonths(from, 24);
  const [first] = occurrencesBetween(item, from, horizon);
  return first ?? null;
}

/** Normalises any cadence to a monthly cost, for budgeting. */
export function monthlyCostCents(item: RecurringItem): number {
  const interval = Math.max(1, item.interval_n || 1);
  switch (item.frequency) {
    case "weekly":
      return Math.round((item.amount_cents * 52) / 12 / interval);
    case "monthly":
      return Math.round(item.amount_cents / interval);
    case "quarterly":
      return Math.round(item.amount_cents / (3 * interval));
    case "yearly":
      return Math.round(item.amount_cents / (12 * interval));
  }
}

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  weekly: "Semanal",
  monthly: "Mensual",
  quarterly: "Trimestral",
  yearly: "Anual",
};
