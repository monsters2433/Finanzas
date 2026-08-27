"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function PushPanel({ configured }: { configured: boolean }) {
  const [state, setState] = useState<{
    supported: boolean;
    subscribed: boolean;
    devices: number;
    publicKey: string | null;
    message: string | null;
    busy: boolean;
  }>({ supported: false, subscribed: false, devices: 0, publicKey: null, message: null, busy: false });

  const refresh = useCallback(async () => {
    const supported =
      typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
    const res = await fetch("/api/push/subscribe");
    const data = await res.json();
    let subscribed = false;
    if (supported) {
      const registration = await navigator.serviceWorker.getRegistration();
      subscribed = Boolean(await registration?.pushManager.getSubscription());
    }
    setState((prev) => ({
      ...prev,
      supported,
      subscribed,
      devices: data.devices ?? 0,
      publicKey: data.publicKey ?? null,
    }));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function enable() {
    setState((s) => ({ ...s, busy: true, message: null }));
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Permiso de notificaciones denegado.");
      if (!state.publicKey) throw new Error("Falta la clave pública VAPID.");

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(state.publicKey) as BufferSource,
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...subscription.toJSON(), label: navigator.userAgent.slice(0, 80) }),
      });
      if (!res.ok) throw new Error("El servidor rechazó la suscripción.");

      setState((s) => ({ ...s, busy: false, message: "Notificaciones activadas en este dispositivo." }));
      refresh();
    } catch (err) {
      setState((s) => ({ ...s, busy: false, message: (err as Error).message }));
    }
  }

  async function disable() {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      await subscription.unsubscribe();
    }
    setState((s) => ({ ...s, message: "Notificaciones desactivadas aquí." }));
    refresh();
  }

  async function test() {
    setState((s) => ({ ...s, busy: true }));
    const res = await fetch("/api/push/test", { method: "POST" });
    const data = await res.json();
    setState((s) => ({
      ...s,
      busy: false,
      message: res.ok
        ? `Enviada a ${data.sent} dispositivo(s).${data.removed ? ` ${data.removed} caducada(s) eliminada(s).` : ""}`
        : data.error,
    }));
  }

  return (
    <Card
      title="Notificaciones"
      subtitle="Aviso en el móvil cada vez que se registra un gasto"
      action={
        <div className="flex gap-2">
          {state.subscribed ? (
            <button className="btn-ghost" onClick={disable}>Desactivar aquí</button>
          ) : (
            <button className="btn-primary" onClick={enable} disabled={!configured || state.busy || !state.supported}>
              {state.busy ? "Activando…" : "Activar en este dispositivo"}
            </button>
          )}
          <button className="btn-ghost" onClick={test} disabled={!configured || state.devices === 0}>
            Probar
          </button>
        </div>
      }
    >
      {!configured ? (
        <div className="rounded-xl border border-warn/30 bg-warn/5 p-4 text-sm">
          <p className="font-medium text-warn">Faltan las claves VAPID.</p>
          <p className="mt-1 text-xs text-slate-300">
            Ejecuta <code className="text-accent">npm run vapid</code>, copia las dos claves a tu{" "}
            <code className="text-accent">.env</code> y reinicia la app.
          </p>
        </div>
      ) : (
        <ul className="space-y-1.5 text-sm text-muted">
          <li>Dispositivos suscritos: <span className="text-slate-200">{state.devices}</span></li>
          <li>Este dispositivo: <span className="text-slate-200">{state.subscribed ? "activado" : "no activado"}</span></li>
          {!state.supported && <li className="text-warn">Este navegador no admite notificaciones push.</li>}
          <li className="text-xs">
            En iPhone hace falta añadir la app a la pantalla de inicio («Compartir → Añadir a inicio»)
            antes de activar las notificaciones, y servirla por HTTPS.
          </li>
        </ul>
      )}
      {state.message && <p className="mt-3 text-sm text-accent">{state.message}</p>}
    </Card>
  );
}
