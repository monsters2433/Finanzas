import { handleError, ok } from "@/lib/http";
import { syncAllAccounts } from "@/lib/sync";
import { notifyNewSpending } from "@/lib/notify";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  try {
    const result = await syncAllAccounts();
    const notified = await notifyNewSpending(result).catch(() => false);
    return ok({ ...result, notified });
  } catch (err) {
    return handleError(err);
  }
}
