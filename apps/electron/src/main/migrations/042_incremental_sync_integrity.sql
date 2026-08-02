-- Metadados de alteração para que patches incrementais consigam transportar
-- edições e exclusões, inclusive nas tabelas que antes só tinham created_at.
ALTER TABLE categories ADD COLUMN updated_at TEXT;
ALTER TABLE family_members ADD COLUMN updated_at TEXT;
UPDATE categories SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE family_members SET updated_at = created_at WHERE updated_at IS NULL;

CREATE TABLE IF NOT EXISTS incremental_tombstones (
  id          TEXT PRIMARY KEY,
  table_name  TEXT NOT NULL,
  row_id      TEXT NOT NULL,
  deleted_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (table_name, row_id)
);

CREATE TRIGGER IF NOT EXISTS incremental_tombstone_accounts
AFTER DELETE ON accounts BEGIN
  INSERT OR REPLACE INTO incremental_tombstones (id, table_name, row_id, deleted_at)
  VALUES (lower(hex(randomblob(16))), 'accounts', OLD.id, datetime('now'));
END;
CREATE TRIGGER IF NOT EXISTS incremental_tombstone_categories
AFTER DELETE ON categories BEGIN
  INSERT OR REPLACE INTO incremental_tombstones (id, table_name, row_id, deleted_at)
  VALUES (lower(hex(randomblob(16))), 'categories', OLD.id, datetime('now'));
END;
CREATE TRIGGER IF NOT EXISTS incremental_tombstone_budgets
AFTER DELETE ON budgets BEGIN
  INSERT OR REPLACE INTO incremental_tombstones (id, table_name, row_id, deleted_at)
  VALUES (lower(hex(randomblob(16))), 'budgets', OLD.id, datetime('now'));
END;
CREATE TRIGGER IF NOT EXISTS incremental_tombstone_bills
AFTER DELETE ON bills BEGIN
  INSERT OR REPLACE INTO incremental_tombstones (id, table_name, row_id, deleted_at)
  VALUES (lower(hex(randomblob(16))), 'bills', OLD.id, datetime('now'));
END;
CREATE TRIGGER IF NOT EXISTS incremental_tombstone_receivables
AFTER DELETE ON receivables BEGIN
  INSERT OR REPLACE INTO incremental_tombstones (id, table_name, row_id, deleted_at)
  VALUES (lower(hex(randomblob(16))), 'receivables', OLD.id, datetime('now'));
END;
CREATE TRIGGER IF NOT EXISTS incremental_tombstone_assets
AFTER DELETE ON assets BEGIN
  INSERT OR REPLACE INTO incremental_tombstones (id, table_name, row_id, deleted_at)
  VALUES (lower(hex(randomblob(16))), 'assets', OLD.id, datetime('now'));
END;
CREATE TRIGGER IF NOT EXISTS incremental_tombstone_asset_reminders
AFTER DELETE ON asset_reminders BEGIN
  INSERT OR REPLACE INTO incremental_tombstones (id, table_name, row_id, deleted_at)
  VALUES (lower(hex(randomblob(16))), 'asset_reminders', OLD.id, datetime('now'));
END;
CREATE TRIGGER IF NOT EXISTS incremental_tombstone_debts
AFTER DELETE ON debts BEGIN
  INSERT OR REPLACE INTO incremental_tombstones (id, table_name, row_id, deleted_at)
  VALUES (lower(hex(randomblob(16))), 'debts', OLD.id, datetime('now'));
END;
CREATE TRIGGER IF NOT EXISTS incremental_tombstone_credit_card_invoices
AFTER DELETE ON credit_card_invoices BEGIN
  INSERT OR REPLACE INTO incremental_tombstones (id, table_name, row_id, deleted_at)
  VALUES (lower(hex(randomblob(16))), 'credit_card_invoices', OLD.id, datetime('now'));
END;
CREATE TRIGGER IF NOT EXISTS incremental_tombstone_mei_das_payments
AFTER DELETE ON mei_das_payments BEGIN
  INSERT OR REPLACE INTO incremental_tombstones (id, table_name, row_id, deleted_at)
  VALUES (lower(hex(randomblob(16))), 'mei_das_payments', OLD.id, datetime('now'));
END;
CREATE TRIGGER IF NOT EXISTS incremental_tombstone_family_members
AFTER DELETE ON family_members BEGIN
  INSERT OR REPLACE INTO incremental_tombstones (id, table_name, row_id, deleted_at)
  VALUES (lower(hex(randomblob(16))), 'family_members', OLD.id, datetime('now'));
END;
CREATE TRIGGER IF NOT EXISTS incremental_tombstone_transactions
AFTER DELETE ON transactions BEGIN
  INSERT OR REPLACE INTO incremental_tombstones (id, table_name, row_id, deleted_at)
  VALUES (lower(hex(randomblob(16))), 'transactions', OLD.id, datetime('now'));
END;
CREATE TRIGGER IF NOT EXISTS incremental_tombstone_investments
AFTER DELETE ON investments BEGIN
  INSERT OR REPLACE INTO incremental_tombstones (id, table_name, row_id, deleted_at)
  VALUES (lower(hex(randomblob(16))), 'investments', OLD.id, datetime('now'));
END;
CREATE TRIGGER IF NOT EXISTS incremental_tombstone_goals
AFTER DELETE ON goals BEGIN
  INSERT OR REPLACE INTO incremental_tombstones (id, table_name, row_id, deleted_at)
  VALUES (lower(hex(randomblob(16))), 'goals', OLD.id, datetime('now'));
END;
