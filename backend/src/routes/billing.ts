import { Hono } from "hono";
import type { AppBindings } from "../types";
import { requireAuth } from "../middleware";
import { nowISO } from "../util";

const billing = new Hono<AppBindings>();

// Verificación de la firma del webhook de Stripe (esquema `t=...,v1=...`).
async function verifyStripeSig(payload: string, header: string, secret: string): Promise<boolean> {
  try {
    const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=")));
    const signed = `${parts.t}.${payload}`;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signed));
    const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
    return hex === parts.v1;
  } catch {
    return false;
  }
}

// POST /api/billing/checkout  -> crea una sesión de pago y devuelve la URL
billing.post("/checkout", requireAuth, async (c) => {
  if (!c.env.STRIPE_SECRET_KEY) return c.json({ error: "stripe_no_configurado" }, 501);
  const u = c.get("user");
  const priceId = (await c.req.json().catch(() => ({}))).priceId as string;
  if (!priceId) return c.json({ error: "falta_priceId" }, 400);

  const form = new URLSearchParams();
  form.set("mode", "subscription");
  form.set("line_items[0][price]", priceId);
  form.set("line_items[0][quantity]", "1");
  form.set("success_url", `${c.env.APP_ORIGIN}/?checkout=ok`);
  form.set("cancel_url", `${c.env.APP_ORIGIN}/?checkout=cancel`);
  form.set("client_reference_id", u.sub);
  form.set("customer_email", u.email);
  form.set("subscription_data[trial_period_days]", "7");

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${c.env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const session = await res.json<any>();
  if (!res.ok) return c.json({ error: "stripe_error", detail: session }, 502);
  return c.json({ url: session.url });
});

// POST /api/billing/webhook  (Stripe -> nosotros; sin cookies)
billing.post("/webhook", async (c) => {
  const secret = c.env.STRIPE_WEBHOOK_SECRET;
  const sig = c.req.header("stripe-signature") || "";
  const raw = await c.req.text();
  if (secret && !(await verifyStripeSig(raw, sig, secret))) return c.json({ error: "firma_invalida" }, 400);

  const event = JSON.parse(raw);
  const obj = event.data?.object || {};

  async function setPlan(userId: string, plan: string, sub: any) {
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE users SET plan = ?, updated_at = ? WHERE id = ?").bind(plan, nowISO(), userId),
      c.env.DB.prepare(
        `INSERT INTO billing (user_id, stripe_customer_id, stripe_subscription_id, status, current_period_end, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET stripe_customer_id=excluded.stripe_customer_id,
           stripe_subscription_id=excluded.stripe_subscription_id, status=excluded.status,
           current_period_end=excluded.current_period_end, updated_at=excluded.updated_at`
      ).bind(userId, sub.customer || null, sub.subscription || sub.id || null, sub.status || null,
             sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null, nowISO()),
    ]);
  }

  switch (event.type) {
    case "checkout.session.completed":
      if (obj.client_reference_id) await setPlan(obj.client_reference_id, "plus", obj);
      break;
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const row = await c.env.DB.prepare("SELECT user_id FROM billing WHERE stripe_subscription_id = ?").bind(obj.id).first<any>();
      if (row) await setPlan(row.user_id, obj.status === "active" || obj.status === "trialing" ? "plus" : "free", obj);
      break;
    }
  }
  return c.json({ received: true });
});

export default billing;
