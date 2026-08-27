export function formatCents(cents: number, currency = "EUR", opts: { sign?: boolean } = {}): string {
  const value = cents / 100;
  const formatted = new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
  if (!opts.sign) return value < 0 ? `-${formatted}` : formatted;
  return `${value < 0 ? "−" : "+"}${formatted}`;
}

/** Parses "1.234,56", "1234.56", "1234,56" or "1 234,56" into cents. */
export function parseAmountToCents(input: string | number): number {
  if (typeof input === "number") return Math.round(input * 100);
  let s = input.trim().replace(/\s|€/g, "");
  if (s === "") return NaN;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

export function toCents(amount: string | number, currencyExponent = 2): number {
  if (typeof amount === "number") return Math.round(amount * 10 ** currencyExponent);
  const n = Number(amount);
  return Number.isFinite(n) ? Math.round(n * 10 ** currencyExponent) : 0;
}

export function pct(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}
