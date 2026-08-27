"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "No se pudo entrar.");
      return;
    }
    router.replace(params.get("next") ?? "/");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card mx-auto mt-16 w-full max-w-sm space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Entrar</h1>
        <p className="mt-1 text-xs text-muted">Tus finanzas están protegidas con contraseña.</p>
      </div>
      <div>
        <label className="label mb-1.5" htmlFor="password">Contraseña</label>
        <input
          id="password"
          type="password"
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
      </div>
      {error && <p className="text-sm text-bad">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? "Comprobando…" : "Entrar"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
