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

test('converte o saldo antigo dos vales para o valor disponível', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  const migrationsDir = join(process.cwd(), 'src/main/migrations');
  const files = readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql') && file !== '040_voucher_available_balance.sql')
    .sort();

  try {
    for (const file of files) db.exec(readFileSync(join(migrationsDir, file), 'utf8'));
    db.prepare(`
      INSERT INTO accounts (id, name, type, balance, credit_limit)
      VALUES (?, ?, ?, ?, ?)
    `).run('voucher-test', 'Vale', 'meal_voucher', 120, 500);

    db.exec(readFileSync(join(migrationsDir, '040_voucher_available_balance.sql'), 'utf8'));
    const account = db.prepare('SELECT balance, credit_limit FROM accounts WHERE id = ?').get('voucher-test') as { balance: number; credit_limit: number | null };
    assert.equal(account.balance, 380);
    assert.equal(account.credit_limit, 500);
  } finally {
    db.close();
  }
});
