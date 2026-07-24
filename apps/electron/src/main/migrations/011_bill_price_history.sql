-- Histórico de valores de contas recorrentes (fixas/assinaturas), usado para
-- detectar aumento de preço mês a mês, e intervalo de recorrência (permite
-- assinaturas com ciclo diferente do mensal, ex: semanal, trimestral, anual).

ALTER TABLE bills ADD COLUMN recurrence_interval TEXT NOT NULL DEFAULT 'monthly'
  CHECK (recurrence_interval IN ('weekly','biweekly','monthly','bimonthly','quarterly','semiannual','annual'));

CREATE TABLE IF NOT EXISTS bill_price_history (
  id         TEXT PRIMARY KEY,
  bill_id    TEXT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  amount     REAL NOT NULL,
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bill_price_history_bill ON bill_price_history(bill_id, changed_at);

INSERT INTO bill_price_history (id, bill_id, amount, changed_at)
SELECT lower(hex(randomblob(16))), id, amount, created_at
FROM bills
WHERE recurring = 1;
