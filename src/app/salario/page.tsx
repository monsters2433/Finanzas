import { Card, Empty, Stat } from "@/components/ui";
import { formatCents } from "@/lib/money";
import { formatDateES, formatMonthKey, monthKey, todayISO } from "@/lib/dates";
import { analyzeSalary } from "@/lib/payroll";
import { monthlyTrend } from "@/lib/stats";
import { DeductionForm, PayrollTools } from "@/components/salary-controls";
import { getSettingNumber } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function SalaryPage() {
  const today = todayISO();
  const salary = analyzeSalary(today);
  const trend = monthlyTrend(12, monthKey(today));
  const payrollMin = getSettingNumber("payroll_min_cents", 40_000);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Tu salario</h1>
          <p className="text-sm text-muted">
            Calculado a partir de las nóminas detectadas en tus movimientos.
          </p>
        </div>
        <PayrollTools />
      </div>

      {salary.payrolls.length === 0 ? (
        <Card>
          <Empty>
            No se ha detectado ninguna nómina todavía. Sincroniza el banco, o marca a mano un
            ingreso como nómina desde la pestaña Movimientos.
          </Empty>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Nómina habitual"
              cents={salary.medianPayslipCents}
              tone="good"
              hint="Mediana de tus nóminas"
            />
            <Stat
              label="Neto anual"
              cents={salary.annualNetCents}
              hint={
                salary.annualIsEstimated
                  ? `Estimado con ${salary.paymentsPerYear} pagas`
                  : "Suma real de los últimos 12 meses"
              }
            />
            <Stat
              label="Presupuesto mensual"
              cents={salary.budgetableMonthlyCents}
              tone="accent"
              hint="Neto anual repartido entre 12"
            />
            <Stat
              label="Última nómina"
              cents={salary.lastPayslipCents ?? 0}
              hint={salary.lastPayslipDate ? formatDateES(salary.lastPayslipDate) : "—"}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Cómo se ha calculado" className="lg:col-span-2">
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <Row label="Pagador detectado" value={salary.employer ?? "—"} />
                <Row label="Nóminas encontradas" value={String(salary.payrolls.length)} />
                <Row label="Historial cubierto" value={`${salary.monthsCovered} meses`} />
                <Row label="Nóminas últimos 12 meses" value={String(salary.paymentsLast12)} />
                <Row label="Pagas al año" value={String(salary.paymentsPerYear)} />
                <Row
                  label="Pagas extra detectadas"
                  value={salary.extras.length ? `${salary.extras.length} (${salary.extras.map((e) => formatMonthKey(monthKey(e.booked_date)).split(" ")[0]).join(", ")})` : "Ninguna"}
                />
                <Row
                  label="Umbral mínimo de nómina"
                  value={formatCents(payrollMin)}
                />
                <Row
                  label="Bruto anual estimado"
                  value={
                    salary.annualGrossCents
                      ? `${formatCents(salary.annualGrossCents)} (${Math.round(salary.deductionRate * 100)} % retenciones)`
                      : "Indica tu retención abajo"
                  }
                />
              </dl>
              <p className="mt-4 text-xs text-muted">
                Se marca como nómina todo ingreso cuya descripción lo diga, y también los ingresos
                recurrentes del mismo pagador con importe estable. Si algo se cuela, desmárcalo en
                Movimientos y el cálculo se rehace.
              </p>
            </Card>

            <Card title="Estimar el bruto" subtitle="Retención IRPF + Seguridad Social">
              <DeductionForm current={Math.round(salary.deductionRate * 100)} payrollMinCents={payrollMin} />
            </Card>
          </div>

          <Card title="Ingresos por mes" subtitle="Últimos 12 meses">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px]">
                <thead>
                  <tr className="border-b border-edge">
                    <th className="th">Mes</th>
                    <th className="th text-right">Ingresos</th>
                    <th className="th text-right">Gastos</th>
                    <th className="th text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {[...trend].reverse().map((point) => {
                    const balance = point.income_cents - point.spent_cents;
                    return (
                      <tr key={point.month} className="border-b border-edge/50 last:border-0">
                        <td className="td">{formatMonthKey(point.month)}</td>
                        <td className="td text-right tabular-nums text-good">{formatCents(point.income_cents)}</td>
                        <td className="td text-right tabular-nums text-bad">{formatCents(point.spent_cents)}</td>
                        <td className={`td text-right tabular-nums ${balance >= 0 ? "text-slate-200" : "text-bad"}`}>
                          {formatCents(balance, "EUR", { sign: true })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Nóminas detectadas">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px]">
                <thead>
                  <tr className="border-b border-edge">
                    <th className="th">Fecha</th>
                    <th className="th">Pagador</th>
                    <th className="th text-right">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {salary.payrolls.slice(0, 24).map((payroll) => (
                    <tr key={payroll.id} className="border-b border-edge/50 last:border-0">
                      <td className="td text-muted">{formatDateES(payroll.booked_date)}</td>
                      <td className="td truncate">{payroll.merchant || payroll.description}</td>
                      <td className="td text-right tabular-nums text-good">
                        {formatCents(payroll.amount_cents)}
                        {payroll.amount_cents > salary.medianPayslipCents * 1.4 && (
                          <span className="ml-2 chip">extra</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-edge/50 pb-2">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
