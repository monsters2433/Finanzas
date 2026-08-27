import { getDb } from "@/lib/db";
import { body, fail, num, ok, str } from "@/lib/http";
import { categorize, extractMerchant, fallbackCategoryId } from "@/lib/categorize";
import { parseAmountToCents } from "@/lib/money";
import { todayISO } from "@/lib/dates";
import { detectPayrolls } from "@/lib/payroll";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const where: string[] = ["1 = 1"];
  const args: unknown[] = [];

  const month = params.get("month");
  if (month) {
    where.push("t.booked_date LIKE ?");
    args.push(`${month}%`);
  }
  const category = params.get("category");
  if (category) {
    where.push("t.category_id = ?");
    args.push(Number(category));
  }
  const q = params.get("q");
  if (q) {
    where.push("(LOWER(t.merchant) LIKE ? OR LOWER(t.description) LIKE ?)");
    args.push(`%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`);
  }
  const kind = params.get("kind");
  if (kind === "expense") where.push("t.amount_cents < 0");
  if (kind === "income") where.push("t.amount_cents > 0");

  const limit = Math.min(500, num(params.get("limit"), 200));

  const rows = getDb()
    .prepare(
      `SELECT t.*, c.name AS category_name, c.color AS category_color, a.name AS account_name
         FROM transactions t
         LEFT JOIN categories c ON c.id = t.category_id
         LEFT JOIN accounts a   ON a.id = t.account_id
        WHERE ${where.join(" AND ")}
        ORDER BY t.booked_date DESC, t.id DESC
        LIMIT ?`,
    )
    .all(...args, limit);

  return ok({ transactions: rows });
}

/** Manual entry, for cash or anything the bank does not see. */
export async function POST(request: Request) {
  const payload = await body(request);
  const amountRaw = str(payload.amount);
  const cents = parseAmountToCents(amountRaw);
  if (!Number.isFinite(cents) || cents === 0) return fail("Importe no válido.");

  const merchant = extractMerchant(str(payload.merchant));
  if (!merchant) return fail("Indica el comercio o concepto.");

  const isIncome = Boolean(payload.income);
  const signed = isIncome ? Math.abs(cents) : -Math.abs(cents);
  const description = str(payload.description);
  const categoryId =
    num(payload.categoryId, 0) || categorize(`${merchant} ${description}`) || fallbackCategoryId();

  const info = getDb()
    .prepare(
      `INSERT INTO transactions
         (source, booked_date, value_date, amount_cents, currency, merchant, description, category_id, notes)
       VALUES ('manual', ?, ?, ?, 'EUR', ?, ?, ?, ?)`,
    )
    .run(
      str(payload.date) || todayISO(),
      str(payload.date) || todayISO(),
      signed,
      merchant,
      description,
      categoryId || null,
      str(payload.notes) || null,
    );

  if (isIncome) detectPayrolls();
  return ok({ id: info.lastInsertRowid }, { status: 201 });
}
