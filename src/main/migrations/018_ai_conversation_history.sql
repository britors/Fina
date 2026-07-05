-- Histórico local de perguntas e respostas do Assistente IA (tela
-- "Assistente IA"), para consulta de análises passadas. Nenhum dado novo é
-- enviado a terceiros; é apenas a mesma pergunta/resposta já trocada com o
-- provedor, guardada no SQLite local.

CREATE TABLE IF NOT EXISTS ai_conversations (
  id         TEXT PRIMARY KEY,
  question   TEXT NOT NULL,
  answer     TEXT NOT NULL,
  provider   TEXT NOT NULL,
  model      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_created_at ON ai_conversations(created_at);
