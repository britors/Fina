-- Classifica categorias de despesa entre essenciais e variáveis.

ALTER TABLE categories ADD COLUMN kind TEXT NOT NULL DEFAULT 'variable' CHECK (kind IN ('essential','variable','income'));

UPDATE categories SET kind = 'income' WHERE type = 'income';
UPDATE categories SET kind = 'essential'
WHERE type = 'expense'
  AND lower(name) IN ('alimentação', 'alimentacao', 'transporte', 'moradia', 'saúde', 'saude', 'educação', 'educacao');
