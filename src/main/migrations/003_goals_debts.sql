-- Metas financeiras
CREATE TABLE IF NOT EXISTS goals (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('viagem','imovel','evento','emergencia','outro')),
  target_amount REAL NOT NULL DEFAULT 0,
  current_amount REAL NOT NULL DEFAULT 0,
  target_date   TEXT,
  account_id    TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  description   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Dívidas e financiamentos
CREATE TABLE IF NOT EXISTS debts (
  id                  TEXT PRIMARY KEY,
  description         TEXT NOT NULL,
  type                TEXT NOT NULL CHECK (type IN ('emprestimo','financiamento','cartao','cheque_especial','pessoal','outro')),
  creditor            TEXT,
  original_amount     REAL NOT NULL DEFAULT 0,
  outstanding_balance REAL NOT NULL DEFAULT 0,
  interest_rate       REAL NOT NULL DEFAULT 0,
  installments_total  INTEGER NOT NULL DEFAULT 1,
  installments_remaining INTEGER NOT NULL DEFAULT 1,
  installment_amount  REAL NOT NULL DEFAULT 0,
  next_due_date       TEXT,
  status              TEXT NOT NULL DEFAULT 'em_dia' CHECK (status IN ('em_dia','em_atraso','renegociada','quitada')),
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
