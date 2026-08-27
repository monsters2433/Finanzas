import { getDb } from "@/lib/db";
import { body, fail, num, ok, str } from "@/lib/http";
import { parseAmountToCents } from "@/lib/money";
import { todayISO } from "@/lib/dates";
import { listRecurring } from "@/lib/stats";

export const runtime = "nodejs";

const FREQUENCIES = new Set(["weekly", "monthly", "quarterly", "yearly"]);
const KINDS = new Set(["subscription", "fixed", "income"]);

export async function GET(request: Request) {
  const kind = new URL(request.url).searchParams.get("kind") ?? undefined;
  return ok({ items: listRecurring(kind) });
}

export async function POST(request: Request) {
  const payload = await body(request);
  const name = str(payload.name);
  if (!name) return fail("Ponle un nombre.");

  const cents = parseAmountToCents(str(payload.amount));
  if (!Number.isFinite(cents) || cents === 0) return fail("Importe no válido.");

  const kind = str(payload.kind, "subscription");
  const frequency = str(payload.frequency, "monthly");
  if (!KINDS.has(kind)) return fail("Tipo no válido.");
  if (!FREQUENCIES.has(frequency)) return fail("Periodicidad no válida.");

  const info = getDb()
    .prepare(
      `INSERT INTO recurring
         (name, kind, amount_cents, currency, category_id, frequency, interval_n,
          first_date, end_date, reminder_days, notes)
       VALUES (?, ?, ?, 'EUR', ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      name,
      kind,
      Math.abs(cents),
      num(payload.categoryId, 0) || null,
      frequency,
      Math.max(1, num(payload.interval, 1)),
      str(payload.firstDate) || todayISO(),
      str(payload.endDate) || null,
      Math.max(0, num(payload.reminderDays, 1)),
      str(payload.notes) || null,
    );

  return ok({ id: info.lastInsertRowid }, { status: 201 });
}
