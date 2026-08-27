"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CalendarSubscribe({ url }: { url: string }) {
  const router = useRouter();
  const [current, setCurrent] = useState(url);
  const [copied, setCopied] = useState(false);
  const webcal = current.replace(/^https?:/, "webcal:");

  async function copy() {
    try {
      await navigator.clipboard.writeText(current);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function rotate() {
    if (!confirm("Se invalidará el enlace actual y tendrás que volver a suscribirte. ¿Seguir?")) return;
    const res = await fetch("/api/calendar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "rotate" }),
    });
    const data = await res.json();
    setCurrent(data.url);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-edge bg-ink px-3 py-2 text-xs text-muted">
          {current}
        </code>
        <button className="btn-ghost" onClick={copy}>{copied ? "Copiado" : "Copiar"}</button>
        <a className="btn-primary" href={webcal}>Suscribirse</a>
      </div>

      <div className="grid gap-4 text-sm text-slate-300 sm:grid-cols-3">
        <Step title="iPhone / iPad">
          Ajustes → Calendario → Cuentas → Añadir cuenta → Otra → Añadir suscripción de calendario, y
          pega el enlace.
        </Step>
        <Step title="Google Calendar">
          calendar.google.com → Otros calendarios → + → Desde URL. Se sincroniza con la app de
          Android automáticamente.
        </Step>
        <Step title="Android (sin Google)">
          Cualquier app que acepte ICS (Etar, Business Calendar) admite «suscribirse a URL».
        </Step>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-edge pt-4 text-xs text-muted">
        <p>
          El enlace lleva un token secreto: quien lo tenga puede ver tus cobros. No lo compartas.
          Para que el móvil lo alcance, la app debe ser accesible desde fuera de tu red.
        </p>
        <button className="btn-danger shrink-0" onClick={rotate}>Regenerar enlace</button>
      </div>
    </div>
  );
}

function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-edge p-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
      <p className="text-xs leading-relaxed">{children}</p>
    </div>
  );
}
