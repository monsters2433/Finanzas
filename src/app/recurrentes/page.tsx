import { Card, Stat } from "@/components/ui";
import { getDb } from "@/lib/db";
import { listRecurring, recurringSummary } from "@/lib/stats";
import { RecurringManager } from "@/components/recurring-manager";
import { todayISO } from "@/lib/dates";
import { monthlyCostCents } from "@/lib/recurrence";

export const dynamic = "force-dynamic";

export default function RecurringPage() {
  const items = listRecurring();
  const summary = recurringSummary();
  const categories = getDb()
    .prepare("SELECT id, name, kind, color FROM categories ORDER BY kind, name")
    .all() as Array<{ id: number; name: string; kind: string; color: string }>;

  const incomeMonthly = items
    .filter((i) => i.active && i.kind === "income")
    .reduce((sum, i) => sum + monthlyCostCents(i), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Gastos fijos y suscripciones</h1>
        <p className="text-sm text-muted">
          Todo lo que se repite. Alimenta el calendario del móvil y los avisos previos al cobro.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Gastos fijos" cents={summary.fixedMonthlyCents} hint="al mes" tone="bad" />
        <Stat label="Suscripciones" cents={summary.subscriptionsMonthlyCents} hint="al mes" tone="bad" />
        <Stat label="Total recurrente" cents={summary.totalMonthlyCents} hint={`${summary.activeCount} activos`} />
        <Stat label="Coste anual" cents={summary.yearlyCents} hint="fijos + suscripciones" tone="accent" />
      </div>

      {incomeMonthly > 0 && (
        <Card>
          <p className="text-sm text-muted">
            Ingresos recurrentes previstos: <span className="text-good">{(incomeMonthly / 100).toFixed(2)} € al mes</span>
          </p>
        </Card>
      )}

      <RecurringManager items={items} categories={categories} today={todayISO()} />
    </div>
  );
}
