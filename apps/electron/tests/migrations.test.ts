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
    assert.ok(columns.some(column => column.name === 'updated_at'));
    const familyColumns = db.prepare('PRAGMA table_info(family_members)').all() as { name: string }[];
    assert.ok(familyColumns.some(column => column.name === 'updated_at'));
    const accountColumns = db.prepare('PRAGMA table_info(accounts)').all() as { name: string }[];
    assert.ok(accountColumns.some(column => column.name === 'opening_balance_brl'));
    assert.ok(accountColumns.some(column => column.name === 'remote_balance'));
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='incremental_tombstones'").get());
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='incremental_tombstone_financial_documents'").get());

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

    db.prepare("INSERT INTO accounts (id, name, type) VALUES ('tombstone-test', 'Tombstone', 'checking')").run();
    db.prepare("DELETE FROM accounts WHERE id = 'tombstone-test'").run();
    const tombstone = db.prepare("SELECT table_name, row_id FROM incremental_tombstones WHERE table_name = 'accounts' AND row_id = 'tombstone-test'").get() as { table_name: string; row_id: string };
    assert.equal(tombstone.table_name, 'accounts');
    assert.equal(tombstone.row_id, 'tombstone-test');
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

test('separa o saldo inicial dos movimentos do livro-caixa', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  const migrationsDir = join(process.cwd(), 'src/main/migrations');
  const files = readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql') && file !== '043_account_balance_bases.sql')
    .sort();

  try {
    for (const file of files) db.exec(readFileSync(join(migrationsDir, file), 'utf8'));
    db.prepare('INSERT INTO accounts (id, name, type, balance) VALUES (?,?,?,?)').run('ledger-account', 'Ledger', 'checking', 900);
    db.prepare(`
      INSERT INTO transactions (id, account_id, category_id, description, amount, type, date, status)
      VALUES (?,?,?,?,?,?,?,'confirmed')
    `).run('ledger-tx', 'ledger-account', 'cat-3', 'Compra', 100, 'expense', '2026-01-01');
    db.prepare('INSERT INTO transaction_payments (id, transaction_id, account_id, amount) VALUES (?,?,?,?)')
      .run('ledger-payment', 'ledger-tx', 'ledger-account', 100);

    db.exec(readFileSync(join(migrationsDir, '043_account_balance_bases.sql'), 'utf8'));
    const account = db.prepare('SELECT opening_balance_brl FROM accounts WHERE id = ?').get('ledger-account') as { opening_balance_brl: number };
    assert.equal(account.opening_balance_brl, 1000);
  } finally {
    db.close();
  }
});
