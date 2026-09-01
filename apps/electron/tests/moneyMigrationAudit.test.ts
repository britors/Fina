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
      for (const value of [10.01, -2.5, 0, 3]) insert.run(value);
      const result = assertMoneyMigrationReady(auditDb(db), TEST_COLUMNS);
      assert.equal(result.ok, true);
      assert.equal(result.columns[0].rows, 4);
      assert.equal(result.columns[0].centsTotal, 1051n);
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
});
