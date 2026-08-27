"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";

export function DemoPanel({ transactionCount }: { transactionCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function seed() {
    if (
      transactionCount > 0 &&
      !confirm("Ya tienes movimientos. Los de ejemplo se añadirán junto a los reales. ¿Seguir?")
    ) {
      return;
    }
    setBusy(true);
    const res = await fetch("/api/tools", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "seed-demo" }),
    });
    const data = await res.json();
    setBusy(false);
    setMessage(
      res.ok
        ? `${data.transactions} movimientos y ${data.recurring} recurrentes de ejemplo creados.`
        : data.error,
    );
    router.refresh();
  }

  return (
    <Card
      title="Datos de ejemplo"
      subtitle="14 meses de nóminas, gastos fijos y suscripciones ficticios"
      action={
        <button className="btn-ghost" onClick={seed} disabled={busy}>
          {busy ? "Generando…" : "Cargar datos de ejemplo"}
        </button>
      }
    >
      <p className="text-sm text-muted">
        Útil para ver cómo funciona la app antes de conectar el banco. Se marcan con el prefijo{" "}
        <code className="text-accent">demo:</code>, así que puedes borrarlos luego eliminando el
        fichero <code className="text-accent">data/finanzas.db</code>.
      </p>
      {message && <p className="mt-3 text-sm text-accent">{message}</p>}
    </Card>
  );
}
