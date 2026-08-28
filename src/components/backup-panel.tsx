"use client";

import { useState } from "react";
import { Card } from "@/components/ui";

export function BackupPanel({
  dbPath,
  sizeLabel,
  transactionCount,
  oldestDate,
}: {
  dbPath: string;
  sizeLabel: string;
  transactionCount: number;
  oldestDate: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/backup");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "No se pudo generar la copia.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `finanzas_${new Date().toISOString().slice(0, 10)}.db`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Copia de seguridad"
      subtitle="Todos tus datos viven en un único fichero de tu equipo"
      action={
        <button className="btn-primary" onClick={download} disabled={busy}>
          {busy ? "Preparando…" : "Descargar copia"}
        </button>
      }
    >
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <Row label="Fichero" value={dbPath} mono />
        <Row label="Tamaño" value={sizeLabel} />
        <Row label="Movimientos guardados" value={String(transactionCount)} />
        <Row label="Desde" value={oldestDate ?? "—"} />
      </dl>
      {error && <p className="mt-3 text-sm text-bad">{error}</p>}
      <p className="mt-4 border-t border-edge pt-3 text-xs text-muted">
        La descarga es una copia consistente aunque la app esté funcionando. Para copias
        automáticas y exportar a Excel, desde la carpeta del proyecto:{" "}
        <code className="text-accent">npm run db:backup</code> y{" "}
        <code className="text-accent">npm run db:export</code>. No copies el fichero a mano
        mientras la app esté abierta: parte de los datos está en un fichero aparte y la copia
        saldría incompleta.
      </p>
    </Card>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b border-edge/50 pb-1.5">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className={`truncate text-right ${mono ? "font-mono text-xs" : ""}`} title={value}>
        {value}
      </dd>
    </div>
  );
}
