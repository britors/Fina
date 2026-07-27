-- Classificação fiscal explícita por categoria, para o IRPF parar de
-- depender só de matching de texto no nome da categoria.
ALTER TABLE categories ADD COLUMN fiscal_classification TEXT CHECK (fiscal_classification IN ('tributavel','isenta','dedutivel'));

-- Marca receitas que compõem o faturamento de MEI (livro-caixa), separado
-- do restante das receitas pessoais.
ALTER TABLE transactions ADD COLUMN is_mei_revenue INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS mei_das_payments (
  id          TEXT PRIMARY KEY,
  competencia TEXT NOT NULL,
  amount      REAL NOT NULL DEFAULT 0,
  paid_date   TEXT,
  status      TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','pago')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mei_das_competencia ON mei_das_payments(competencia);
