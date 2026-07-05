-- Histórico local de tentativas de pagamento Pix.
-- Guarda estado operacional e dados minimizados para auditoria sem expor
-- payloads sensíveis do provedor.

CREATE TABLE IF NOT EXISTS pix_payments (
  id                 TEXT PRIMARY KEY,
  provider           TEXT NOT NULL,
  source_account_id  TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  amount             REAL NOT NULL,
  pix_key_masked     TEXT NOT NULL,
  recipient_name     TEXT,
  recipient_bank     TEXT,
  description        TEXT,
  status             TEXT NOT NULL DEFAULT 'draft',
  external_id        TEXT,
  transaction_id     TEXT REFERENCES transactions(id) ON DELETE SET NULL,
  error_message      TEXT,
  metadata           TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pix_payments_status_created
  ON pix_payments(status, created_at);

CREATE INDEX IF NOT EXISTS idx_pix_payments_provider_external
  ON pix_payments(provider, external_id);
