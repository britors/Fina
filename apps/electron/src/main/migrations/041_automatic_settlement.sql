-- Permite que contas a pagar e a receber sejam baixadas automaticamente no
-- dia do vencimento. O padrão desligado preserva o comportamento anterior.
ALTER TABLE bills ADD COLUMN auto_settle INTEGER NOT NULL DEFAULT 0 CHECK (auto_settle IN (0,1));
ALTER TABLE receivables ADD COLUMN auto_settle INTEGER NOT NULL DEFAULT 0 CHECK (auto_settle IN (0,1));
