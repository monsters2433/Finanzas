"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Empty } from "@/components/ui";

type Institution = { id: string; name: string; logo?: string; days: number };

export function BankPanel({
  configured,
  connections,
  accounts,
}: {
  configured: boolean;
  connections: Array<{
    id: number;
    institution_name: string;
    status: string;
    created_at: string;
    account_count: number;
  }>;
  accounts: Array<{
    id: number;
    name: string;
    iban: string | null;
    institution_name: string | null;
    balance: string | null;
    last_synced_at: string | null;
    archived: number;
  }>;
}) {
  const router = useRouter();
  const [institutions, setInstitutions] = useState<Institution[] | null>(null);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadInstitutions() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/bank/institutions?country=es");
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "No se pudo obtener la lista de bancos.");
    setInstitutions(data.institutions ?? []);
  }

  async function connect(institution: Institution) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/bank/connect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ institutionId: institution.id, institutionName: institution.name }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "No se pudo iniciar la conexión.");
    window.location.href = data.link;
  }

  async function disconnect(id: number, name: string) {
    if (!confirm(`¿Desconectar ${name}? Se conserva el histórico ya importado.`)) return;
    await fetch(`/api/bank/connections/${id}`, { method: "DELETE" });
    router.refresh();
  }

  const visible = (institutions ?? []).filter((i) =>
    i.name.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <Card
      title="Tu banco"
      subtitle="Lectura de movimientos vía PSD2 (GoCardless Bank Account Data)"
      action={
        configured ? (
          <button className="btn-ghost" onClick={loadInstitutions} disabled={busy}>
            {busy ? "Cargando…" : institutions ? "Recargar bancos" : "Conectar banco"}
          </button>
        ) : null
      }
    >
      {!configured && (
        <div className="rounded-xl border border-warn/30 bg-warn/5 p-4 text-sm">
          <p className="font-medium text-warn">Falta configurar el proveedor bancario.</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-slate-300">
            <li>Crea una cuenta gratuita en bankaccountdata.gocardless.com.</li>
            <li>Genera un par «Secret ID» / «Secret Key» en User Secrets.</li>
            <li>
              Ponlos en tu <code className="text-accent">.env</code> como{" "}
              <code className="text-accent">GOCARDLESS_SECRET_ID</code> y{" "}
              <code className="text-accent">GOCARDLESS_SECRET_KEY</code>, y reinicia.
            </li>
          </ol>
        </div>
      )}

      {error && <p className="mb-3 text-sm text-bad">{error}</p>}

      {institutions && (
        <div className="mb-5 space-y-3">
          <input
            className="input"
            placeholder="Busca tu banco (BBVA, Santander, ING…)"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <ul className="grid max-h-64 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
            {visible.slice(0, 60).map((institution) => (
              <li key={institution.id}>
                <button
                  className="flex w-full items-center gap-2 rounded-lg border border-edge px-3 py-2 text-left text-sm transition hover:border-accent hover:bg-white/5"
                  onClick={() => connect(institution)}
                  disabled={busy}
                >
                  {institution.logo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={institution.logo} alt="" className="h-5 w-5 rounded" />
                  )}
                  <span className="truncate">{institution.name}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted">{institution.days} d</span>
                </button>
              </li>
            ))}
            {visible.length === 0 && <li className="text-sm text-muted">Sin resultados.</li>}
          </ul>
          <p className="text-xs text-muted">
            «d» = días de histórico que cede ese banco. Te redirigirá a su web para autorizar el
            acceso de solo lectura; el consentimiento caduca a los 90-180 días y habrá que renovarlo.
          </p>
        </div>
      )}

      <h3 className="label mb-2">Conexiones</h3>
      {connections.length === 0 ? (
        <Empty>Ningún banco conectado.</Empty>
      ) : (
        <ul className="mb-5 space-y-2">
          {connections.map((connection) => (
            <li
              key={connection.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-edge px-3 py-2 text-sm"
            >
              <span>
                {connection.institution_name}
                <span className="ml-2 chip">{connection.status}</span>
                <span className="ml-2 text-xs text-muted">{connection.account_count} cuentas</span>
              </span>
              <button
                className="chip hover:border-bad hover:text-bad"
                onClick={() => disconnect(connection.id, connection.institution_name)}
              >
                Desconectar
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3 className="label mb-2">Cuentas</h3>
      {accounts.length === 0 ? (
        <Empty>Sin cuentas todavía.</Empty>
      ) : (
        <ul className="space-y-2">
          {accounts.map((account) => (
            <li
              key={account.id}
              className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border border-edge px-3 py-2 text-sm ${
                account.archived ? "opacity-50" : ""
              }`}
            >
              <span className="min-w-0">
                <span className="truncate font-medium">{account.name}</span>
                <span className="ml-2 text-xs text-muted">
                  {account.institution_name}
                  {account.iban ? ` · ${account.iban.slice(-4)}` : ""}
                </span>
              </span>
              <span className="text-right text-xs text-muted">
                {account.balance && <span className="mr-3 tabular-nums text-slate-200">{account.balance}</span>}
                {account.last_synced_at ? `sinc. ${account.last_synced_at.slice(0, 16)}` : "sin sincronizar"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
