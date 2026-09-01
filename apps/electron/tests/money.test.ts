import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fromCents, MAX_SAFE_CENTS, parseDecimalCents, reconcileMoneyParts, roundMoney,
  splitCents, toCents, toExactCents,
} from '../src/shared/money';

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

  test('preserva o limite seguro sem tolerância crescente', () => {
    assert.equal(parseDecimalCents('90071992547409.91'), MAX_SAFE_CENTS);
    assert.equal(parseDecimalCents('-90071992547409.91'), -MAX_SAFE_CENTS);
    assert.equal(toCents(10_000_000_000_000.01), 1_000_000_000_000_001);
    assert.throws(() => parseDecimalCents('90071992547409.92'), /money-out-of-range/);
    assert.throws(() => toCents(90_071_992_547_410), /money-out-of-range/);
  });

  test('reconcilia rateios apenas depois de converter cada parte para centavos', () => {
    assert.deepEqual(reconcileMoneyParts(0.3, [0.1, 0.2]), [0.1, 0.2]);
    assert.deepEqual(reconcileMoneyParts(10, [3.34, 3.33, 3.33]), [3.34, 3.33, 3.33]);
    assert.throws(() => reconcileMoneyParts(10, [3.333, 3.333, 3.334]), /money-precision-unsupported/);
    assert.throws(() => reconcileMoneyParts(10, [3.33, 3.33, 3.33]), /money-total-mismatch/);
    assert.throws(() => toExactCents(1.005), /money-precision-unsupported/);
  });
});
