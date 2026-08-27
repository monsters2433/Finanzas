import { getDb } from "@/lib/db";
import { body, fail, ok, str } from "@/lib/http";
import { parseAmountToCents } from "@/lib/money";

export const runtime = "nodejs";

export async function GET() {
  const categories = getDb()
    .prepare("SELECT * FROM categories ORDER BY kind, name")
    .all();
  return ok({ categories });
}

export async function POST(request: Request) {
  const payload = await body(request);
  const name = str(payload.name);
  if (!name) return fail("Ponle un nombre a la categoría.");
  try {
    const budget = str(payload.budget);
    const info = getDb()
      .prepare("INSERT INTO categories (name, kind, color, monthly_budget_cents) VALUES (?, ?, ?, ?)")
      .run(
        name,
        str(payload.kind, "variable"),
        str(payload.color, "#4f8cff"),
        budget ? Math.abs(parseAmountToCents(budget)) : null,
      );
    return ok({ id: info.lastInsertRowid }, { status: 201 });
  } catch {
    return fail("Ya existe una categoría con ese nombre.", 409);
  }
}
