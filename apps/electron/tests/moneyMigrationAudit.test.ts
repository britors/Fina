import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  assertMoneyMigrationReady, auditMoneyMigration, MONEY_COLUMNS, type MoneyAuditDatabase,
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
