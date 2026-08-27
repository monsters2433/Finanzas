import { getDb } from "./db";

export type Rule = { id: number; pattern: string; category_id: number; priority: number };

/** Cleans a bank description down to something that reads like a merchant name. */
export function extractMerchant(description: string): string {
  let s = (description || "").replace(/\s+/g, " ").trim();
  s = s.replace(
    /^(compra|pago|pago en|tarjeta|targeta|recibo|adeudo|adeudo domiciliado|domiciliacion|domiciliación|transferencia|transf\.?|bizum|traspaso|cargo|movimiento)\s+(de|a|en|por|recibido|emitida|realizada)?\s*/i,
    "",
  );
  s = s.replace(/\b\d{2}[/-]\d{2}([/-]\d{2,4})?\b/g, " ");          // dates
  s = s.replace(/\b(\*{2,}|x{4,})\d{2,4}\b/gi, " ");                 // masked card numbers
  s = s.replace(/\bES\d{2}[\s]?\d{4}[\s]?\d{4}[\s]?\d{2}[\s]?\d{10}\b/gi, " "); // IBANs
  s = s.replace(/\b\d{6,}\b/g, " ");                                 // long reference numbers
  s = s.replace(/\s+/g, " ").trim();
  if (!s) s = (description || "").trim();
  return s.length > 60 ? `${s.slice(0, 60).trim()}…` : s;
}

export function loadRules(): Rule[] {
  return getDb()
    .prepare("SELECT id, pattern, category_id, priority FROM rules ORDER BY priority DESC, id ASC")
    .all() as Rule[];
}

/** Returns the category id for a movement, or null when no rule matches. */
export function categorize(text: string, rules: Rule[] = loadRules()): number | null {
  const haystack = (text || "").toLowerCase();
  for (const rule of rules) {
    let re: RegExp;
    try {
      re = new RegExp(rule.pattern, "i");
    } catch {
      continue; // a user-typed rule with invalid regex must not break the sync
    }
    if (re.test(haystack)) return rule.category_id;
  }
  return null;
}

export function fallbackCategoryId(): number | null {
  const row = getDb()
    .prepare("SELECT id FROM categories WHERE name = 'Sin categoría'")
    .get() as { id: number } | undefined;
  return row?.id ?? null;
}
