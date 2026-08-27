import Link from "next/link";
import { Bar, Card, Dot, Empty, Stat } from "@/components/ui";
import { formatCents, pct } from "@/lib/money";
import { formatDateES, formatMonthKey, monthKey, todayISO } from "@/lib/dates";
import { analyzeSalary } from "@/lib/payroll";
import { monthSummary, monthlyTrend, recurringSummary, upcomingCharges } from "@/lib/stats";
import { getDb } from "@/lib/db";
import { SyncButton } from "@/components/sync-button";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const today = todayISO();
  const month = monthKey(today);
  const summary = monthSummary(month);
  const salary = analyzeSalary(today);
  const recurring = recurringSummary();
  const trend = monthlyTrend(6, month);
  const upcoming = upcomingCharges(30, today).slice(0, 6);

  const hasData =
    (getDb().prepare("SELECT COUNT(*) AS n FROM transactions").get() as { n: number }).n > 0;

  const budget = salary.budgetableMonthlyCents;
  const remaining = budget - summary.spentCents;
  const maxTrend = Math.max(1, ...trend.flatMap((t) => [t.income_cents, t.spent_cents]));
  const maxCategory = Math.max(1, ...summary.byCategory.map((c) => c.spent_cents));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{formatMonthKey(month)}</h1>
          <p className="text-sm text-muted">
            {summary.transactionCount} movimientos · actualizado {formatDateES(today)}
          </p>
        </div>
        <SyncButton />
      </div>

      {!hasData && (
        <Card>
          <p className="text-sm text-slate-300">
            Todavía no hay movimientos. Conecta tu banco en{" "}
            <Link href="/ajustes" className="text-accent underline">Ajustes</Link>, o carga datos de
            ejemplo desde ahí para ver la app funcionando.
          </p>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Salario mensual"
          cents={budget}
          tone="good"
          hint={
            salary.paymentsPerYear
              ? `${salary.paymentsPerYear} pagas · ${formatCents(salary.annualNetCents)}/año${
                  salary.annualIsEstimated ? " (est.)" : ""
                }`
              : "Sin nóminas detectadas"
          }
        />
        <Stat
          label="Gastado este mes"
          cents={summary.spentCents}
          tone="bad"
          hint={`${formatCents(summary.fixedCents)} fijos · ${formatCents(summary.variableCents)} variables`}
        />
        <Stat
          label={remaining >= 0 ? "Disponible" : "Te has pasado"}
          cents={Math.abs(remaining)}
          tone={remaining >= 0 ? "accent" : "bad"}
          hint={budget > 0 ? `${pct(summary.spentCents, budget)} % del salario consumido` : "Define tu salario"}
        />
        <Stat
          label="Ahorro del mes"
          cents={summary.savedCents}
          tone={summary.savedCents >= 0 ? "good" : "bad"}
          sign
          hint={`Tasa de ahorro ${summary.savingsRate} %`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          title="Gasto por categoría"
          subtitle="Este mes, ordenado por importe"
          className="lg:col-span-2"
        >
          {summary.byCategory.length === 0 ? (
            <Empty>Sin gastos registrados este mes.</Empty>
          ) : (
            <ul className="space-y-3">
              {summary.byCategory.slice(0, 9).map((category) => {
                const over = category.budget_cents ? category.spent_cents > category.budget_cents : false;
                return (
                  <li key={category.category_id ?? "none"}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2 truncate">
                        <Dot color={category.color} />
                        <span className="truncate">{category.name}</span>
                        <span className="text-xs text-muted">{category.count}</span>
                      </span>
                      <span className={`tabular-nums ${over ? "text-bad" : "text-slate-200"}`}>
                        {formatCents(category.spent_cents)}
                        {category.budget_cents ? (
                          <span className="text-xs text-muted"> / {formatCents(category.budget_cents)}</span>
                        ) : null}
                      </span>
                    </div>
                    <Bar
                      value={category.spent_cents}
                      max={category.budget_cents ?? maxCategory}
                      color={over ? "#f85149" : category.color}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Próximos cargos" subtitle="30 días" action={<Link href="/calendario" className="text-xs text-accent">Ver calendario</Link>}>
          {upcoming.length === 0 ? (
            <Empty>Nada previsto. Añade tus suscripciones.</Empty>
          ) : (
            <ul className="space-y-2.5">
              {upcoming.map((charge) => (
                <li key={`${charge.item.id}-${charge.date}`} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <Dot color={charge.categoryColor ?? "#4f8cff"} />
                    <span className="truncate">{charge.item.name}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="tabular-nums">{formatCents(charge.item.amount_cents)}</span>
                    <span className="ml-2 text-xs text-muted">{formatDateES(charge.date).slice(0, 5)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 border-t border-edge pt-3 text-xs text-muted">
            Recurrentes: {formatCents(recurring.totalMonthlyCents)}/mes ·{" "}
            {formatCents(recurring.yearlyCents)}/año
          </p>
        </Card>
      </div>

      <Card title="Ingresos y gastos" subtitle="Últimos 6 meses">
        <div className="flex items-end gap-3 overflow-x-auto pb-1">
          {trend.map((point) => (
            <div key={point.month} className="flex min-w-[64px] flex-1 flex-col items-center gap-2">
              <div className="flex h-32 w-full items-end justify-center gap-1">
                <div
                  className="w-1/3 rounded-t bg-good/70"
                  style={{ height: `${(point.income_cents / maxTrend) * 100}%` }}
                  title={`Ingresos ${formatCents(point.income_cents)}`}
                />
                <div
                  className="w-1/3 rounded-t bg-bad/70"
                  style={{ height: `${(point.spent_cents / maxTrend) * 100}%` }}
                  title={`Gastos ${formatCents(point.spent_cents)}`}
                />
              </div>
              <span className="text-[11px] text-muted">{formatMonthKey(point.month).slice(0, 3)}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5"><Dot color="#3fb950" /> Ingresos</span>
          <span className="flex items-center gap-1.5"><Dot color="#f85149" /> Gastos</span>
        </div>
      </Card>

      <Card title="Dónde se te va el dinero" subtitle="Comercios con más gasto este mes">
        {summary.topMerchants.length === 0 ? (
          <Empty>Sin datos todavía.</Empty>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {summary.topMerchants.map((m) => (
              <li key={m.merchant} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-2 text-sm">
                <span className="truncate">{m.merchant}</span>
                <span className="shrink-0 tabular-nums">
                  {formatCents(m.spent_cents)}
                  <span className="ml-2 text-xs text-muted">×{m.count}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
