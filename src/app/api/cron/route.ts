import { fail, handleError, ok } from "@/lib/http";
import { syncAllAccounts } from "@/lib/sync";
import {
  notifyBudgetOverruns,
  notifyDailyDigest,
  notifyNewSpending,
  notifyUpcomingCharges,
} from "@/lib/notify";
import { todayISO } from "@/lib/dates";
import { pushConfigured } from "@/lib/push";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * Single entry point for schedulers (cron, systemd timer, n8n).
 * `?job=sync` pulls movements and alerts on new spending;
 * `?job=digest` sends the end-of-day recap;
 * `?job=reminders` sends subscription and budget alerts.
 * Without `job`, it runs everything.
 */
async function run(request: Request) {
  const url = new URL(request.url);
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided =
      url.searchParams.get("secret") ??
      request.headers.get("x-cron-secret") ??
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (provided !== secret) return fail("No autorizado", 401);
  }

  const job = url.searchParams.get("job") ?? "all";
  const day = url.searchParams.get("day") ?? todayISO();
  const report: Record<string, unknown> = { job, day, pushConfigured: pushConfigured() };
  const problems: string[] = [];

  // A missing push key or a flaky bank must not abort the rest of the run.
  const attempt = async <T>(name: string, task: () => Promise<T>): Promise<T | null> => {
    try {
      return await task();
    } catch (err) {
      problems.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  };

  try {
    if (job === "sync" || job === "all") {
      const result = await syncAllAccounts();
      report.sync = {
        imported: result.imported,
        skipped: result.skipped,
        errors: result.errors,
        spentCents: result.totalNewSpentCents,
      };
      report.spendingNotified = await attempt("gasto", () => notifyNewSpending(result));
    }
    if (job === "reminders" || job === "all") {
      report.chargeReminders = await attempt("cargos", () => notifyUpcomingCharges(day));
      report.budgetAlerts = await attempt("presupuestos", () => notifyBudgetOverruns(day));
    }
    if (job === "digest" || job === "all") {
      report.digestSent = await attempt("resumen", () => notifyDailyDigest(day));
    }
    if (problems.length) report.problems = problems;
    return ok(report);
  } catch (err) {
    return handleError(err);
  }
}

export const GET = run;
export const POST = run;
