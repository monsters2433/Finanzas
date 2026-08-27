import { getDb, setSetting } from "@/lib/db";
import { body, ok } from "@/lib/http";
import { parseAmountToCents } from "@/lib/money";

export const runtime = "nodejs";

const ALLOWED = new Set([
  "payroll_min_cents",
  "deduction_rate",
  "budget_alert_ratio",
  "calendar_token",
]);

export async function GET() {
  const rows = getDb().prepare("SELECT key, value FROM settings").all() as Array<{
    key: string;
    value: string;
  }>;
  const settings = Object.fromEntries(
    rows.filter((r) => ALLOWED.has(r.key)).map((r) => [r.key, r.value]),
  );
  return ok({ settings });
}

export async function POST(request: Request) {
  const payload = await body(request);

  if ("payrollMin" in payload) {
    const cents = Math.abs(parseAmountToCents(String(payload.payrollMin)));
    if (Number.isFinite(cents)) setSetting("payroll_min_cents", String(cents));
  }
  if ("deductionRate" in payload) {
    const pct = Number(payload.deductionRate);
    if (Number.isFinite(pct) && pct >= 0 && pct < 90) {
      setSetting("deduction_rate", String(pct / 100));
    }
  }
  if ("budgetAlertRatio" in payload) {
    const pct = Number(payload.budgetAlertRatio);
    if (Number.isFinite(pct) && pct > 0) setSetting("budget_alert_ratio", String(pct / 100));
  }
  return ok({ ok: true });
}
