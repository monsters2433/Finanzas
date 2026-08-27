import { getDb } from "@/lib/db";
import { body, fail, ok, str } from "@/lib/http";
import { pushConfigured } from "@/lib/push";

export const runtime = "nodejs";

export async function GET() {
  const count = getDb().prepare("SELECT COUNT(*) AS n FROM push_subscriptions").get() as { n: number };
  return ok({
    configured: pushConfigured(),
    publicKey: process.env.VAPID_PUBLIC_KEY ?? null,
    devices: count.n,
  });
}

export async function POST(request: Request) {
  const payload = await body<{
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    label?: string;
  }>(request);

  const endpoint = str(payload.endpoint);
  const p256dh = str(payload.keys?.p256dh);
  const auth = str(payload.keys?.auth);
  if (!endpoint || !p256dh || !auth) return fail("Suscripción push incompleta.");

  getDb()
    .prepare(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth, label)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`,
    )
    .run(endpoint, p256dh, auth, str(payload.label) || null);

  return ok({ ok: true });
}

export async function DELETE(request: Request) {
  const { endpoint } = await body<{ endpoint?: string }>(request);
  if (endpoint) getDb().prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
  return ok({ ok: true });
}
