-- Alertas proativos do Radar Financeiro dispensados pelo usuário.
CREATE TABLE IF NOT EXISTS dismissed_radar_signals (
  signal_key TEXT PRIMARY KEY,
  dismissed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
