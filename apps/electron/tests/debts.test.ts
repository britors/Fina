import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { simulateDebtPayoff, projectCompoundGrowth } from '../src/shared/utils';

describe('simulateDebtPayoff', () => {
  test('sem juros, quita em parcelas iguais e sem juros pagos', () => {
    const result = simulateDebtPayoff(1200, 0, 100);
    assert.equal(result.monthsToPay, 12);
    assert.equal(result.totalPaid, 1200);
    assert.equal(result.totalInterest, 0);
  });

  test('com juros, quita em um mês quando o pagamento cobre saldo + juros', () => {
    const result = simulateDebtPayoff(100, 10, 110);
    assert.equal(result.monthsToPay, 1);
    assert.equal(result.totalPaid, 110);
    assert.equal(result.totalInterest, 10);
  });

  test('saldo zero não gera meses nem pagamentos', () => {
    const result = simulateDebtPayoff(0, 5, 100);
    assert.equal(result.monthsToPay, 0);
    assert.equal(result.totalPaid, 0);
    assert.equal(result.totalInterest, 0);
  });

  test('pagamento menor que os juros nunca quita a dívida (trava em 600 meses)', () => {
    const result = simulateDebtPayoff(1000, 5, 10);
    assert.equal(result.monthsToPay, 600);
    assert.equal(result.totalPaid, 6000);
    assert.equal(result.totalInterest, 5000);
  });

  test('totalInterest é sempre totalPaid - balance', () => {
    const result = simulateDebtPayoff(5000, 2, 300);
    assert.equal(result.totalInterest, result.totalPaid - 5000);
  });
});

describe('projectCompoundGrowth', () => {
  test('retorna months + 1 valores, começando pelo valor inicial', () => {
    const values = projectCompoundGrowth(1000, 100, 0, 6);
    assert.equal(values.length, 7);
    assert.equal(values[0], 1000);
  });

  test('com taxa 0%, cresce linearmente pelo aporte mensal', () => {
    const values = projectCompoundGrowth(1000, 100, 0, 3);
    assert.deepEqual(values, [1000, 1100, 1200, 1300]);
  });

  test('months=0 retorna só o valor inicial', () => {
    assert.deepEqual(projectCompoundGrowth(500, 100, 12, 0), [500]);
  });

  test('com taxa > 0%, após 12 meses rende a própria taxa anual informada', () => {
    const withRate = projectCompoundGrowth(1000, 0, 12, 12);
    assert.ok(withRate[12] > 1000);
    assert.ok(Math.abs(withRate[12] - 1120) < 1e-6); // (1+taxa mensal)^12 == 1 + taxa anual
  });

  test('sem aporte e sem saldo inicial, permanece em zero', () => {
    assert.deepEqual(projectCompoundGrowth(0, 0, 10, 5), [0, 0, 0, 0, 0, 0]);
  });
});
