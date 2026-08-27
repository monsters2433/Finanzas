import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

let _db: Database.Database | null = null;

function dbPath() {
  const configured = process.env.DATABASE_PATH;
  if (configured) return configured;
  return path.join(process.cwd(), "data", "finanzas.db");
}

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- A PSD2 consent (GoCardless "requisition"). One per bank the user links.
CREATE TABLE IF NOT EXISTS bank_connections (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  provider          TEXT NOT NULL DEFAULT 'gocardless',
  requisition_id    TEXT NOT NULL UNIQUE,
  reference         TEXT NOT NULL,
  institution_id    TEXT NOT NULL,
  institution_name  TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'CREATED',
  link              TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  consent_expires_at TEXT
);

CREATE TABLE IF NOT EXISTS accounts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id    INTEGER REFERENCES bank_connections(id) ON DELETE SET NULL,
  external_id      TEXT UNIQUE,
  name             TEXT NOT NULL,
  iban             TEXT,
  currency         TEXT NOT NULL DEFAULT 'EUR',
  institution_name TEXT,
  balance_cents    INTEGER,
  balance_at       TEXT,
  last_synced_at   TEXT,
  archived         INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  name                 TEXT NOT NULL UNIQUE,
  kind                 TEXT NOT NULL DEFAULT 'variable', -- fixed | variable | income | savings
  color                TEXT NOT NULL DEFAULT '#4f8cff',
  monthly_budget_cents INTEGER,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Auto-categorisation rules, applied by descending priority.
CREATE TABLE IF NOT EXISTS rules (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern     TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  priority    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Every movement, from the bank or typed by hand.
-- amount_cents: negative = money out, positive = money in.
CREATE TABLE IF NOT EXISTS transactions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id    INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
  external_id   TEXT UNIQUE,
  source        TEXT NOT NULL DEFAULT 'bank',       -- bank | manual
  booked_date   TEXT NOT NULL,                      -- YYYY-MM-DD
  value_date    TEXT,
  amount_cents  INTEGER NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'EUR',
  merchant      TEXT NOT NULL DEFAULT '',
  description   TEXT NOT NULL DEFAULT '',
  category_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  is_payroll    INTEGER NOT NULL DEFAULT 0,
  payroll_override INTEGER,                          -- NULL = automático, 1/0 = decidido a mano
  excluded      INTEGER NOT NULL DEFAULT 0,          -- ignore in stats (transfers between own accounts)
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tx_date     ON transactions(booked_date);
CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_tx_payroll  ON transactions(is_payroll);

-- Recurring items: subscriptions, fixed expenses and expected income.
CREATE TABLE IF NOT EXISTS recurring (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'subscription', -- subscription | fixed | income
  amount_cents  INTEGER NOT NULL,                     -- always positive; kind decides the sign
  currency      TEXT NOT NULL DEFAULT 'EUR',
  category_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  frequency     TEXT NOT NULL DEFAULT 'monthly',      -- weekly | monthly | quarterly | yearly
  interval_n    INTEGER NOT NULL DEFAULT 1,
  first_date    TEXT NOT NULL,                        -- YYYY-MM-DD, anchor of the series
  end_date      TEXT,
  reminder_days INTEGER NOT NULL DEFAULT 1,           -- alert N days before each charge
  active        INTEGER NOT NULL DEFAULT 1,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  label      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Idempotency guard so the same event never notifies twice.
CREATE TABLE IF NOT EXISTS notification_log (
  key     TEXT PRIMARY KEY,
  title   TEXT NOT NULL,
  body    TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const DEFAULT_CATEGORIES: Array<[string, string, string]> = [
  ["Nómina", "income", "#3fb950"],
  ["Otros ingresos", "income", "#2ea043"],
  ["Alquiler / Hipoteca", "fixed", "#f78166"],
  ["Suministros", "fixed", "#d29922"],
  ["Telefonía e Internet", "fixed", "#a371f7"],
  ["Seguros", "fixed", "#6e7681"],
  ["Suscripciones", "fixed", "#db61a2"],
  ["Supermercado", "variable", "#4f8cff"],
  ["Restaurantes", "variable", "#ff7b72"],
  ["Transporte", "variable", "#56d364"],
  ["Compras", "variable", "#e3b341"],
  ["Ocio", "variable", "#bc8cff"],
  ["Salud", "variable", "#79c0ff"],
  ["Ahorro / Inversión", "savings", "#3fb950"],
  ["Sin categoría", "variable", "#8b97a8"],
];

// merchant/description pattern -> category name
const DEFAULT_RULES: Array<[string, string, number]> = [
  ["nomina|nómina|payroll|salario", "Nómina", 100],
  ["netflix|hbo|max\\b|disney|spotify|prime video|filmin|dazn|apple\\.com/bill|itunes|youtube premium|google storage|icloud|dropbox|chatgpt|openai|claude|notion|adobe", "Suscripciones", 90],
  ["mercadona|carrefour|lidl|aldi|dia\\b|alcampo|eroski|consum|ahorramas|bonarea|supercor|hipercor", "Supermercado", 80],
  ["endesa|iberdrola|naturgy|repsol luz|holaluz|totalenergies|aqualia|canal isabel|emasesa|agbar", "Suministros", 80],
  ["movistar|vodafone|orange|yoigo|masmovil|pepephone|digi|jazztel|simyo|finetwork", "Telefonía e Internet", 80],
  ["mapfre|axa|allianz|mutua|generali|linea directa|zurich|adeslas|sanitas|asisa", "Seguros", 80],
  ["alquiler|hipoteca|arrendamiento|prestamo hipotecario", "Alquiler / Hipoteca", 80],
  ["renfe|emt |metro |uber|cabify|bolt|bicimad|repsol|cepsa|shell|bp \\b|galp|parking|aparcamiento|autopista|avanza|alsa|blablacar", "Transporte", 70],
  ["glovo|just eat|justeat|uber eats|deliveroo|telepizza|dominos|burger|mcdonald|starbucks|restaurante|bar |cafeteria|cafetería|goiko|tacos|sushi", "Restaurantes", 70],
  ["amazon|aliexpress|zara|h&m|primark|decathlon|mediamarkt|pccomponentes|ikea|leroy|el corte ingles|shein|temu", "Compras", 60],
  ["farmacia|clinica|clínica|dentista|hospital|optica|óptica|fisio", "Salud", 60],
  ["cine|teatro|spotify|gimnasio|gym|padel|pádel|basic fit|altafit|steam|playstation|nintendo|xbox", "Ocio", 55],
  ["traspaso|traspaso a|indexa|myinvestor|trade republic|degiro|revolut ahorro|plan de pensiones", "Ahorro / Inversión", 50],
];

function seed(db: Database.Database) {
  const count = db.prepare("SELECT COUNT(*) AS n FROM categories").get() as { n: number };
  if (count.n > 0) return;

  const insertCat = db.prepare("INSERT INTO categories (name, kind, color) VALUES (?, ?, ?)");
  const insertRule = db.prepare(
    "INSERT INTO rules (pattern, category_id, priority) VALUES (?, (SELECT id FROM categories WHERE name = ?), ?)",
  );
  db.transaction(() => {
    for (const [name, kind, color] of DEFAULT_CATEGORIES) insertCat.run(name, kind, color);
    for (const [pattern, cat, priority] of DEFAULT_RULES) insertRule.run(pattern, cat, priority);
  })();
}

/** Additive column migrations, so an existing database keeps working. */
const MIGRATIONS: Array<[table: string, column: string, definition: string]> = [
  ["transactions", "payroll_override", "INTEGER"],
];

function migrate(db: Database.Database) {
  for (const [table, column, definition] of MIGRATIONS) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (columns.some((c) => c.name === column)) continue;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function getDb(): Database.Database {
  if (_db) return _db;
  const file = dbPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.exec(SCHEMA);
  migrate(db);
  seed(db);
  _db = db;
  return db;
}

export function getSetting(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, value);
}

export function getSettingNumber(key: string, fallback: number): number {
  const raw = getSetting(key);
  if (raw === null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}
