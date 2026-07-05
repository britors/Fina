-- Transações marcadas como revisadas pelo usuário na detecção de anomalias
-- de gastos, para não repetir um alerta já analisado.

CREATE TABLE IF NOT EXISTS dismissed_anomalies (
  transaction_id TEXT PRIMARY KEY,
  dismissed_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
