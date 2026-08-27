"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PayrollTools() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function detect() {
    setBusy(true);
    const res = await fetch("/api/tools", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "detect-payrolls" }),
    });
    const data = await res.json();
    setBusy(false);
    setMessage(res.ok ? `${data.found} nóminas detectadas` : data.error);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      {message && <span className="text-xs text-muted">{message}</span>}
      <button className="btn-ghost" onClick={detect} disabled={busy}>
        {busy ? "Analizando…" : "Volver a detectar nóminas"}
      </button>
    </div>
  );
}

export function DeductionForm({
  current,
  payrollMinCents,
}: {
  current: number;
  payrollMinCents: number;
}) {
  const router = useRouter();
  const [rate, setRate] = useState(String(current || ""));
  const [minimum, setMinimum] = useState((payrollMinCents / 100).toFixed(0));
  const [saved, setSaved] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deductionRate: Number(rate) || 0, payrollMin: minimum }),
    });
    setSaved(true);
    router.refresh();
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <div>
        <label className="label mb-1.5" htmlFor="rate">Retención total (%)</label>
        <input
          id="rate"
          className="input"
          inputMode="decimal"
          placeholder="p. ej. 24"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
        />
        <p className="mt-1 text-xs text-muted">IRPF + cotización que te descuentan en nómina.</p>
      </div>
      <div>
        <label className="label mb-1.5" htmlFor="min">Ingreso mínimo para considerar nómina (€)</label>
        <input
          id="min"
          className="input"
          inputMode="decimal"
          value={minimum}
          onChange={(e) => setMinimum(e.target.value)}
        />
      </div>
      <button className="btn-primary w-full">{saved ? "Guardado" : "Guardar"}</button>
    </form>
  );
}
