-- Sugestões de recorrência descartadas pelo usuário (detecção automática de
-- assinaturas/cobranças recorrentes a partir do histórico de transações).
-- Guarda apenas a chave normalizada da descrição, para não repetir uma
-- sugestão já revisada e descartada.

CREATE TABLE IF NOT EXISTS dismissed_recurrence_suggestions (
  key          TEXT PRIMARY KEY,
  dismissed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
