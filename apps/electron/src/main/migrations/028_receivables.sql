-- Contas a receber: mesma ideia de contas a pagar (bills), só que para
-- dinheiro que vai entrar em vez de sair. Tabelas espelham bills/bill_payments/
-- bill_price_history (payment splits, histórico de valor para detectar reajuste
-- em recebimentos fixos/recorrentes).

CREATE TABLE IF NOT EXISTS receivables (
  id          TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  amount      REAL NOT NULL,
  due_date    TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','received','overdue')),
  account_id  TEXT REFERENCES accounts(id),
  category_id TEXT REFERENCES categories(id),
  recurring   INTEGER NOT NULL DEFAULT 0,
  recurrence_interval TEXT NOT NULL DEFAULT 'monthly'
    CHECK (recurrence_interval IN ('weekly','biweekly','monthly','bimonthly','quarterly','semiannual','annual')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS receivable_payments (
  id            TEXT PRIMARY KEY,
  receivable_id TEXT NOT NULL REFERENCES receivables(id) ON DELETE CASCADE,
  account_id    TEXT NOT NULL REFERENCES accounts(id),
  amount        REAL NOT NULL CHECK (amount > 0),
  is_pix        INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_receivable_payments_receivable ON receivable_payments(receivable_id);

CREATE TABLE IF NOT EXISTS receivable_price_history (
  id            TEXT PRIMARY KEY,
  receivable_id TEXT NOT NULL REFERENCES receivables(id) ON DELETE CASCADE,
  amount        REAL NOT NULL,
  changed_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_receivable_price_history_receivable ON receivable_price_history(receivable_id, changed_at);

-- recurring_log precisa aceitar 'receivable' como source_type, além de
-- 'transaction' e 'bill' (mesmo mecanismo de anti-duplicação usado para
-- gerar as próximas ocorrências de recorrências).
CREATE TABLE recurring_log_new (
  source_id      TEXT NOT NULL,
  source_type    TEXT NOT NULL CHECK (source_type IN ('transaction','bill','receivable')),
  generated_date TEXT NOT NULL,
  PRIMARY KEY (source_id, source_type, generated_date)
);

INSERT INTO recurring_log_new (source_id, source_type, generated_date)
SELECT source_id, source_type, generated_date FROM recurring_log;

DROP TABLE recurring_log;
ALTER TABLE recurring_log_new RENAME TO recurring_log;
