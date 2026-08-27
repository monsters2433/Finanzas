"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Dot, Empty } from "@/components/ui";
import { formatCents } from "@/lib/money";
import { formatDateES, formatMonthKey } from "@/lib/dates";

type Category = { id: number; name: string; kind: string; color: string };

type Transaction = {
  id: number;
  booked_date: string;
  amount_cents: number;
  currency: string;
  merchant: string;
  description: string;
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
  account_name: string | null;
  source: string;
  is_payroll: number;
  excluded: number;
};

export function TransactionsView({
  months,
  categories,
  initialMonth,
  today,
}: {
  months: string[];
  categories: Category[];
  initialMonth: string;
  today: string;
}) {
  const [month, setMonth] = useState(initialMonth);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ month, limit: "400" });
    if (query) params.set("q", query);
    if (kind) params.set("kind", kind);
    const res = await fetch(`/api/transactions?${params}`);
    const data = await res.json();
    setTransactions(data.transactions ?? []);
    setLoading(false);
  }, [month, query, kind]);

  useEffect(() => {
    const timer = setTimeout(load, query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);

  const totals = useMemo(() => {
    let income = 0;
    let spent = 0;
    for (const tx of transactions) {
      if (tx.excluded) continue;
      if (tx.amount_cents > 0) income += tx.amount_cents;
      else spent += -tx.amount_cents;
    }
    return { income, spent };
  }, [transactions]);

  async function patch(id: number, payload: Record<string, unknown>) {
    setTransactions((prev) =>
      prev.map((tx) =>
        tx.id === id
          ? {
              ...tx,
              ...("categoryId" in payload
                ? {
                    category_id: payload.categoryId as number | null,
                    category_name:
                      categories.find((c) => c.id === payload.categoryId)?.name ?? null,
                    category_color:
                      categories.find((c) => c.id === payload.categoryId)?.color ?? null,
                  }
                : {}),
              ...("excluded" in payload ? { excluded: payload.excluded ? 1 : 0 } : {}),
              ...("isPayroll" in payload ? { is_payroll: payload.isPayroll ? 1 : 0 } : {}),
            }
          : tx,
      ),
    );
    await fetch(`/api/transactions/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Movimientos</h1>
          <p className="text-sm text-muted">
            {formatCents(totals.spent)} gastados · {formatCents(totals.income)} ingresados
          </p>
        </div>
        <ManualEntry categories={categories} today={today} onSaved={load} />
      </div>

      <Card>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label mb-1.5" htmlFor="month">Mes</label>
            <select id="month" className="input" value={month} onChange={(e) => setMonth(e.target.value)}>
              {months.map((m) => (
                <option key={m} value={m}>{formatMonthKey(m)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label mb-1.5" htmlFor="kind">Tipo</label>
            <select id="kind" className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">Todos</option>
              <option value="expense">Solo gastos</option>
              <option value="income">Solo ingresos</option>
            </select>
          </div>
          <div>
            <label className="label mb-1.5" htmlFor="q">Buscar comercio</label>
            <input
              id="q"
              className="input"
              placeholder="mercadona, netflix…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
      </Card>

      <Card>
        {loading ? (
          <Empty>Cargando…</Empty>
        ) : transactions.length === 0 ? (
          <Empty>No hay movimientos con estos filtros.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="border-b border-edge">
                  <th className="th">Fecha</th>
                  <th className="th">Comercio</th>
                  <th className="th">Categoría</th>
                  <th className="th text-right">Importe</th>
                  <th className="th text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr
                    key={tx.id}
                    className={`border-b border-edge/50 last:border-0 ${tx.excluded ? "opacity-40" : ""}`}
                  >
                    <td className="td whitespace-nowrap text-muted">{formatDateES(tx.booked_date)}</td>
                    <td className="td">
                      <div className="max-w-[260px] truncate font-medium">{tx.merchant || "—"}</div>
                      <div className="max-w-[260px] truncate text-xs text-muted">
                        {tx.description}
                        {tx.source === "manual" && <span className="ml-1.5 chip">manual</span>}
                        {tx.is_payroll === 1 && <span className="ml-1.5 chip text-good">nómina</span>}
                      </div>
                    </td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <Dot color={tx.category_color ?? "#8b97a8"} />
                        <select
                          className="input py-1 text-xs"
                          value={tx.category_id ?? ""}
                          onChange={(e) =>
                            patch(tx.id, { categoryId: e.target.value ? Number(e.target.value) : null })
                          }
                        >
                          <option value="">Sin categoría</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td
                      className={`td whitespace-nowrap text-right tabular-nums ${
                        tx.amount_cents > 0 ? "text-good" : "text-slate-200"
                      }`}
                    >
                      {formatCents(tx.amount_cents, tx.currency, { sign: true })}
                    </td>
                    <td className="td text-right">
                      <div className="flex justify-end gap-1.5">
                        {tx.amount_cents > 0 && (
                          <button
                            className="chip hover:border-good hover:text-good"
                            onClick={() => patch(tx.id, { isPayroll: !tx.is_payroll })}
                            title="Marcar o desmarcar como nómina"
                          >
                            {tx.is_payroll ? "No es nómina" : "Es nómina"}
                          </button>
                        )}
                        <button
                          className="chip hover:border-warn hover:text-warn"
                          onClick={() => patch(tx.id, { excluded: !tx.excluded })}
                          title="Excluir de las estadísticas (traspasos entre cuentas propias)"
                        >
                          {tx.excluded ? "Incluir" : "Excluir"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function ManualEntry({
  categories,
  today,
  onSaved,
}: {
  categories: Category[];
  today: string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    merchant: "",
    amount: "",
    date: today,
    categoryId: "",
    income: false,
    description: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/transactions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...form, categoryId: form.categoryId ? Number(form.categoryId) : 0 }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "No se pudo guardar.");
      return;
    }
    setForm({ ...form, merchant: "", amount: "", description: "" });
    setOpen(false);
    onSaved();
  }

  if (!open) {
    return (
      <button className="btn-primary" onClick={() => setOpen(true)}>
        Añadir gasto a mano
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="card w-full max-w-md space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Nuevo movimiento</h2>
        <button type="button" className="chip" onClick={() => setOpen(false)}>Cerrar</button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label mb-1.5">Comercio o concepto</label>
          <input
            className="input"
            value={form.merchant}
            onChange={(e) => setForm({ ...form, merchant: e.target.value })}
            placeholder="Efectivo, mercado, taxi…"
            autoFocus
          />
        </div>
        <div>
          <label className="label mb-1.5">Importe (€)</label>
          <input
            className="input"
            inputMode="decimal"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            placeholder="12,50"
          />
        </div>
        <div>
          <label className="label mb-1.5">Fecha</label>
          <input
            type="date"
            className="input"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
        </div>
        <div className="col-span-2">
          <label className="label mb-1.5">Categoría</label>
          <select
            className="input"
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
          >
            <option value="">Automática</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <label className="col-span-2 flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={form.income}
            onChange={(e) => setForm({ ...form, income: e.target.checked })}
          />
          Es un ingreso
        </label>
      </div>
      {error && <p className="text-sm text-bad">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}
