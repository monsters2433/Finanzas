import { getDb, getSettingNumber } from "./db";
import { addDays, formatDateES, monthKey, todayISO } from "./dates";
import { formatCents } from "./money";
import { sendPushOnce } from "./push";
import type { SyncResult } from "./sync";
import { monthSummary, upcomingCharges } from "./stats";
import { analyzeSalary } from "./payroll";

/** "Has gastado X" right after a sync brings in new outgoing movements. */
export async function notifyNewSpending(result: SyncResult): Promise<boolean> {
  if (result.newSpending.length === 0) return false;

  const items = [...result.newSpending].sort((a, b) => a.amount_cents - b.amount_cents);
  const head = items[0];
  const rest = items.length - 1;

  const title = `Gasto: ${formatCents(result.totalNewSpentCents)}`;
  const lines = [
    `${formatCents(-head.amount_cents)} · ${head.merchant || "Sin comercio"} · ${formatDateES(head.booked_date)}`,
  ];
  if (rest > 0) lines.push(`y ${rest} movimiento${rest === 1 ? "" : "s"} más`);

  const summary = monthSummary(monthKey(todayISO()));
  lines.push(`Llevas ${formatCents(summary.spentCents)} gastados este mes.`);

  // One notification per batch of movements, keyed by their ids.
  const key = `spend:${items.map((i) => `${i.booked_date}${i.amount_cents}`).join("|")}`.slice(0, 180);

  return sendPushOnce(key, {
    title,
    body: lines.join("\n"),
    url: "/movimientos",
    tag: "gasto",
  });
}

/** End-of-day recap: what left the account today and how the month is going. */
export async function notifyDailyDigest(day = todayISO()): Promise<boolean> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT merchant, -amount_cents AS spent FROM transactions
        WHERE excluded = 0 AND amount_cents < 0 AND booked_date = ?
        ORDER BY spent DESC`,
    )
    .all(day) as Array<{ merchant: string; spent: number }>;

  const total = rows.reduce((s, r) => s + r.spent, 0);
  const summary = monthSummary(monthKey(day));
  const salary = analyzeSalary(day);
  const remaining = salary.budgetableMonthlyCents - summary.spentCents;

  const body = [
    rows.length === 0
      ? "Hoy no has gastado nada."
      : `${rows.length} movimiento${rows.length === 1 ? "" : "s"}: ${rows
          .slice(0, 3)
          .map((r) => `${r.merchant || "?"} ${formatCents(r.spent)}`)
          .join(", ")}`,
    `Mes: ${formatCents(summary.spentCents)} gastados de ${formatCents(summary.incomeCents)} ingresados.`,
    salary.budgetableMonthlyCents > 0
      ? `${remaining >= 0 ? "Te quedan" : "Te has pasado"} ${formatCents(Math.abs(remaining))} sobre tu salario mensual.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return sendPushOnce(`digest:${day}`, {
    title: `Hoy: ${formatCents(total)}`,
    body,
    url: "/",
    tag: "resumen-diario",
  });
}

/** Heads-up before a subscription or fixed expense is charged. */
export async function notifyUpcomingCharges(day = todayISO()): Promise<number> {
  const charges = upcomingCharges(31, day);
  let sent = 0;

  for (const charge of charges) {
    if (charge.item.kind === "income") continue;
    const alertDay = addDays(charge.date, -Math.max(0, charge.item.reminder_days));
    if (alertDay !== day) continue;

    const when = charge.date === day ? "hoy" : `el ${formatDateES(charge.date)}`;
    const delivered = await sendPushOnce(`charge:${charge.item.id}:${charge.date}`, {
      title: `${charge.item.name} se cobra ${when}`,
      body: `${formatCents(charge.item.amount_cents, charge.item.currency)} · ${
        charge.categoryName ?? (charge.item.kind === "fixed" ? "Gasto fijo" : "Suscripción")
      }`,
      url: "/calendario",
      tag: `cargo-${charge.item.id}`,
    }).catch(() => false);
    if (delivered) sent += 1;
  }

  return sent;
}

/** Warns once per month per category when its budget is blown. */
export async function notifyBudgetOverruns(day = todayISO()): Promise<number> {
  const month = monthKey(day);
  const summary = monthSummary(month);
  const threshold = getSettingNumber("budget_alert_ratio", 1);
  let sent = 0;

  for (const category of summary.byCategory) {
    if (!category.budget_cents || category.budget_cents <= 0) continue;
    if (category.spent_cents < category.budget_cents * threshold) continue;
    const delivered = await sendPushOnce(`budget:${month}:${category.category_id}`, {
      title: `Presupuesto superado: ${category.name}`,
      body: `${formatCents(category.spent_cents)} de ${formatCents(category.budget_cents)} en ${month}.`,
      url: "/ajustes",
      tag: "presupuesto",
    }).catch(() => false);
    if (delivered) sent += 1;
  }

  return sent;
}
