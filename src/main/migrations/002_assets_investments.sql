-- Bens patrimoniais
CREATE TABLE IF NOT EXISTS assets (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  type              TEXT NOT NULL CHECK (type IN ('imovel','veiculo','terreno','investimento','outro')),
  acquisition_value REAL NOT NULL DEFAULT 0,
  current_value     REAL NOT NULL DEFAULT 0,
  acquisition_date  TEXT,
  description       TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Carteira de investimentos
CREATE TABLE IF NOT EXISTS investments (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  type             TEXT NOT NULL CHECK (type IN ('renda_fixa','renda_variavel','fundo','cripto','outro')),
  institution      TEXT,
  applied_amount   REAL NOT NULL DEFAULT 0,
  current_value    REAL NOT NULL DEFAULT 0,
  application_date TEXT,
  maturity_date    TEXT,
  notes            TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Notificações disparadas (evita repetição no mesmo dia)
CREATE TABLE IF NOT EXISTS notification_log (
  id        TEXT PRIMARY KEY,
  type      TEXT NOT NULL,
  ref_id    TEXT NOT NULL,
  sent_date TEXT NOT NULL DEFAULT (date('now')),
  UNIQUE (type, ref_id, sent_date)
);

-- Controle de recorrências geradas
CREATE TABLE IF NOT EXISTS recurring_log (
  source_id       TEXT NOT NULL,
  source_type     TEXT NOT NULL CHECK (source_type IN ('transaction','bill')),
  generated_month INTEGER NOT NULL,
  generated_year  INTEGER NOT NULL,
  PRIMARY KEY (source_id, generated_month, generated_year)
);
