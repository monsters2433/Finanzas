"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Dot, Empty } from "@/components/ui";
import { formatCents } from "@/lib/money";
import { formatDateES } from "@/lib/dates";
import {
  FREQUENCY_LABELS,
  monthlyCostCents,
  nextOccurrence,
  type Frequency,
  type RecurringItem,
} from "@/lib/recurrence";

type Category = { id: number; name: string; kind: string; color: string };

const KIND_LABELS: Record<string, string> = {
  subscription: "Suscripción",
  fixed: "Gasto fijo",
  income: "Ingreso",
};

export function RecurringManager({
  items,
  categories,
  today,
}: {
  items: RecurringItem[];
  categories: Category[];
  today: string;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<string>("");

  const visible = filter ? items.filter((i) => i.kind === filter) : items;
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  async function patch(id: number, payload: Record<string, unknown>) {
    await fetch(`/api/recurring/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    router.refresh();
  }

  async function remove(id: number, name: string) {
    if (!confirm(`¿Eliminar "${name}"? Desaparecerá también del calendario.`)) return;
    await fetch(`/api/recurring/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Card
          title="Tus recurrentes"
          action={
            <select className="input w-auto py-1 text-xs" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">Todos</option>
              <option value="fixed">Gastos fijos</option>
              <option value="subscription">Suscripciones</option>
              <option value="income">Ingresos</option>
            </select>
          }
        >
          {visible.length === 0 ? (
            <Empty>Nada aquí todavía. Añade tu primera suscripción a la derecha.</Empty>
          ) : (
            <ul className="space-y-2">
              {visible.map((item) => {
                const next = nextOccurrence(item, today);
                const category = item.category_id ? categoryById.get(item.category_id) : undefined;
                return (
                  <li
                    key={item.id}
                    className={`rounded-xl border border-edge px-4 py-3 ${item.active ? "" : "opacity-50"}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 font-medium">
                          <Dot color={category?.color ?? "#4f8cff"} />
                          <span className="truncate">{item.name}</span>
                          <span className="chip">{KIND_LABELS[item.kind]}</span>
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          {FREQUENCY_LABELS[item.frequency as Frequency]}
                          {item.interval_n > 1 ? ` cada ${item.interval_n}` : ""} ·{" "}
                          {next ? `próximo ${formatDateES(next)}` : "sin próximos cargos"} · aviso{" "}
                          {item.reminder_days} d antes
                          {category ? ` · ${category.name}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className={`tabular-nums ${item.kind === "income" ? "text-good" : ""}`}>
                            {formatCents(item.amount_cents, item.currency)}
                          </p>
                          {item.frequency !== "monthly" && (
                            <p className="text-xs text-muted">
                              {formatCents(monthlyCostCents(item))}/mes
                            </p>
                          )}
                        </div>
                        <div className="flex gap-1.5">
                          <button className="chip" onClick={() => patch(item.id, { active: !item.active })}>
                            {item.active ? "Pausar" : "Activar"}
                          </button>
                          <button className="chip hover:border-bad hover:text-bad" onClick={() => remove(item.id, item.name)}>
                            Borrar
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <RecurringForm categories={categories} today={today} />
    </div>
  );
}

function RecurringForm({ categories, today }: { categories: Category[]; today: string }) {
  const router = useRouter();
  const empty = {
    name: "",
    kind: "subscription",
    amount: "",
    frequency: "monthly",
    interval: "1",
    firstDate: today,
    reminderDays: "1",
    categoryId: "",
    notes: "",
  };
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/recurring", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...form,
        interval: Number(form.interval),
        reminderDays: Number(form.reminderDays),
        categoryId: form.categoryId ? Number(form.categoryId) : 0,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "No se pudo guardar.");
      return;
    }
    setForm({ ...empty, firstDate: form.firstDate });
    router.refresh();
  }

  return (
    <Card title="Añadir recurrente" subtitle="Aparecerá en el calendario del móvil">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label mb-1.5">Nombre</label>
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Netflix, alquiler, gimnasio…"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label mb-1.5">Importe (€)</label>
            <input
              className="input"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="13,99"
            />
          </div>
          <div>
            <label className="label mb-1.5">Tipo</label>
            <select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="subscription">Suscripción</option>
              <option value="fixed">Gasto fijo</option>
              <option value="income">Ingreso</option>
            </select>
          </div>
          <div>
            <label className="label mb-1.5">Periodicidad</label>
            <select
              className="input"
              value={form.frequency}
              onChange={(e) => setForm({ ...form, frequency: e.target.value })}
            >
              <option value="monthly">Mensual</option>
              <option value="weekly">Semanal</option>
              <option value="quarterly">Trimestral</option>
              <option value="yearly">Anual</option>
            </select>
          </div>
          <div>
            <label className="label mb-1.5">Cada</label>
            <input
              className="input"
              type="number"
              min={1}
              value={form.interval}
              onChange={(e) => setForm({ ...form, interval: e.target.value })}
            />
          </div>
          <div>
            <label className="label mb-1.5">Primer cobro</label>
            <input
              type="date"
              className="input"
              value={form.firstDate}
              onChange={(e) => setForm({ ...form, firstDate: e.target.value })}
            />
          </div>
          <div>
            <label className="label mb-1.5">Avisar (días antes)</label>
            <input
              className="input"
              type="number"
              min={0}
              value={form.reminderDays}
              onChange={(e) => setForm({ ...form, reminderDays: e.target.value })}
            />
          </div>
        </div>
        <div>
          <label className="label mb-1.5">Categoría</label>
          <select
            className="input"
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
          >
            <option value="">Sin categoría</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        {error && <p className="text-sm text-bad">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "Guardando…" : "Añadir"}
        </button>
      </form>
    </Card>
  );
}
