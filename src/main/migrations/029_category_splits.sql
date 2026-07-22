-- Permite dividir transações, contas a pagar e contas a receber entre
-- múltiplas categorias, espelhando 007_payment_splits.sql (que faz o mesmo
-- para meios de pagamento). A coluna escalar category_id continua existindo
-- e passa a representar a categoria principal (primeira do split).

CREATE TABLE IF NOT EXISTS transaction_categories (
  id             TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  category_id    TEXT NOT NULL REFERENCES categories(id),
  amount         REAL NOT NULL CHECK (amount > 0),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_transaction_categories_tx ON transaction_categories(transaction_id);

INSERT INTO transaction_categories (id, transaction_id, category_id, amount)
SELECT lower(hex(randomblob(16))), id, category_id, amount
FROM transactions
WHERE NOT EXISTS (
  SELECT 1 FROM transaction_categories tc WHERE tc.transaction_id = transactions.id
);

CREATE TABLE IF NOT EXISTS bill_categories (
  id          TEXT PRIMARY KEY,
  bill_id     TEXT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id),
  amount      REAL NOT NULL CHECK (amount > 0),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bill_categories_bill ON bill_categories(bill_id);

INSERT INTO bill_categories (id, bill_id, category_id, amount)
SELECT lower(hex(randomblob(16))), id, category_id, amount
FROM bills
WHERE category_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM bill_categories bc WHERE bc.bill_id = bills.id
  );

CREATE TABLE IF NOT EXISTS receivable_categories (
  id            TEXT PRIMARY KEY,
  receivable_id TEXT NOT NULL REFERENCES receivables(id) ON DELETE CASCADE,
  category_id   TEXT NOT NULL REFERENCES categories(id),
  amount        REAL NOT NULL CHECK (amount > 0),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_receivable_categories_receivable ON receivable_categories(receivable_id);

INSERT INTO receivable_categories (id, receivable_id, category_id, amount)
SELECT lower(hex(randomblob(16))), id, category_id, amount
FROM receivables
WHERE category_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM receivable_categories rc WHERE rc.receivable_id = receivables.id
  );
