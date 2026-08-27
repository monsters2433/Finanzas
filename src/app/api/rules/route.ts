import { getDb } from "@/lib/db";
import { body, fail, num, ok, str } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  const rules = getDb()
    .prepare(
      `SELECT r.*, c.name AS category_name, c.color AS category_color
         FROM rules r LEFT JOIN categories c ON c.id = r.category_id
        ORDER BY r.priority DESC, r.id`,
    )
    .all();
  return ok({ rules });
}

export async function POST(request: Request) {
  const payload = await body(request);
  const pattern = str(payload.pattern);
  const categoryId = num(payload.categoryId, 0);
  if (!pattern) return fail("Escribe el texto o expresión a buscar.");
  if (!categoryId) return fail("Elige una categoría.");
  try {
    new RegExp(pattern, "i");
  } catch {
    return fail("La expresión regular no es válida.");
  }
  const info = getDb()
    .prepare("INSERT INTO rules (pattern, category_id, priority) VALUES (?, ?, ?)")
    .run(pattern, categoryId, num(payload.priority, 10));
  return ok({ id: info.lastInsertRowid }, { status: 201 });
}
