import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  categoryOrChildPredicate,
  CATEGORY_SPENT_MONTH_SQL,
  EXPENSES_BY_ROOT_MONTH_SQL,
  EXPENSES_BY_ROOT_RANGE_SQL,
  EXPENSE_SUBCATEGORY_BREAKDOWN_SQL,
  EXPENSE_CATEGORY_DETAILS_SQL,
  EXPENSE_MONTHLY_ROOT_SERIES_SQL,
  EXPENSE_MONTHLY_SUBCATEGORY_SERIES_SQL,
  buildExpenseAnalyticsWhere,
} from '../src/main/categoryHierarchyQueries';

let db: DatabaseSync;

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      parent_id TEXT REFERENCES categories(id)
    );
    CREATE TABLE transactions (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL REFERENCES categories(id),
      amount REAL NOT NULL,
      type TEXT NOT NULL,
      date TEXT NOT NULL,
      account_id TEXT NOT NULL DEFAULT 'account-a',
      owner TEXT,
      status TEXT NOT NULL DEFAULT 'confirmed'
    );
    CREATE TABLE transaction_payments (transaction_id TEXT NOT NULL, account_id TEXT NOT NULL);
    INSERT INTO categories VALUES
      ('food', 'Alimentação', '#f00', NULL),
      ('market', 'Mercado', '#f10', 'food'),
      ('restaurant', 'Restaurante', '#f20', 'food'),
      ('home', 'Moradia', '#00f', NULL);
    INSERT INTO transactions (id,category_id,amount,type,date) VALUES
      ('direct', 'food', 50, 'expense', '2026-07-01'),
      ('market-1', 'market', 200, 'expense', '2026-07-02'),
      ('restaurant-1', 'restaurant', 100, 'expense', '2026-07-03'),
      ('home-1', 'home', 500, 'expense', '2026-07-04'),
      ('income', 'food', 1000, 'income', '2026-07-05'),
      ('old', 'market', 75, 'expense', '2026-06-30');
    UPDATE transactions SET owner='Ana' WHERE id IN ('market-1','restaurant-1');
    UPDATE transactions SET status='pending' WHERE id='restaurant-1';
    INSERT INTO transaction_payments VALUES ('market-1','account-b');
  `);
});

afterEach(() => db.close());

describe('agregação hierárquica de despesas', () => {
  test('consolida pai, filhas e lançamento direto sem duplicar', () => {
    const rows = db.prepare(EXPENSES_BY_ROOT_MONTH_SQL).all(7, 2026) as { id: string; total: number }[];
    assert.deepEqual(rows.map(row => [row.id, row.total]), [['home', 500], ['food', 350]]);
    assert.equal(rows.reduce((sum, row) => sum + row.total, 0), 850);
  });

  test('respeita intervalo de datas', () => {
    const rows = db.prepare(EXPENSES_BY_ROOT_RANGE_SQL).all('2026-07-01', '2026-07-03') as { id: string; total: number }[];
    assert.deepEqual(rows.map(row => [row.id, row.total]), [['food', 350]]);
  });

  test('detalha filhas e lançamentos sem subcategoria reconciliando com o pai', () => {
    const rows = db.prepare(EXPENSE_SUBCATEGORY_BREAKDOWN_SQL)
      .all('food', 'food', 'food', 'food', '2026-07-01', '2026-07-31') as { id: string | null; name: string; total: number }[];
    assert.deepEqual(rows.map(row => [row.id, row.name, row.total]), [
      ['market', 'Mercado', 200],
      ['restaurant', 'Restaurante', 100],
      [null, 'Sem subcategoria', 50],
    ]);
    assert.equal(rows.reduce((sum, row) => sum + row.total, 0), 350);
  });

  test('calcula métricas analíticas consolidadas por pai', () => {
    const rows = db.prepare(EXPENSE_CATEGORY_DETAILS_SQL).all('2026-07-01', '2026-07-31') as {
      id: string; total: number; transaction_count: number; average_amount: number; largest_amount: number;
    }[];
    const food = rows.find(row => row.id === 'food')!;
    assert.equal(food.total, 350);
    assert.equal(food.transaction_count, 3);
    assert.ok(Math.abs(food.average_amount - 350 / 3) < 0.001);
    assert.equal(food.largest_amount, 200);
  });

  test('gera série mensal consolidada e detalhada', () => {
    const roots = db.prepare(EXPENSE_MONTHLY_ROOT_SERIES_SQL).all('2026-06-01', '2026-07-31') as { month: string; id: string; total: number }[];
    assert.deepEqual(roots.filter(row => row.id === 'food').map(row => [row.month, row.total]), [
      ['2026-06', 75],
      ['2026-07', 350],
    ]);

    const details = db.prepare(EXPENSE_MONTHLY_SUBCATEGORY_SERIES_SQL)
      .all('food', 'food', 'food', 'food', '2026-07-01', '2026-07-31') as { month: string; id: string | null; total: number }[];
    assert.equal(details.reduce((sum, row) => sum + row.total, 0), 350);
    assert.ok(details.some(row => row.id === null && row.total === 50));
  });
});

describe('filtro por categoria', () => {
  test('pai inclui lançamentos diretos e das filhas', () => {
    const rows = db.prepare(`
      SELECT id FROM transactions t
      WHERE ${categoryOrChildPredicate('t.category_id')} AND type = 'expense'
      ORDER BY id
    `).all('food', 'food') as { id: string }[];
    assert.deepEqual(rows.map(row => row.id), ['direct', 'market-1', 'old', 'restaurant-1']);
  });

  test('filha não inclui pai nem irmã', () => {
    const rows = db.prepare(`
      SELECT id FROM transactions t
      WHERE ${categoryOrChildPredicate('t.category_id')} AND type = 'expense'
      ORDER BY id
    `).all('market', 'market') as { id: string }[];
    assert.deepEqual(rows.map(row => row.id), ['market-1', 'old']);
  });
});

describe('gasto de orçamento', () => {
  test('orçamento do pai soma lançamentos diretos e filhas no mês', () => {
    const row = db.prepare(CATEGORY_SPENT_MONTH_SQL).get('food', 'food', 7, 2026) as { spent: number };
    assert.equal(row.spent, 350);
  });

  test('orçamento da filha considera somente a filha', () => {
    const row = db.prepare(CATEGORY_SPENT_MONTH_SQL).get('market', 'market', 7, 2026) as { spent: number };
    assert.equal(row.spent, 200);
  });
});

describe('filtros analíticos combinados', () => {
  test('filtra por rateio, responsável, status e pai sem duplicar', () => {
    const where = buildExpenseAnalyticsWhere({
      dateFrom: '2026-07-01', dateTo: '2026-07-31',
      rootCategoryId: 'food', account_id: 'account-b', owner: 'Ana', status: 'confirmed',
    });
    const row = db.prepare(`SELECT COUNT(*) AS count, SUM(t.amount) AS total FROM transactions t WHERE ${where.sql}`)
      .get(...where.params) as { count: number; total: number };
    assert.equal(row.count, 1);
    assert.equal(row.total, 200);
  });

  test('subcategoria prevalece sobre o filtro do pai', () => {
    const where = buildExpenseAnalyticsWhere({
      dateFrom: '2026-06-01', dateTo: '2026-07-31',
      rootCategoryId: 'food', subcategoryId: 'market',
    });
    const row = db.prepare(`SELECT COUNT(*) AS count, SUM(t.amount) AS total FROM transactions t WHERE ${where.sql}`)
      .get(...where.params) as { count: number; total: number };
    assert.equal(row.count, 2);
    assert.equal(row.total, 275);
  });
});
