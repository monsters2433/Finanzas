import { getDb } from "@/lib/db";
import { body, ok } from "@/lib/http";
import { parseAmountToCents } from "@/lib/money";

export const runtime = "nodejs";

const FIELDS: Record<string, { column: string; transform: (v: unknown) => unknown }> = {
  name: { column: "name", transform: (v) => String(v) },
  kind: { column: "kind", transform: (v) => String(v) },
  amount: { column: "amount_cents", transform: (v) => Math.abs(parseAmountToCents(String(v))) },
  categoryId: { column: "category_id", transform: (v) => (v ? Number(v) : null) },
  frequency: { column: "frequency", transform: (v) => String(v) },
  interval: { column: "interval_n", transform: (v) => Math.max(1, Number(v) || 1) },
  firstDate: { column: "first_date", transform: (v) => String(v) },
  endDate: { column: "end_date", transform: (v) => (v ? String(v) : null) },
  reminderDays: { column: "reminder_days", transform: (v) => Math.max(0, Number(v) || 0) },
  active: { column: "active", transform: (v) => (v ? 1 : 0) },
  notes: { column: "notes", transform: (v) => (v ? String(v) : null) },
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = await body(request);

  const sets: string[] = [];
  const args: unknown[] = [];
  for (const [key, spec] of Object.entries(FIELDS)) {
    if (!(key in payload)) continue;
    sets.push(`${spec.column} = ?`);
    args.push(spec.transform(payload[key]));
  }
  if (sets.length === 0) return ok({ ok: true });

  getDb()
    .prepare(`UPDATE recurring SET ${sets.join(", ")} WHERE id = ?`)
    .run(...args, Number(id));
  return ok({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  getDb().prepare("DELETE FROM recurring WHERE id = ?").run(Number(id));
  return ok({ ok: true });
}
