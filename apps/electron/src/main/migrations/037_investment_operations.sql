-- Livro de operações de compra/venda por investimento. O schema anterior só
-- guardava a posição agregada (applied_amount/current_value), sem permitir
-- apurar ganho de capital por operação (custo médio, quantidade, data).
CREATE TABLE IF NOT EXISTS investment_operations (
  id            TEXT PRIMARY KEY,
  investment_id TEXT NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('compra','venda')),
  quantity      REAL NOT NULL DEFAULT 0,
  unit_price    REAL NOT NULL DEFAULT 0,
  fees          REAL NOT NULL DEFAULT 0,
  date          TEXT NOT NULL,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_investment_operations_investment ON investment_operations(investment_id, date);
