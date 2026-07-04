-- Permite dividir transações e contas a pagar entre múltiplos meios de pagamento.

CREATE TABLE IF NOT EXISTS transaction_payments (
  id             TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  account_id     TEXT NOT NULL REFERENCES accounts(id),
  amount         REAL NOT NULL CHECK (amount > 0),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_transaction_payments_tx ON transaction_payments(transaction_id);

INSERT INTO transaction_payments (id, transaction_id, account_id, amount)
SELECT lower(hex(randomblob(16))), id, account_id, amount
FROM transactions
WHERE type IN ('income', 'expense')
  AND NOT EXISTS (
    SELECT 1 FROM transaction_payments p WHERE p.transaction_id = transactions.id
  );

CREATE TABLE IF NOT EXISTS bill_payments (
  id         TEXT PRIMARY KEY,
  bill_id    TEXT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  amount     REAL NOT NULL CHECK (amount > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bill_payments_bill ON bill_payments(bill_id);

INSERT INTO bill_payments (id, bill_id, account_id, amount)
SELECT lower(hex(randomblob(16))), id, account_id, amount
FROM bills
WHERE account_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM bill_payments p WHERE p.bill_id = bills.id
  );
