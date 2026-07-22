import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env, AppBindings } from "./types";
import authRoutes from "./routes/auth";
import dataRoutes from "./routes/data";
import billingRoutes from "./routes/billing";

const app = new Hono<AppBindings>();

// CORS: permite el origen de la app (y localhost en desarrollo) con cookies.
app.use("*", (c, next) =>
  cors({
    origin: (o) => (o === c.env.APP_ORIGIN || /^http:\/\/localhost(:\d+)?$/.test(o) ? o : c.env.APP_ORIGIN),
    credentials: true,
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  })(c, next)
);

app.get("/", (c) => c.json({ name: "ciclo-api", ok: true }));
app.get("/api/health", (c) => c.json({ ok: true, ts: Date.now() }));

app.route("/api/auth", authRoutes);
app.route("/api", dataRoutes);
app.route("/api/billing", billingRoutes);

app.notFound((c) => c.json({ error: "no_encontrado" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "error_interno" }, 500);
});

// ---------- próxima ocurrencia de un pago (réplica de la lógica del frontend) ----------
const CYCLE_MONTHS: Record<string, number> = { mensual: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };
function nextOccurrence(sub: any, from: Date): Date {
  const [y, m, d] = String(sub.fecha).split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d));
  if (sub.ciclo === "semanal") {
    const dt = new Date(anchor);
    while (dt < from) dt.setUTCDate(dt.getUTCDate() + 7);
    return dt;
  }
  const step = CYCLE_MONTHS[sub.ciclo] || 1;
  let k = 0;
  let occ = new Date(anchor);
  while (occ < from && k < 6000) {
    k++;
    const total = anchor.getUTCMonth() + step * k;
    const yy = anchor.getUTCFullYear() + Math.floor(total / 12);
    const mm = ((total % 12) + 12) % 12;
    const dim = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
    occ = new Date(Date.UTC(yy, mm, Math.min(anchor.getUTCDate(), dim)));
  }
  return occ;
}

async function sendEmail(env: Env, to: string, subject: string, html: string) {
  if (!env.RESEND_API_KEY) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "Ciclo <avisos@ciclo.app>", to, subject, html }),
  }).catch(() => {});
}

// ---------- Cron: recordatorios de renovación ----------
async function runReminders(env: Env) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const subs = await env.DB.prepare(
    `SELECT s.*, u.email AS email FROM subscriptions s JOIN users u ON u.id = s.user_id WHERE s.pausado = 0`
  ).all<any>();

  for (const s of subs.results || []) {
    const occ = nextOccurrence(s, today);
    const days = Math.round((occ.getTime() - today.getTime()) / 86400000);
    if (days < 0 || days > s.aviso) continue;
    const occDate = occ.toISOString().slice(0, 10);
    const dup = await env.DB.prepare(
      "SELECT 1 FROM notifications_sent WHERE sub_id = ? AND occ_date = ? AND channel = 'email'"
    ).bind(s.id, occDate).first();
    if (dup) continue;

    const when = days === 0 ? "hoy" : days === 1 ? "mañana" : `en ${days} días`;
    await sendEmail(
      env,
      s.email,
      `${s.nombre} se renueva ${when}`,
      `<p><b>${s.nombre}</b> — ${s.importe} ${s.moneda}</p><p>Se renueva ${when} (${occDate}).</p><p>— Ciclo</p>`
    );
    await env.DB.prepare(
      "INSERT OR IGNORE INTO notifications_sent (user_id, sub_id, occ_date, channel) VALUES (?, ?, ?, 'email')"
    ).bind(s.user_id, s.id, occDate).run();
  }
}

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runReminders(env));
  },
};
