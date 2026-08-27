import { formatCents } from "@/lib/money";

export function Card({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-sm font-semibold text-slate-200">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({
  label,
  cents,
  hint,
  tone = "neutral",
  sign = false,
}: {
  label: string;
  cents: number;
  hint?: string;
  tone?: "neutral" | "good" | "bad" | "accent";
  sign?: boolean;
}) {
  const toneClass = {
    neutral: "text-slate-100",
    good: "text-good",
    bad: "text-bad",
    accent: "text-accent",
  }[tone];
  return (
    <div className="card">
      <p className="label">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${toneClass}`}>
        {formatCents(cents, "EUR", { sign })}
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const width = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
      <div className="h-full rounded-full" style={{ width: `${width}%`, background: color }} />
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-edge px-4 py-8 text-center text-sm text-muted">
      {children}
    </p>
  );
}

export function Dot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ background: color }}
      aria-hidden
    />
  );
}
