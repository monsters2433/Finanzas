import { getDb } from "@/lib/db";
import { fail, handleError, ok } from "@/lib/http";
import { deleteRequisition } from "@/lib/gocardless";

export const runtime = "nodejs";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const row = db
    .prepare("SELECT requisition_id FROM bank_connections WHERE id = ?")
    .get(Number(id)) as { requisition_id: string } | undefined;
  if (!row) return fail("Conexión no encontrada.", 404);

  try {
    await deleteRequisition(row.requisition_id).catch(() => null);
    // Keep the imported history; just detach the accounts from the dead consent.
    db.prepare("UPDATE accounts SET archived = 1 WHERE connection_id = ?").run(Number(id));
    db.prepare("DELETE FROM bank_connections WHERE id = ?").run(Number(id));
    return ok({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
