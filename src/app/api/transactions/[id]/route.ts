import { getDb } from "@/lib/db";
import { body, ok } from "@/lib/http";
import { detectPayrolls } from "@/lib/payroll";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = await body(request);
  const db = getDb();

  if ("categoryId" in payload) {
    const value = payload.categoryId;
    db.prepare("UPDATE transactions SET category_id = ? WHERE id = ?").run(
      value === null || value === "" ? null : Number(value),
      Number(id),
    );
  }
  if ("excluded" in payload) {
    db.prepare("UPDATE transactions SET excluded = ? WHERE id = ?").run(
      payload.excluded ? 1 : 0,
      Number(id),
    );
  }
  if ("isPayroll" in payload) {
    // Record it as an override so the next detection run does not undo it.
    const value = payload.isPayroll ? 1 : 0;
    db.prepare("UPDATE transactions SET is_payroll = ?, payroll_override = ? WHERE id = ?").run(
      value,
      value,
      Number(id),
    );
  }
  if ("notes" in payload) {
    db.prepare("UPDATE transactions SET notes = ? WHERE id = ?").run(
      typeof payload.notes === "string" ? payload.notes : null,
      Number(id),
    );
  }
  return ok({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Bank movements come back on the next sync, so only manual rows are removable.
  const info = getDb()
    .prepare("DELETE FROM transactions WHERE id = ? AND source = 'manual'")
    .run(Number(id));
  if (info.changes === 0) {
    getDb().prepare("UPDATE transactions SET excluded = 1 WHERE id = ?").run(Number(id));
    return ok({ ok: true, excluded: true });
  }
  detectPayrolls();
  return ok({ ok: true });
}
