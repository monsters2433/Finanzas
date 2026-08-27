"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Dot, Empty } from "@/components/ui";

type Rule = {
  id: number;
  pattern: string;
  priority: number;
  category_name: string | null;
  category_color: string | null;
};

export function RulesPanel({
  rules,
  categories,
}: {
  rules: Rule[];
  categories: Array<{ id: number; name: string }>;
}) {
  const router = useRouter();
  const [pattern, setPattern] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const res = await fetch("/api/rules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pattern, categoryId: Number(categoryId), priority: 50 }),
    });
    if (!res.ok) return setError((await res.json()).error);
    setPattern("");
    router.refresh();
  }

  async function remove(id: number) {
    await fetch(`/api/rules/${id}`, { method: "DELETE" });
    router.refresh();
  }

  async function reapply(action: "recategorize" | "recategorize-missing") {
    const res = await fetch("/api/tools", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    setMessage(res.ok ? `${data.changed} movimientos actualizados.` : data.error);
    router.refresh();
  }

  return (
    <Card
      title="Reglas de categorización"
      subtitle="Se aplican al importar; el texto admite expresiones regulares"
      action={
        <div className="flex gap-1.5">
          <button className="chip" onClick={() => reapply("recategorize-missing")}>Solo sin categoría</button>
          <button className="chip" onClick={() => reapply("recategorize")}>Reaplicar a todo</button>
        </div>
      }
    >
      <form onSubmit={add} className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <input
          className="input"
          placeholder="mercadona|lidl"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
        />
        <select className="input w-auto" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Categoría…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button className="btn-ghost">Añadir</button>
      </form>
      {error && <p className="mb-2 text-sm text-bad">{error}</p>}
      {message && <p className="mb-2 text-sm text-accent">{message}</p>}

      {rules.length === 0 ? (
        <Empty>Sin reglas.</Empty>
      ) : (
        <ul className="max-h-[360px] space-y-1 overflow-y-auto pr-1 text-sm">
          {rules.map((rule) => (
            <li key={rule.id} className="flex items-center gap-2 rounded-lg border border-edge px-2.5 py-1.5">
              <Dot color={rule.category_color ?? "#8b97a8"} />
              <code className="min-w-0 flex-1 truncate text-xs text-slate-300">{rule.pattern}</code>
              <span className="shrink-0 text-xs text-muted">{rule.category_name}</span>
              <button className="chip hover:border-bad hover:text-bad" onClick={() => remove(rule.id)}>×</button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
