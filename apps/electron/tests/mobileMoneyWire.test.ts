import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeMobileMoney } from '../src/main/mobileMoneyWire';

describe('mobile sync money protocol', () => {
  test('aceita decimal v1 e centavos v2 sem alterar o valor', () => {
    assert.equal(decodeMobileMoney({ amount: 10.01 }), 10.01);
    assert.equal(decodeMobileMoney({ amount_cents: 1001 }), 10.01);
    assert.equal(decodeMobileMoney({ amount_cents: -250 }), -2.5);
  });

  test('recusa unidade ausente, ambígua ou fora do contrato', () => {
    assert.throws(() => decodeMobileMoney({}), /mobile-money-unit-ambiguous/);
    assert.throws(() => decodeMobileMoney({ amount: 1, amount_cents: 100 }), /mobile-money-unit-ambiguous/);
    assert.throws(() => decodeMobileMoney({ amount: 1.005 }), /money-precision-unsupported/);
    assert.throws(() => decodeMobileMoney({ amount_cents: 1.5 }), /mobile-money-cents-invalid/);
    assert.throws(() => decodeMobileMoney({ amount_cents: Number.MAX_SAFE_INTEGER + 1 }), /mobile-money-cents-invalid/);
  });
});
