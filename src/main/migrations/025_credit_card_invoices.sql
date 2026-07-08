-- Faturas de cartão de crédito: cada ciclo de fechamento vira uma linha,
-- acumulando o total das transações/parcelas/contas pagas nesse período.
CREATE TABLE IF NOT EXISTS credit_card_invoices (
  id           TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  amount       REAL NOT NULL DEFAULT 0,
  closing_date TEXT NOT NULL,
  due_date     TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','paid')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_account_closing ON credit_card_invoices(account_id, closing_date);
CREATE INDEX IF NOT EXISTS idx_invoices_account_status ON credit_card_invoices(account_id, status);

-- Dia do mês em que a fatura fecha/vence. Só relevante para type='credit_card';
-- NULL desativa o rastreamento de faturas para o meio de pagamento (opt-in,
-- sem retroatividade sobre lançamentos já existentes).
ALTER TABLE accounts ADD COLUMN closing_day INTEGER;
ALTER TABLE accounts ADD COLUMN due_day INTEGER;

-- Rastreia a qual fatura cada parcela de pagamento pertence, para permitir
-- reverter o efeito corretamente na edição/exclusão do lançamento (nunca
-- recalculado por data, o que quebraria se o dia de fechamento mudar depois).
ALTER TABLE transaction_payments ADD COLUMN invoice_id TEXT REFERENCES credit_card_invoices(id) ON DELETE SET NULL;
