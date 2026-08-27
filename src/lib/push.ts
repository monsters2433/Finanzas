import webpush from "web-push";
import { getDb } from "./db";

let configured = false;

export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function ensureConfigured(): void {
  if (configured) return;
  if (!pushConfigured()) throw new Error("Faltan las claves VAPID (ejecuta `npm run vapid`).");
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:finanzas@localhost",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  configured = true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export type PushResult = { sent: number; removed: number; failed: number; errors: string[] };

/**
 * Sends to every registered device. Endpoints the browser has retired
 * (404/410) are dropped so the list does not rot; anything else is reported
 * back rather than swallowed, otherwise a broken setup looks like silence.
 */
export async function sendPush(payload: PushPayload): Promise<PushResult> {
  ensureConfigured();
  const db = getDb();
  const subs = db
    .prepare("SELECT id, endpoint, p256dh, auth FROM push_subscriptions")
    .all() as Array<{ id: number; endpoint: string; p256dh: string; auth: string }>;

  let sent = 0;
  let removed = 0;
  const errors: string[] = [];
  const body = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        );
        sent += 1;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          db.prepare("DELETE FROM push_subscriptions WHERE id = ?").run(sub.id);
          removed += 1;
          return;
        }
        const host = safeHost(sub.endpoint);
        const detail = err instanceof Error ? err.message : String(err);
        errors.push(`${host}: ${status ? `HTTP ${status} — ` : ""}${detail}`.slice(0, 200));
      }
    }),
  );

  return { sent, removed, failed: errors.length, errors };
}

function safeHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return "endpoint desconocido";
  }
}

/** Sends at most once per key — safe to call from a cron that overlaps. */
export async function sendPushOnce(key: string, payload: PushPayload): Promise<boolean> {
  const db = getDb();
  const info = db
    .prepare("INSERT INTO notification_log (key, title, body) VALUES (?, ?, ?) ON CONFLICT(key) DO NOTHING")
    .run(key, payload.title, payload.body);
  if (info.changes === 0) return false;
  try {
    const result = await sendPush(payload);
    if (result.sent === 0 && result.failed > 0) {
      throw new Error(`No se pudo entregar a ningún dispositivo. ${result.errors[0]}`);
    }
    return true;
  } catch (err) {
    // Roll the guard back so a transient failure can be retried.
    db.prepare("DELETE FROM notification_log WHERE key = ?").run(key);
    throw err;
  }
}
