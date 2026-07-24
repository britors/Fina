import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterTransactionsByDateRange,
  calculateMonthlySummary,
  calculateBudgetPercentage,
  getDaysUntilDue,
  formatDate,
} from '../src/shared/utils';
import type { Transaction } from '../src/shared/types';

const base: Transaction = {
  id: '', account_id: 'acc-1', to_account_id: null, category_id: 'cat-1',
  description: 'Test', amount: 100, type: 'expense',
  date: '', status: 'confirmed', notes: null, recurring: 0, owner: null,
  created_at: '', updated_at: '',
};

const TXS: Transaction[] = [
  { ...base, id: '1', type: 'income',  amount: 5000,   date: '2026-05-01' },
  { ...base, id: '2', type: 'expense', amount: 1500,   date: '2026-05-10' },
  { ...base, id: '3', type: 'expense', amount: 320.50, date: '2026-05-20' },
  { ...base, id: '4', type: 'income',  amount: 1200,   date: '2026-04-15' },
  { ...base, id: '5', type: 'expense', amount: 250,    date: '2026-04-28' },
];

describe('filterTransactionsByDateRange', () => {
  test('retorna apenas transações dentro do intervalo', () => {
    const result = filterTransactionsByDateRange(TXS, new Date('2026-05-01'), new Date('2026-05-31'));
    assert.equal(result.length, 3);
  });

  test('exclui transações fora do intervalo', () => {
    const result = filterTransactionsByDateRange(TXS, new Date('2026-05-01'), new Date('2026-05-31'));
    const ids = result.map(t => t.id);
    assert.ok(!ids.includes('4'));
    assert.ok(!ids.includes('5'));
  });

  test('inclui transações na data de início', () => {
    const result = filterTransactionsByDateRange(TXS, new Date('2026-05-01'), new Date('2026-05-01'));
    assert.equal(result.length, 1);
    assert.equal(result[0].id, '1');
  });

  test('retorna vazio para intervalo sem transações', () => {
    const result = filterTransactionsByDateRange(TXS, new Date('2025-01-01'), new Date('2025-01-31'));
    assert.equal(result.length, 0);
  });
});

describe('calculateMonthlySummary', () => {
  test('calcula receitas e despesas de maio corretamente', () => {
    const maio = TXS.filter(t => t.date.startsWith('2026-05'));
    const summary = calculateMonthlySummary(maio);
    assert.equal(summary.income, 5000);
    assert.ok(Math.abs(summary.expense - 1820.50) < 0.01, `expense=${summary.expense}`);
  });

  test('calcula saldo como income - expense', () => {
    const maio = TXS.filter(t => t.date.startsWith('2026-05'));
    const summary = calculateMonthlySummary(maio);
    assert.ok(Math.abs(summary.balance - 3179.50) < 0.01);
  });

  test('retorna zeros para lista vazia', () => {
    const summary = calculateMonthlySummary([]);
    assert.equal(summary.income,  0);
    assert.equal(summary.expense, 0);
    assert.equal(summary.balance, 0);
  });

  test('ignora transações do tipo transfer no saldo', () => {
    const txs: Transaction[] = [
      { ...base, type: 'transfer', amount: 500, date: '2026-05-01' },
      { ...base, type: 'income',   amount: 200, date: '2026-05-01' },
    ];
    const summary = calculateMonthlySummary(txs);
    assert.equal(summary.income, 200);
    assert.equal(summary.expense, 0);
  });
});

describe('calculateBudgetPercentage', () => {
  test('calcula porcentagem corretamente', () => {
    assert.equal(calculateBudgetPercentage(750, 1000), 75);
  });

  test('limita a 100% quando excede', () => {
    assert.equal(calculateBudgetPercentage(1500, 1000), 100);
  });

  test('retorna 0 para limite zero', () => {
    assert.equal(calculateBudgetPercentage(100, 0), 0);
  });

  test('retorna 0% para nenhum gasto', () => {
    assert.equal(calculateBudgetPercentage(0, 1000), 0);
  });

  test('retorna 50% para metade do limite', () => {
    assert.equal(calculateBudgetPercentage(500, 1000), 50);
  });
});

describe('formatDate', () => {
  test('converte YYYY-MM-DD para DD/MM/YYYY', () => {
    assert.equal(formatDate('2026-05-28'), '28/05/2026');
  });

  test('retorna string vazia para entrada vazia', () => {
    assert.equal(formatDate(''), '');
  });
});
