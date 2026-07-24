ALTER TABLE categories ADD COLUMN parent_id TEXT REFERENCES categories(id);

CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);
