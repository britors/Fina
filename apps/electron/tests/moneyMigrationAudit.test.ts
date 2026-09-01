import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  assertMoneyMigrationReady, auditMoneyMigration, auditMoneyShadowConsistency, MONEY_COLUMNS, type MoneyAuditDatabase,
} from '../src/main/moneyMigrationAudit';

const TEST_COLUMNS = [{ table: 'payments', column: 'amount' }] as const;

function database(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE payments (amount);');
  return db;
}

function auditDb(db: DatabaseSync): MoneyAuditDatabase {
  return db as unknown as MoneyAuditDatabase;
}

function typescriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return typescriptFiles(path);
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
  });
}

describe('money migration preflight', () => {
  test('inventário não mistura percentuais, quantidades ou preço unitário', () => {
    const keys = MONEY_COLUMNS.map(item => `${item.table}.${item.column}`);
    assert.equal(new Set(keys).size, keys.length);
    assert.ok(keys.includes('accounts.balance'));
    assert.ok(keys.includes('investment_operations.fees'));
    assert.equal(keys.includes('debts.interest_rate'), false);
    assert.equal(keys.includes('investment_operations.quantity'), false);
    assert.equal(keys.includes('investment_operations.unit_price'), false);
  });

  test('processo principal não agrega diretamente colunas monetárias legadas', () => {
    const sourceRoot = join(process.cwd(), 'src/main');
    const legacyColumns = [...new Set(MONEY_COLUMNS.map(item => item.column))]
      .map(column => column.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    const legacyReference = new RegExp(`\\b(?:${legacyColumns})\\b`, 'i');
    const aggregate = /\b(?:SUM|AVG|MIN|MAX)\s*\(([^)]*)\)/g;
    const violations: string[] = [];

    for (const file of typescriptFiles(sourceRoot)) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(aggregate)) {
        if (legacyReference.test(match[1])) {
          violations.push(`${relative(sourceRoot, file)}: ${match[0].replace(/\s+/g, ' ')}`);
        }
      }
    }

    assert.deepEqual(violations, []);
  });

  test('reconcilia positivos, negativos, zero e inteiros em centavos', () => {
    const db = database();
    try {
      const insert = db.prepare('INSERT INTO payments(amount) VALUES (?)');
      for (const value of [10.01, -2.5, 0, 3, 0.1 + 0.2]) insert.run(value);
      const result = assertMoneyMigrationReady(auditDb(db), TEST_COLUMNS);
      assert.equal(result.ok, true);
      assert.equal(result.columns[0].rows, 5);
      assert.equal(result.columns[0].centsTotal, 1081n);
    } finally {
      db.close();
    }
  });

  test('diagnostica divergência entre legado e centavos sem alterar os dados', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE payments (amount, amount_cents);
      INSERT INTO payments VALUES (1.23, 123), (4.56, 455), (7.89, NULL);
    `);
    try {
      const before = db.prepare('SELECT amount, amount_cents FROM payments ORDER BY rowid').all();
      const result = auditMoneyShadowConsistency(auditDb(db), TEST_COLUMNS);
      assert.equal(result.ok, false);
      assert.equal(result.checkedColumns, 1);
      assert.equal(result.checkedRows, 3);
      assert.equal(result.divergentRows, 2);
      assert.deepEqual(result.violations.map(item => ({
        rowId: item.rowId, reason: item.reason, expectedCents: item.expectedCents,
      })), [
        { rowId: 2, reason: 'value-mismatch', expectedCents: 456 },
        { rowId: 3, reason: 'null-mismatch', expectedCents: null },
      ]);
      assert.deepEqual(db.prepare('SELECT amount, amount_cents FROM payments ORDER BY rowid').all(), before);
    } finally {
      db.close();
    }
  });

  test('enumera precisão excedente, overflow e tipo de storage inválido', () => {
    const db = database();
    try {
      const insert = db.prepare('INSERT INTO payments(amount) VALUES (?)');
      insert.run(1.005);
      insert.run(90_071_992_547_410);
      insert.run('12.34');

      const result = auditMoneyMigration(auditDb(db), TEST_COLUMNS);
      assert.equal(result.ok, false);
      assert.deepEqual(result.violations.map(item => item.reason), ['sub-cent', 'out-of-range', 'storage-type']);
      assert.throws(
        () => assertMoneyMigrationReady(auditDb(db), TEST_COLUMNS),
        /payments\.amount\[rowid=1\]:sub-cent/,
      );
      assert.equal(db.prepare('SELECT COUNT(*) AS total FROM payments').get()!.total, 3);
    } finally {
      db.close();
    }
  });

  test('bloqueia rateio histórico cuja soma não fecha em centavos', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE transactions (id TEXT PRIMARY KEY, amount REAL);
      CREATE TABLE transaction_payments (id TEXT PRIMARY KEY, transaction_id TEXT, amount REAL);
      INSERT INTO transactions VALUES ('tx', 10.00);
      INSERT INTO transaction_payments VALUES ('p1', 'tx', 3.33), ('p2', 'tx', 3.33), ('p3', 'tx', 3.33);
    `);
    const columns = [
      { table: 'transactions', column: 'amount' },
      { table: 'transaction_payments', column: 'amount' },
    ] as const;
    try {
      const result = auditMoneyMigration(auditDb(db), columns);
      assert.equal(result.ok, false);
      assert.deepEqual(result.allocationViolations, [{
        parentTable: 'transactions', childTable: 'transaction_payments', parentRowId: 1,
        expectedCents: 1000, actualCents: 999,
      }]);
      assert.throws(() => assertMoneyMigrationReady(auditDb(db), columns), /999\/1000/);
    } finally {
      db.close();
    }
  });
});
