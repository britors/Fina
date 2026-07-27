-- Persistência da Revisão Semanal em SQLite, substituindo o que hoje só
-- vive em localStorage do renderer (não sincroniza entre dispositivos e não
-- entra no backup .fin) — necessário para um streak confiável.
CREATE TABLE IF NOT EXISTS weekly_review_log (
  week_start   TEXT PRIMARY KEY,
  items_json   TEXT NOT NULL DEFAULT '[]',
  completed_at TEXT
);
