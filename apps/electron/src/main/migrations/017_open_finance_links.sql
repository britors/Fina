-- Metadados de origem para contas e lançamentos importados via Open Finance.

ALTER TABLE accounts ADD COLUMN openfinance_provider TEXT;
ALTER TABLE accounts ADD COLUMN openfinance_id TEXT;

ALTER TABLE transactions ADD COLUMN openfinance_provider TEXT;
ALTER TABLE transactions ADD COLUMN openfinance_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_openfinance
  ON accounts(openfinance_provider, openfinance_id)
  WHERE openfinance_provider IS NOT NULL AND openfinance_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_openfinance
  ON transactions(openfinance_provider, openfinance_id)
  WHERE openfinance_provider IS NOT NULL AND openfinance_id IS NOT NULL;
