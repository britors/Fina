-- Histórico de saldo das contas conectadas via Open Finance, registrado a
-- cada sincronização. Sem isso não é possível detectar queda brusca de
-- saldo — accounts.balance só guarda o valor atual, sem série no tempo.

CREATE TABLE IF NOT EXISTS account_balance_snapshots (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  balance     REAL NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_balance_snapshots_account ON account_balance_snapshots(account_id, recorded_at);
