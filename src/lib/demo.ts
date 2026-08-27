import { getDb } from "./db";
import { categorize, fallbackCategoryId, loadRules } from "./categorize";
import { addMonths, monthStart, monthKey, todayISO, type ISODate } from "./dates";
import { detectPayrolls } from "./payroll";

type Spec = { merchant: string; description: string; min: number; max: number; perMonth: number };

const SPENDING: Spec[] = [
  { merchant: "Mercadona", description: "COMPRA TARJETA MERCADONA", min: 2200, max: 9500, perMonth: 6 },
  { merchant: "Lidl", description: "COMPRA TARJETA LIDL", min: 1500, max: 5200, perMonth: 2 },
  { merchant: "Glovo", description: "PAGO GLOVO APP", min: 1200, max: 3400, perMonth: 3 },
  { merchant: "Bar Manolo", description: "COMPRA TARJETA BAR MANOLO", min: 600, max: 2400, perMonth: 4 },
  { merchant: "Metro de Madrid", description: "RECARGA METRO", min: 1000, max: 4000, perMonth: 1 },
  { merchant: "Cabify", description: "PAGO CABIFY", min: 700, max: 2600, perMonth: 2 },
  { merchant: "Amazon", description: "COMPRA AMAZON EU", min: 900, max: 8900, perMonth: 3 },
  { merchant: "Decathlon", description: "COMPRA TARJETA DECATHLON", min: 1500, max: 7000, perMonth: 1 },
  { merchant: "Farmacia Centro", description: "COMPRA FARMACIA", min: 500, max: 3200, perMonth: 1 },
  { merchant: "Cine Yelmo", description: "COMPRA CINE YELMO", min: 900, max: 2600, perMonth: 1 },
];

const FIXED: Array<{ merchant: string; description: string; cents: number; day: number }> = [
  { merchant: "Alquiler piso", description: "TRANSFERENCIA ALQUILER VIVIENDA", cents: 85000, day: 1 },
  { merchant: "Iberdrola", description: "RECIBO IBERDROLA CLIENTES", cents: 6200, day: 8 },
  { merchant: "Aqualia", description: "RECIBO AQUALIA AGUA", cents: 2400, day: 12 },
  { merchant: "Movistar", description: "RECIBO MOVISTAR FUSION", cents: 5490, day: 3 },
  { merchant: "Mapfre", description: "RECIBO MAPFRE SEGURO HOGAR", cents: 2150, day: 15 },
  { merchant: "Netflix", description: "NETFLIX.COM SUSCRIPCION", cents: 1399, day: 7 },
  { merchant: "Spotify", description: "SPOTIFY AB SUSCRIPCION", cents: 1199, day: 14 },
  { merchant: "Basic Fit", description: "RECIBO BASIC FIT GIMNASIO", cents: 2999, day: 5 },
  { merchant: "Google Storage", description: "GOOGLE STORAGE SUSCRIPCION", cents: 299, day: 21 },
  { merchant: "Indexa Capital", description: "TRASPASO INDEXA CAPITAL", cents: 20000, day: 28 },
];

const PAYROLL_BASE = 210_000; // 2.100 € net
const MONTHS_OF_HISTORY = 14;

/** Deterministic PRNG so repeated seeds produce the same demo history. */
function makeRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function dayISO(month: string, day: number): ISODate {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

export function seedDemoData(): { transactions: number; recurring: number } {
  const db = getDb();
  const rules = loadRules();
  const fallback = fallbackCategoryId();
  const random = makeRandom(20260827);
  const today = todayISO();

  const account = db
    .prepare(
      `INSERT INTO accounts (external_id, name, iban, currency, institution_name, balance_cents, balance_at)
       VALUES ('demo-account', 'Cuenta nómina (demo)', 'ES00 0000 0000 0000 0000 0000', 'EUR', 'Banco Demo', 412350, datetime('now'))
       ON CONFLICT(external_id) DO UPDATE SET archived = 0
       RETURNING id`,
    )
    .get() as { id: number };

  const insert = db.prepare(
    `INSERT INTO transactions
       (account_id, external_id, source, booked_date, value_date, amount_cents, currency,
        merchant, description, category_id)
     VALUES (?, ?, 'bank', ?, ?, ?, 'EUR', ?, ?, ?)
     ON CONFLICT(external_id) DO NOTHING`,
  );

  let inserted = 0;
  const add = (key: string, date: ISODate, cents: number, merchant: string, description: string) => {
    if (date > today) return;
    const category = categorize(`${merchant} ${description}`, rules) ?? fallback;
    const info = insert.run(account.id, `demo:${key}`, date, date, cents, merchant, description, category);
    inserted += info.changes;
  };

  db.transaction(() => {
    for (let i = MONTHS_OF_HISTORY - 1; i >= 0; i--) {
      const month = monthKey(addMonths(monthStart(monthKey(today)), -i));
      const [, monthNumber] = month.split("-").map(Number);

      // Payroll on the 25th, with the Spanish extra payments in June and December.
      const isExtra = monthNumber === 6 || monthNumber === 12;
      const jitter = Math.round((random() - 0.5) * 4000);
      const payroll = PAYROLL_BASE + jitter + (isExtra ? PAYROLL_BASE : 0);
      add(`nomina-${month}`, dayISO(month, 25), payroll, "Tecnologías Ejemplo SL", "TRANSFERENCIA NOMINA MENSUAL");

      for (const item of FIXED) {
        add(`fijo-${item.merchant}-${month}`, dayISO(month, item.day), -item.cents, item.merchant, item.description);
      }

      for (const spec of SPENDING) {
        const count = Math.max(0, Math.round(spec.perMonth * (0.6 + random() * 0.8)));
        for (let n = 0; n < count; n++) {
          const day = 1 + Math.floor(random() * 28);
          const cents = spec.min + Math.floor(random() * (spec.max - spec.min));
          add(`gasto-${spec.merchant}-${month}-${n}`, dayISO(month, day), -cents, spec.merchant, spec.description);
        }
      }
    }
  })();

  // Mirror the recurring charges as calendar items.
  const recurringSeed: Array<[string, string, number, number, string]> = [
    ["Alquiler piso", "fixed", 85000, 1, "Alquiler / Hipoteca"],
    ["Movistar Fusión", "fixed", 5490, 3, "Telefonía e Internet"],
    ["Iberdrola", "fixed", 6200, 8, "Suministros"],
    ["Seguro hogar Mapfre", "fixed", 2150, 15, "Seguros"],
    ["Netflix", "subscription", 1399, 7, "Suscripciones"],
    ["Spotify", "subscription", 1199, 14, "Suscripciones"],
    ["Basic Fit", "subscription", 2999, 5, "Suscripciones"],
    ["Google Storage", "subscription", 299, 21, "Suscripciones"],
  ];

  const insertRecurring = db.prepare(
    `INSERT INTO recurring (name, kind, amount_cents, category_id, frequency, first_date, reminder_days)
     SELECT ?, ?, ?, (SELECT id FROM categories WHERE name = ?), 'monthly', ?, 2
      WHERE NOT EXISTS (SELECT 1 FROM recurring WHERE name = ?)`,
  );

  let recurringCount = 0;
  db.transaction(() => {
    for (const [name, kind, cents, day, category] of recurringSeed) {
      const first = dayISO(monthKey(addMonths(today, -MONTHS_OF_HISTORY)), day);
      recurringCount += insertRecurring.run(name, kind, cents, category, first, name).changes;
    }
  })();

  detectPayrolls();
  return { transactions: inserted, recurring: recurringCount };
}
