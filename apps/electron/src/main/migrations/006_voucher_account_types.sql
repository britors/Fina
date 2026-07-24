-- Adiciona Vale Refeição e Vale Alimentação como tipos de meio de pagamento.
-- SQLite não permite alterar CHECK diretamente, então a tabela é recriada.

PRAGMA foreign_keys = OFF;

BEGIN;

CREATE TABLE accounts_new (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('checking','savings','credit_card','meal_voucher','food_voucher','wallet')),
  bank_name    TEXT,
  balance      REAL NOT NULL DEFAULT 0,
  credit_limit REAL,
  color        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO accounts_new (id, name, type, bank_name, balance, credit_limit, color, created_at, updated_at)
SELECT id, name, type, bank_name, balance, credit_limit, color, created_at, updated_at
FROM accounts;

DROP TABLE accounts;
ALTER TABLE accounts_new RENAME TO accounts;

COMMIT;

PRAGMA foreign_keys = ON;
