-- Contas em moeda estrangeira: o saldo em BRL (usado em todo o resto do
-- app) continua em `balance`, calculado automaticamente a partir do saldo
-- na moeda original (`original_balance`) e da cotação vigente.

ALTER TABLE accounts ADD COLUMN currency TEXT NOT NULL DEFAULT 'BRL'
  CHECK (currency IN ('BRL','USD','EUR'));
ALTER TABLE accounts ADD COLUMN original_balance REAL;
