-- Lembretes recorrentes ligados a um bem (seguro, garantia, IPVA etc.), para
-- o motor de notificações avisar antes do vencimento.
CREATE TABLE IF NOT EXISTS asset_reminders (
  id           TEXT PRIMARY KEY,
  asset_id     TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('seguro','garantia','ipva','outro')),
  due_date     TEXT NOT NULL,
  recurrence   TEXT NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none','annual')),
  notes        TEXT,
  dismissed_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_asset_reminders_asset ON asset_reminders(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_reminders_due ON asset_reminders(due_date);
