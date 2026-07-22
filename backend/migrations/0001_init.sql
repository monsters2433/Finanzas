-- Ciclo · esquema inicial (D1 / SQLite)
-- Regla de oro: TODA fila de dominio cuelga de un user_id y toda query se filtra por él.

CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  email          TEXT UNIQUE NOT NULL,
  password_hash  TEXT,                       -- NULL si el alta es por OAuth
  name           TEXT,
  country        TEXT,
  currency       TEXT NOT NULL DEFAULT 'EUR',
  locale         TEXT NOT NULL DEFAULT 'es-ES',
  plan           TEXT NOT NULL DEFAULT 'free',   -- 'free' | 'plus'
  preferences    TEXT NOT NULL DEFAULT '{}',     -- JSON: likes de ideas, avisosOn, etc.
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Pagos recurrentes / suscripciones (state.subs)
CREATE TABLE IF NOT EXISTS subscriptions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nombre     TEXT NOT NULL,
  importe    REAL NOT NULL,
  moneda     TEXT NOT NULL DEFAULT 'EUR',
  ciclo      TEXT NOT NULL,                  -- semanal|mensual|bimestral|trimestral|semestral|anual
  fecha      TEXT NOT NULL,                  -- YYYY-MM-DD (ancla del próximo cargo)
  categoria  TEXT,
  aviso      INTEGER NOT NULL DEFAULT 3,     -- días de aviso antes del cargo
  metodo     TEXT,
  notas      TEXT,
  pausado    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_subs_user ON subscriptions(user_id);

-- Ingresos recurrentes (state.ingresos)
CREATE TABLE IF NOT EXISTS incomes (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nombre     TEXT NOT NULL,
  importe    REAL NOT NULL,
  moneda     TEXT NOT NULL DEFAULT 'EUR',
  ciclo      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_incomes_user ON incomes(user_id);

-- Gastos puntuales (state.gastos)
CREATE TABLE IF NOT EXISTS expenses (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  concepto   TEXT NOT NULL,
  importe    REAL NOT NULL,
  moneda     TEXT NOT NULL DEFAULT 'EUR',
  fecha      TEXT NOT NULL,                  -- YYYY-MM-DD
  categoria  TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_expenses_user ON expenses(user_id);

-- Metas de ahorro (ahorro: state.goals)
CREATE TABLE IF NOT EXISTS goals (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL DEFAULT '🎯',
  nombre     TEXT NOT NULL,
  objetivo   REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id);

-- Aportaciones a metas (goal.contribs)
CREATE TABLE IF NOT EXISTS contributions (
  id       TEXT PRIMARY KEY,
  goal_id  TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  amount   REAL NOT NULL,
  date     TEXT NOT NULL                     -- YYYY-MM-DD
);
CREATE INDEX IF NOT EXISTS idx_contribs_goal ON contributions(goal_id);

-- Facturación (Stripe)
CREATE TABLE IF NOT EXISTS billing (
  user_id                TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  status                 TEXT,               -- active|trialing|past_due|canceled...
  current_period_end     TEXT,
  updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Idempotencia de recordatorios enviados
CREATE TABLE IF NOT EXISTS notifications_sent (
  user_id  TEXT NOT NULL,
  sub_id   TEXT NOT NULL,
  occ_date TEXT NOT NULL,                    -- fecha del cargo notificado
  channel  TEXT NOT NULL,                    -- 'push' | 'email'
  sent_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (sub_id, occ_date, channel)
);
