import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import type { AppBindings } from "../types";
import { requireAuth } from "../middleware";
import { hashPassword, verifyPassword, signToken, uid, isEmail, str, nowISO } from "../util";

const auth = new Hono<AppBindings>();
const SESSION_DAYS = 30;

function sessionCookie(c: any, token: string) {
  const secure = String(c.env.APP_ORIGIN || "").startsWith("https");
  setCookie(c, "ciclo_session", token, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

async function issue(c: any, user: { id: string; email: string }) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 24 * 60 * 60;
  const token = await signToken({ sub: user.id, email: user.email, exp }, c.env.AUTH_SECRET);
  sessionCookie(c, token);
  return token;
}

// POST /api/auth/signup
auth.post("/signup", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!isEmail(b.email)) return c.json({ error: "email_invalido" }, 400);
  if (typeof b.password !== "string" || b.password.length < 8)
    return c.json({ error: "password_corta" }, 400);

  const email = (b.email as string).toLowerCase();
  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (existing) return c.json({ error: "email_en_uso" }, 409);

  const id = uid();
  const hash = await hashPassword(b.password);
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, name, country, currency, locale)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      email,
      hash,
      str(b.name, 80) || email.split("@")[0],
      str(b.country, 2) || null,
      str(b.currency, 3) || "EUR",
      str(b.locale, 10) || "es-ES"
    )
    .run();

  const token = await issue(c, { id, email });
  return c.json({
    token,
    user: { id, email, name: str(b.name, 80) || email.split("@")[0], plan: "free", currency: str(b.currency, 3) || "EUR" },
  });
});

// POST /api/auth/login
auth.post("/login", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!isEmail(b.email) || typeof b.password !== "string") return c.json({ error: "credenciales" }, 400);

  const email = (b.email as string).toLowerCase();
  const row = await c.env.DB.prepare(
    "SELECT id, email, password_hash, name, plan, currency FROM users WHERE email = ?"
  )
    .bind(email)
    .first<any>();

  if (!row || !row.password_hash || !(await verifyPassword(b.password, row.password_hash)))
    return c.json({ error: "credenciales_incorrectas" }, 401);

  const token = await issue(c, { id: row.id, email: row.email });
  return c.json({
    token,
    user: { id: row.id, email: row.email, name: row.name, plan: row.plan, currency: row.currency },
  });
});

// POST /api/auth/logout
auth.post("/logout", (c) => {
  deleteCookie(c, "ciclo_session", { path: "/" });
  return c.json({ ok: true });
});

// GET /api/auth/me
auth.get("/me", requireAuth, async (c) => {
  const u = c.get("user");
  const row = await c.env.DB.prepare(
    "SELECT id, email, name, country, currency, locale, plan, preferences FROM users WHERE id = ?"
  )
    .bind(u.sub)
    .first<any>();
  if (!row) return c.json({ error: "no_encontrado" }, 404);
  row.preferences = JSON.parse(row.preferences || "{}");
  return c.json({ user: row });
});

// PATCH /api/auth/me  -> actualizar preferencias (likes de ideas, avisosOn, moneda...)
auth.patch("/me", requireAuth, async (c) => {
  const u = c.get("user");
  const b = await c.req.json().catch(() => ({}));
  const fields: string[] = [];
  const vals: any[] = [];
  if (typeof b.preferences === "object") {
    fields.push("preferences = ?");
    vals.push(JSON.stringify(b.preferences));
  }
  if (typeof b.currency === "string") {
    fields.push("currency = ?");
    vals.push(str(b.currency, 3));
  }
  if (typeof b.name === "string") {
    fields.push("name = ?");
    vals.push(str(b.name, 80));
  }
  if (!fields.length) return c.json({ ok: true });
  fields.push("updated_at = ?");
  vals.push(nowISO());
  vals.push(u.sub);
  await c.env.DB.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});

export default auth;
