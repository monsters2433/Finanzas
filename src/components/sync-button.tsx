"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SyncButton() {
  const router = useRouter();
  const [state, setState] = useState<{ busy: boolean; message: string | null; error: boolean }>({
    busy: false,
    message: null,
    error: false,
  });

  async function sync() {
    setState({ busy: true, message: null, error: false });
    try {
      const res = await fetch("/api/bank/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al sincronizar");
      const parts = [`${data.imported} nuevos`];
      if (data.errors?.length) parts.push(data.errors[0]);
      setState({ busy: false, message: parts.join(" · "), error: Boolean(data.errors?.length) });
      router.refresh();
    } catch (err) {
      setState({ busy: false, message: (err as Error).message, error: true });
    }
  }

  return (
    <div className="flex items-center gap-3">
      {state.message && (
        <span className={`text-xs ${state.error ? "text-warn" : "text-muted"}`}>{state.message}</span>
      )}
      <button className="btn-ghost" onClick={sync} disabled={state.busy}>
        {state.busy ? "Sincronizando…" : "Sincronizar banco"}
      </button>
    </div>
  );
}
