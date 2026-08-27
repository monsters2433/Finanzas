export type ISODate = string; // YYYY-MM-DD

export function todayISO(tz = "Europe/Madrid"): ISODate {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function parseISO(d: ISODate): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

export function toISO(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  const date = parseISO(d);
  date.setUTCDate(date.getUTCDate() + n);
  return toISO(date);
}

/** Adds months, clamping the day to the last day of the target month (31 Jan + 1m = 28/29 Feb). */
export function addMonths(d: ISODate, n: number): ISODate {
  const date = parseISO(d);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + n);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return toISO(date);
}

export function monthKey(d: ISODate): string {
  return d.slice(0, 7);
}

export function monthStart(monthKey: string): ISODate {
  return `${monthKey}-01`;
}

export function monthEnd(monthKey: string): ISODate {
  const [y, m] = monthKey.split("-").map(Number);
  return toISO(new Date(Date.UTC(y, m, 0)));
}

export function shiftMonthKey(key: string, n: number): string {
  return monthKey(addMonths(monthStart(key), n));
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86_400_000);
}

const MONTHS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function formatMonthKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS_ES[m - 1]} ${y}`;
}

export function formatDateES(d: ISODate): string {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

export function formatDateLongES(d: ISODate): string {
  const [y, m, day] = d.split("-").map(Number);
  return `${day} ${MONTHS_ES[m - 1]} ${y}`;
}
