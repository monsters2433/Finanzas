import { getDb } from "@/lib/db";
import { body, ok } from "@/lib/http";
import { parseAmountToCents } from "@/lib/money";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = await body(request);
  const db = getDb();

  if ("budget" in payload) {
    const raw = typeof payload.budget === "string" ? payload.budget.trim() : payload.budget;
    const cents = raw === "" || raw === null ? null : Math.abs(parseAmountToCents(String(raw)));
    db.prepare("UPDATE categories SET monthly_budget_cents = ? WHERE id = ?").run(
      cents !== null && Number.isFinite(cents) ? cents : null,
      Number(id),
    );
  }
  for (const [key, column] of [["name", "name"], ["kind", "kind"], ["color", "color"]] as const) {
    if (key in payload) {
      db.prepare(`UPDATE categories SET ${column} = ? WHERE id = ?`).run(String(payload[key]), Number(id));
    }
  }
  return ok({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  getDb().prepare("DELETE FROM categories WHERE id = ? AND name <> 'Sin categoría'").run(Number(id));
  return ok({ ok: true });
}
