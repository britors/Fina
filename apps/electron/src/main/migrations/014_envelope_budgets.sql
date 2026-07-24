-- Modo envelope: orçamentos podem reter o saldo não gasto para o mês
-- seguinte em vez de resetar a zero (comportamento clássico de "envelope").

ALTER TABLE budgets ADD COLUMN carry_over INTEGER NOT NULL DEFAULT 0;
