-- Permite classificar uma conta a pagar por categoria, usada tanto para
-- filtrar a lista quanto para pré-selecionar a categoria do lançamento
-- gerado ao marcar a conta como paga.
ALTER TABLE bills ADD COLUMN category_id TEXT REFERENCES categories(id);
