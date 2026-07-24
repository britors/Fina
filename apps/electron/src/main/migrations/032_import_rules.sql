CREATE TABLE IF NOT EXISTS import_category_rules (
  description_key TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (description_key, transaction_type)
);
