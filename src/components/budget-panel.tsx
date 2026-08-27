"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Dot } from "@/components/ui";

type Category = {
  id: number;
  name: string;
  kind: string;
  color: string;
  monthly_budget_cents: number | null;
};

const KIND_LABELS: Record<string, string> = {
  fixed: "Fijo",
  variable: "Variable",
  income: "Ingreso",
  savings: "Ahorro",
};

export function BudgetPanel({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      categories.map((c) => [c.id, c.monthly_budget_cents ? (c.monthly_budget_cents / 100).toFixed(2) : ""]),
    ),
  );
  const [saving, setSaving] = useState<number | null>(null);

  async function save(id: number) {
    setSaving(id);
    await fetch(`/api/categories/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ budget: drafts[id] }),
    });
    setSaving(null);
    router.refresh();
  }

  async function updateKind(id: number, kind: string) {
    await fetch(`/api/categories/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    router.refresh();
  }

  return (
    <Card title="Categorías y presupuestos" subtitle="Deja el importe vacío para no fijar tope">
      <ul className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
        {categories.map((category) => (
          <li key={category.id} className="flex items-center gap-2 rounded-lg border border-edge px-2.5 py-2">
            <Dot color={category.color} />
            <span className="min-w-0 flex-1 truncate text-sm">{category.name}</span>
            <select
              className="input w-auto py-1 text-xs"
              value={category.kind}
              onChange={(e) => updateKind(category.id, e.target.value)}
            >
              {Object.entries(KIND_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <input
              className="input w-24 py-1 text-xs"
              inputMode="decimal"
              placeholder="—"
              value={drafts[category.id] ?? ""}
              onChange={(e) => setDrafts({ ...drafts, [category.id]: e.target.value })}
              onBlur={() => save(category.id)}
              onKeyDown={(e) => e.key === "Enter" && save(category.id)}
            />
            <span className="w-4 text-xs text-muted">{saving === category.id ? "…" : "€"}</span>
          </li>
        ))}
      </ul>
      <NewCategory />
    </Card>
  );
}

function NewCategory() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [kind, setKind] = useState("variable");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, kind }),
    });
    if (!res.ok) return setError((await res.json()).error);
    setName("");
    setError(null);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-4 flex gap-2 border-t border-edge pt-4">
      <input
        className="input flex-1"
        placeholder="Nueva categoría"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <select className="input w-auto" value={kind} onChange={(e) => setKind(e.target.value)}>
        <option value="variable">Variable</option>
        <option value="fixed">Fijo</option>
        <option value="income">Ingreso</option>
        <option value="savings">Ahorro</option>
      </select>
      <button className="btn-ghost">Añadir</button>
      {error && <p className="text-xs text-bad">{error}</p>}
    </form>
  );
}
