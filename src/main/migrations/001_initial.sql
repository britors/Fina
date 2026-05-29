-- Fina – schema inicial (SQLite)

CREATE TABLE IF NOT EXISTS accounts (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('checking','savings','credit_card','wallet')),
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
INSERT OR IGNORE INTO categories (id, name, icon, color, type) VALUES
  ('cat-1', 'Salário',       'ti-briefcase',       '#1D9E75', 'income'),
  ('cat-2', 'Freelance',     'ti-device-laptop',   '#3B82F6', 'income'),
  ('cat-3', 'Alimentação',   'ti-tools-kitchen-2', '#EF9F27', 'expense'),
  ('cat-4', 'Transporte',    'ti-car',             '#8B5CF6', 'expense'),
  ('cat-5', 'Moradia',       'ti-home',            '#EC4899', 'expense'),
  ('cat-6', 'Saúde',         'ti-heart',           '#D85A30', 'expense'),
  ('cat-7', 'Lazer',         'ti-device-gamepad-2','#06B6D4', 'expense'),
  ('cat-8', 'Educação',      'ti-school',          '#10B981', 'expense');

-- Contas de exemplo
INSERT OR IGNORE INTO accounts (id, name, type, bank_name, balance, color) VALUES
  ('acc-1', 'Conta Corrente', 'checking', 'Nubank', 3500.00, '#8B5CF6'),
  ('acc-2', 'Poupança',       'savings',  'Itaú',  12000.00, '#1D9E75');

-- Transações de exemplo (datas relativas ao dia atual)
INSERT OR IGNORE INTO transactions (id, account_id, category_id, description, amount, type, date, status) VALUES
  ('tx-01','acc-1','cat-1','Salário de maio',     5000.00,'income', date('now','-5 days'),'confirmed'),
  ('tx-02','acc-1','cat-5','Aluguel',             1500.00,'expense',date('now','-4 days'),'confirmed'),
  ('tx-03','acc-1','cat-3','Supermercado Extra',   320.50,'expense',date('now','-3 days'),'confirmed'),
  ('tx-04','acc-1','cat-4','Uber',                  45.00,'expense',date('now','-3 days'),'confirmed'),
  ('tx-05','acc-1','cat-3','Restaurante Almoço',    68.00,'expense',date('now','-2 days'),'confirmed'),
  ('tx-06','acc-1','cat-7','Netflix',               39.90,'expense',date('now','-2 days'),'confirmed'),
  ('tx-07','acc-1','cat-4','Combustível',          180.00,'expense',date('now','-1 day'), 'confirmed'),
  ('tx-08','acc-1','cat-6','Plano de saúde',       250.00,'expense',date('now','-1 day'), 'pending'),
  ('tx-09','acc-2','cat-2','Freelance projeto web',1200.00,'income', date('now'),          'confirmed'),
  ('tx-10','acc-1','cat-3','iFood',                 55.00,'expense',date('now'),           'pending');

-- Configurações da aplicação
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO app_settings (key, value) VALUES
  ('user_name',      'Usuário'),
  ('user_email',     ''),
  ('accent_color',   '#1D9E75'),
  ('notif_bills',    'true'),
  ('notif_budget',   'true'),
  ('notif_summary',  'false');

-- Contas a pagar de exemplo
INSERT OR IGNORE INTO bills (id, description, amount, due_date, status, account_id) VALUES
  ('bill-1','Internet',         99.90, date('now', '+3 days'), 'pending','acc-1'),
  ('bill-2','Energia Elétrica',180.00, date('now', '+7 days'), 'pending','acc-1'),
  ('bill-3','Cartão de Crédito',650.00,date('now', '+12 days'),'pending','acc-1');
