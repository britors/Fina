-- Favorecidos Pix salvos localmente para reduzir erro de digitação.

CREATE TABLE IF NOT EXISTS pix_recipients (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  pix_key     TEXT NOT NULL,
  key_type    TEXT NOT NULL,
  institution TEXT,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pix_recipients_name
  ON pix_recipients(name);
