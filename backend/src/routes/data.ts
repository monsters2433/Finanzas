import { Hono } from "hono";
import type { AppBindings } from "../types";
import { requireAuth } from "../middleware";
import { uid, str, num, bool, nowISO } from "../util";

const data = new Hono<AppBindings>();
data.use("*", requireAuth); // todo lo de aquí requiere sesión

// ---------- helpers ----------
type FieldSpec = { col: string; kind: "text" | "num" | "bool"; max?: number; def?: any };

/** CRUD genérico para tablas simples colgadas de user_id. */
function crud(table: string, fields: FieldSpec[], mapOut: (row: any) => any) {
  const r = new Hono<AppBindings>();

  r.post("/", async (c) => {
    const u = c.get("user");
    const b = await c.req.json().catch(() => ({}));
    const id = uid();
    const cols = ["id", "user_id"];
    const vals: any[] = [id, u.sub];
    for (const f of fields) {
      cols.push(f.col);
      vals.push(coerce(f, b[f.col]));
    }
    const ph = cols.map(() => "?").join(", ");
    await c.env.DB.prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${ph})`).bind(...vals).run();
    const row = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ? AND user_id = ?`).bind(id, u.sub).first();
    return c.json(mapOut(row), 201);
  });

  r.patch("/:id", async (c) => {
    const u = c.get("user");
    const id = c.req.param("id");
    const b = await c.req.json().catch(() => ({}));
    const sets: string[] = [];
    const vals: any[] = [];
    for (const f of fields) {
      if (f.col in b) {
        sets.push(`${f.col} = ?`);
        vals.push(coerce(f, b[f.col]));
      }
    }
    if (!sets.length) return c.json({ error: "nada_que_actualizar" }, 400);
    sets.push("updated_at = ?");
    vals.push(nowISO(), id, u.sub);
    const res = await c.env.DB.prepare(
      `UPDATE ${table} SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`
    )
      .bind(...vals)
      .run();
    if (!res.meta.changes) return c.json({ error: "no_encontrado" }, 404);
    const row = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ? AND user_id = ?`).bind(id, u.sub).first();
    return c.json(mapOut(row));
  });

  r.delete("/:id", async (c) => {
    const u = c.get("user");
    const res = await c.env.DB.prepare(`DELETE FROM ${table} WHERE id = ? AND user_id = ?`)
      .bind(c.req.param("id"), u.sub)
      .run();
    if (!res.meta.changes) return c.json({ error: "no_encontrado" }, 404);
    return c.json({ ok: true });
  });

  return r;
}

function coerce(f: FieldSpec, v: any) {
  if (v === undefined || v === null) return f.def ?? (f.kind === "num" ? 0 : f.kind === "bool" ? 0 : null);
  if (f.kind === "num") return num(v);
  if (f.kind === "bool") return bool(v);
  return str(v, f.max ?? 200);
}

// ---------- mapeos (DB -> forma del frontend) ----------
const mapSub = (r: any) => ({
  id: r.id, nombre: r.nombre, importe: r.importe, moneda: r.moneda, ciclo: r.ciclo,
  fecha: r.fecha, categoria: r.categoria, aviso: r.aviso, metodo: r.metodo || "",
  notas: r.notas || "", pausado: !!r.pausado,
});
const mapIncome = (r: any) => ({ id: r.id, nombre: r.nombre, importe: r.importe, moneda: r.moneda, ciclo: r.ciclo });
const mapExpense = (r: any) => ({
  id: r.id, concepto: r.concepto, importe: r.importe, moneda: r.moneda, fecha: r.fecha, categoria: r.categoria,
});

// ---------- tablas simples ----------
data.route(
  "/subscriptions",
  crud(
    "subscriptions",
    [
      { col: "nombre", kind: "text", max: 60 },
      { col: "importe", kind: "num" },
      { col: "moneda", kind: "text", max: 3, def: "EUR" },
      { col: "ciclo", kind: "text", max: 12, def: "mensual" },
      { col: "fecha", kind: "text", max: 10 },
      { col: "categoria", kind: "text", max: 20 },
      { col: "aviso", kind: "num", def: 3 },
      { col: "metodo", kind: "text", max: 40 },
      { col: "notas", kind: "text", max: 300 },
      { col: "pausado", kind: "bool", def: 0 },
    ],
    mapSub
  )
);

data.route(
  "/incomes",
  crud(
    "incomes",
    [
      { col: "nombre", kind: "text", max: 60 },
      { col: "importe", kind: "num" },
      { col: "moneda", kind: "text", max: 3, def: "EUR" },
      { col: "ciclo", kind: "text", max: 12, def: "mensual" },
    ],
    mapIncome
  )
);

data.route(
  "/expenses",
  crud(
    "expenses",
    [
      { col: "concepto", kind: "text", max: 60 },
      { col: "importe", kind: "num" },
      { col: "moneda", kind: "text", max: 3, def: "EUR" },
      { col: "fecha", kind: "text", max: 10 },
      { col: "categoria", kind: "text", max: 20, def: "otros" },
    ],
    mapExpense
  )
);

// ---------- metas de ahorro (con aportaciones) ----------
async function goalWithContribs(db: D1Database, row: any) {
  const cs = await db.prepare("SELECT amount, date FROM contributions WHERE goal_id = ? ORDER BY date").bind(row.id).all();
  return {
    id: row.id, emoji: row.emoji, name: row.nombre, target: row.objetivo,
    createdAt: (row.created_at || "").slice(0, 10),
    contribs: (cs.results || []).map((x: any) => ({ amount: x.amount, date: x.date })),
  };
}

data.post("/goals", async (c) => {
  const u = c.get("user");
  const b = await c.req.json().catch(() => ({}));
  const id = uid();
  await c.env.DB.prepare("INSERT INTO goals (id, user_id, emoji, nombre, objetivo) VALUES (?, ?, ?, ?, ?)")
    .bind(id, u.sub, str(b.emoji, 4) || "🎯", str(b.name ?? b.nombre, 40), num(b.target ?? b.objetivo))
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM goals WHERE id = ? AND user_id = ?").bind(id, u.sub).first();
  return c.json(await goalWithContribs(c.env.DB, row), 201);
});

data.delete("/goals/:id", async (c) => {
  const u = c.get("user");
  const res = await c.env.DB.prepare("DELETE FROM goals WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), u.sub)
    .run();
  if (!res.meta.changes) return c.json({ error: "no_encontrado" }, 404);
  return c.json({ ok: true });
});

// añadir una aportación a una meta (verifica propiedad)
data.post("/goals/:id/contributions", async (c) => {
  const u = c.get("user");
  const goalId = c.req.param("id");
  const owns = await c.env.DB.prepare("SELECT id FROM goals WHERE id = ? AND user_id = ?").bind(goalId, u.sub).first();
  if (!owns) return c.json({ error: "no_encontrado" }, 404);
  const b = await c.req.json().catch(() => ({}));
  const amount = num(b.amount);
  if (!(amount > 0)) return c.json({ error: "importe_invalido" }, 400);
  const date = str(b.date, 10) || nowISO().slice(0, 10);
  await c.env.DB.prepare("INSERT INTO contributions (id, goal_id, amount, date) VALUES (?, ?, ?, ?)")
    .bind(uid(), goalId, Math.round(amount * 100) / 100, date)
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM goals WHERE id = ?").bind(goalId).first();
  return c.json(await goalWithContribs(c.env.DB, row), 201);
});

// ---------- estado agregado (lo que carga el frontend al arrancar) ----------
data.get("/state", async (c) => {
  const u = c.get("user");
  const db = c.env.DB;
  const [subs, ingresos, gastos, goals, user] = await Promise.all([
    db.prepare("SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at").bind(u.sub).all(),
    db.prepare("SELECT * FROM incomes WHERE user_id = ? ORDER BY created_at").bind(u.sub).all(),
    db.prepare("SELECT * FROM expenses WHERE user_id = ? ORDER BY fecha DESC").bind(u.sub).all(),
    db.prepare("SELECT * FROM goals WHERE user_id = ? ORDER BY created_at").bind(u.sub).all(),
    db.prepare("SELECT id, email, name, currency, locale, plan, preferences FROM users WHERE id = ?").bind(u.sub).first<any>(),
  ]);
  const goalsFull = await Promise.all((goals.results || []).map((g: any) => goalWithContribs(db, g)));
  const prefs = JSON.parse((user?.preferences as string) || "{}");
  return c.json({
    user: user ? { id: user.id, email: user.email, name: user.name, currency: user.currency, locale: user.locale, plan: user.plan } : null,
    subs: (subs.results || []).map(mapSub),
    ingresos: (ingresos.results || []).map(mapIncome),
    gastos: (gastos.results || []).map(mapExpense),
    ahorro: { goals: goalsFull, likes: prefs.likes || {} },
  });
});

export default data;
