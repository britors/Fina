-- Estado operacional das conexões Open Finance.
-- As contas importadas continuam em accounts; esta tabela guarda metadados
-- da conexão para a central de gestão exibir último sync e último erro.

CREATE TABLE IF NOT EXISTS openfinance_connections (
  id               TEXT PRIMARY KEY,
  provider         TEXT NOT NULL,
  connection_id    TEXT NOT NULL,
  institution_name TEXT,
  status           TEXT NOT NULL DEFAULT 'pending',
  products         TEXT,
  last_sync_at     TEXT,
  last_error       TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(provider, connection_id)
);

CREATE INDEX IF NOT EXISTS idx_openfinance_connections_provider
  ON openfinance_connections(provider, status);
