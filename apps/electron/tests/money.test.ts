import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { fromCents, parseDecimalCents, roundMoney, splitCents, toCents } from '../src/shared/money';

describe('money primitives', () => {
  test('converte e arredonda simetricamente nas bordas binárias conhecidas', () => {
    assert.equal(toCents(1.005), 101);
    assert.equal(toCents(-1.005), -101);
    assert.equal(roundMoney(10.075), 10.08);
    assert.equal(fromCents(123), 1.23);
  });

  test('parser decimal não aceita perda silenciosa de precisão', () => {
    assert.equal(parseDecimalCents('10'), 1000);
    assert.equal(parseDecimalCents('-10.5'), -1050);
    assert.equal(parseDecimalCents('0.01'), 1);
    assert.throws(() => parseDecimalCents('1.005'), /money-format-invalid/);
    assert.throws(() => parseDecimalCents('1e3'), /money-format-invalid/);
  });

  test('divide o total exatamente e distribui o resto deterministicamente', () => {
    const parts = splitCents(toCents(10), 3);
    assert.deepEqual(parts, [334, 333, 333]);
    assert.equal(parts.reduce((sum, value) => sum + value, 0), 1000);
    assert.deepEqual(splitCents(toCents(-0.05), 2), [-3, -2]);
  });

  test('rejeita valores inválidos e fora do intervalo seguro', () => {
    assert.throws(() => toCents(Number.NaN), /money-not-finite/);
    assert.throws(() => toCents(Number.POSITIVE_INFINITY), /money-not-finite/);
    assert.throws(() => fromCents(1.5), /cents-invalid/);
    assert.throws(() => splitCents(toCents(1), 0), /money-parts-invalid/);
  });
});
