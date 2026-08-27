import { fail, handleError, ok } from "@/lib/http";
import { sendPush } from "@/lib/push";
import { monthSummary } from "@/lib/stats";
import { monthKey, todayISO } from "@/lib/dates";
import { formatCents } from "@/lib/money";

export const runtime = "nodejs";

export async function POST() {
  try {
    const summary = monthSummary(monthKey(todayISO()));
    const result = await sendPush({
      title: "Notificaciones activadas",
      body: `Llevas ${formatCents(summary.spentCents)} gastados este mes.`,
      url: "/",
      tag: "prueba",
    });
    if (result.sent === 0 && result.failed > 0) return fail(result.errors[0], 502);
    return ok(result);
  } catch (err) {
    return handleError(err);
  }
}
