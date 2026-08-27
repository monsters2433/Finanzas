import { getDb } from "@/lib/db";
import { ok } from "@/lib/http";

export const runtime = "nodejs";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  getDb().prepare("DELETE FROM rules WHERE id = ?").run(Number(id));
  return ok({ ok: true });
}
