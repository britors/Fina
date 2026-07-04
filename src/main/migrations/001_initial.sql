-- Fina – schema inicial (SQLite)

CREATE TABLE IF NOT EXISTS accounts (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('checking','savings','credit_card','meal_voucher','food_voucher','wallet')),
  bank_name   TEXT,
  balance     REAL NOT NULL DEFAULT 0,
  credit_limit REAL,
  color       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  icon       TEXT NOT NULL,
  color      TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('income','expense')),
  kind       TEXT NOT NULL DEFAULT 'variable' CHECK (kind IN ('essential','variable','income')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transactions (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id),
  description TEXT NOT NULL,
  amount      REAL NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('income','expense','transfer')),
  date        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','pending')),
  notes       TEXT,
  recurring   INTEGER NOT NULL DEFAULT 0,
  owner       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS budgets (
  id           TEXT PRIMARY KEY,
  category_id  TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  month        INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year         INTEGER NOT NULL CHECK (year >= 2000),
  limit_amount REAL NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (category_id, month, year)
);

CREATE TABLE IF NOT EXISTS bills (
  id          TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  amount      REAL NOT NULL,
  due_date    TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','overdue')),
  account_id  TEXT REFERENCES accounts(id),
  recurring   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Categorias padrão
INSERT OR IGNORE INTO categories (id, name, icon, color, type, kind) VALUES
  ('cat-1', 'Salário',       'ti-briefcase',       '#1D9E75', 'income',  'income'),
  ('cat-2', 'Freelance',     'ti-device-laptop',   '#3B82F6', 'income',  'income'),
  ('cat-3', 'Alimentação',   'ti-tools-kitchen-2', '#EF9F27', 'expense', 'essential'),
  ('cat-4', 'Transporte',    'ti-car',             '#8B5CF6', 'expense', 'essential'),
  ('cat-5', 'Moradia',       'ti-home',            '#EC4899', 'expense', 'essential'),
  ('cat-6', 'Saúde',         'ti-heart',           '#D85A30', 'expense', 'essential'),
  ('cat-7', 'Lazer',         'ti-device-gamepad-2','#06B6D4', 'expense', 'variable'),
  ('cat-8', 'Educação',      'ti-school',          '#10B981', 'expense', 'essential');


-- Configurações da aplicação
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO app_settings (key, value) VALUES
  ('user_name',      ''),
  ('user_email',     ''),
  ('accent_color',   '#1D9E75'),
  ('notif_bills',    'true'),
  ('notif_budget',   'true'),
  ('notif_summary',  'false'),
  ('smtp_enabled',   'false'),
  ('smtp_host',      ''),
  ('smtp_port',      '587'),
  ('smtp_secure',    'false'),
  ('smtp_user',      ''),
  ('smtp_pass',      ''),
  ('smtp_from',      ''),
  ('smtp_to',        ''),
  ('family_mode',    'false'),
  ('family_members', '');
