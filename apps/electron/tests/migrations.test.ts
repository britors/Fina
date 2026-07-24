import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

test('executa toda a cadeia de migrações e cria a hierarquia de categorias', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  const migrationsDir = join(process.cwd(), 'src/main/migrations');
  const files = readdirSync(migrationsDir).filter(file => file.endsWith('.sql')).sort();

  try {
    for (const file of files) {
      db.exec(readFileSync(join(migrationsDir, file), 'utf8'));
    }

    assert.ok(files.includes('026_category_hierarchy.sql'));
    const columns = db.prepare('PRAGMA table_info(categories)').all() as { name: string }[];
    assert.ok(columns.some(column => column.name === 'parent_id'));

    const indexes = db.prepare("PRAGMA index_list('categories')").all() as { name: string }[];
    assert.ok(indexes.some(index => index.name === 'idx_categories_parent_id'));

    const existing = db.prepare('SELECT COUNT(*) AS total FROM categories WHERE parent_id IS NOT NULL').get() as { total: number };
    assert.equal(existing.total, 0);

    db.prepare(`
      INSERT INTO categories (id, name, icon, color, type, kind, parent_id)
      VALUES ('sub-test', 'Mercado', 'ti-basket', '#000000', 'expense', 'essential', 'cat-3')
    `).run();
    const child = db.prepare('SELECT parent_id FROM categories WHERE id = ?').get('sub-test') as { parent_id: string };
    assert.equal(child.parent_id, 'cat-3');
  } finally {
    db.close();
  }
});
