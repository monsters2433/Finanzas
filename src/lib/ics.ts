import { getDb } from "./db";
import { addMonths, todayISO, type ISODate } from "./dates";
import { formatCents } from "./money";
import { occurrencesBetween, type RecurringItem } from "./recurrence";

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function fold(line: string): string {
  // RFC 5545 caps content lines at 75 octets; continuation lines start with a space.
  if (Buffer.byteLength(line, "utf8") <= 73) return line;
  const chunks: string[] = [];
  let current = "";
  for (const char of line) {
    if (Buffer.byteLength(current + char, "utf8") > 73) {
      chunks.push(current);
      current = " ";
    }
    current += char;
  }
  chunks.push(current);
  return chunks.join("\r\n");
}

function compactDate(d: ISODate): string {
  return d.replace(/-/g, "");
}

function stamp(): string {
  return `${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

/**
 * Builds a subscribable calendar of every upcoming charge.
 * All-day events, one VALARM per item honouring its reminder_days.
 */
export function buildCalendar(options: { monthsBack?: number; monthsAhead?: number } = {}): string {
  const db = getDb();
  const today = todayISO();
  const from = addMonths(today, -(options.monthsBack ?? 3));
  const to = addMonths(today, options.monthsAhead ?? 12);

  const items = db
    .prepare("SELECT * FROM recurring WHERE active = 1 ORDER BY name")
    .all() as RecurringItem[];

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Finanzas//Calendario de gastos//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Finanzas — Suscripciones y gastos fijos",
    "X-WR-TIMEZONE:Europe/Madrid",
    "X-PUBLISHED-TTL:PT6H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
  ];

  const dtstamp = stamp();

  for (const item of items) {
    const sign = item.kind === "income" ? "+" : "−";
    const kindLabel =
      item.kind === "income" ? "Ingreso" : item.kind === "fixed" ? "Gasto fijo" : "Suscripción";

    for (const date of occurrencesBetween(item, from, to)) {
      const amount = formatCents(item.amount_cents, item.currency);
      const summary = `${sign}${amount} · ${item.name}`;
      lines.push(
        "BEGIN:VEVENT",
        `UID:recurring-${item.id}-${compactDate(date)}@finanzas.local`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART;VALUE=DATE:${compactDate(date)}`,
        `DTEND;VALUE=DATE:${compactDate(nextDay(date))}`,
        fold(`SUMMARY:${escapeText(summary)}`),
        fold(
          `DESCRIPTION:${escapeText(
            [`${kindLabel}: ${item.name}`, `Importe: ${amount}`, item.notes ?? ""]
              .filter(Boolean)
              .join("\n"),
          )}`,
        ),
        "TRANSP:TRANSPARENT",
        "CATEGORIES:Finanzas",
      );
      if (item.reminder_days >= 0) {
        lines.push(
          "BEGIN:VALARM",
          "ACTION:DISPLAY",
          fold(`DESCRIPTION:${escapeText(`${item.name} — ${amount}`)}`),
          `TRIGGER:-P${Math.max(0, item.reminder_days)}D`,
          "END:VALARM",
        );
      }
      lines.push("END:VEVENT");
    }
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

function nextDay(d: ISODate): ISODate {
  const date = new Date(`${d}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
