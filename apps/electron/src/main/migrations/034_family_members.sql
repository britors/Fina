-- Membros da família/casal com identidade própria (id real), em vez da
-- lista em texto livre `app_settings.family_members` (CSV) usada até aqui.
-- O backfill a partir do CSV existente acontece de forma preguiçosa no
-- primeiro acesso via IPC (parsing de CSV não é papel de uma migration SQL).
CREATE TABLE IF NOT EXISTS family_members (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
