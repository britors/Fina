import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeMoneyWireTables, normalizeMoneyWireTables, resolveMoneyWireFormat,
} from '../src/main/moneyWireFormat';

describe('incremental patch money format', () => {
  test('patch legado sem metadado continua decimal', () => {
    assert.equal(resolveMoneyWireFormat(undefined), 'decimal-v1');
    assert.deepEqual(
      normalizeMoneyWireTables({ transactions: [{ id: 'tx-1', amount: 10.01 }] }, 'decimal-v1'),
      { transactions: [{ id: 'tx-1', amount: 10.01 }] },
    );
  });

  test('patch em centavos é convertido uma única vez na fronteira', () => {
    const wire = encodeMoneyWireTables({
      transactions: [{ id: 'tx-1', amount: 10.01 }],
      accounts: [{ id: 'acc-1', balance: -2.5, credit_limit: null }],
    }, 'cents-v1');
    assert.deepEqual(wire, {
      transactions: [{ id: 'tx-1', amount_cents: 1001 }],
      accounts: [{ id: 'acc-1', balance_cents: -250, credit_limit_cents: null }],
    });
    assert.deepEqual(normalizeMoneyWireTables(wire, 'cents-v1'), {
      transactions: [{ id: 'tx-1', amount: 10.01 }],
      accounts: [{ id: 'acc-1', balance: -2.5, credit_limit: null }],
    });
  });

  test('recusa unidade ambígua, inteiro inseguro e formato desconhecido', () => {
    assert.throws(
      () => normalizeMoneyWireTables({ transactions: [{ id: 'tx', amount: 1, amount_cents: 100 }] }, 'cents-v1'),
      /money-wire-units-ambiguous/,
    );
    assert.throws(
      () => normalizeMoneyWireTables({ transactions: [{ id: 'tx', amount_cents: Number.MAX_SAFE_INTEGER + 1 }] }, 'cents-v1'),
      /money-wire-cents-invalid/,
    );
    assert.throws(() => resolveMoneyWireFormat('reais-v2'), /money-wire-format-unsupported/);
  });

  test('recusa perda de precisão ao produzir o formato em centavos', () => {
    assert.throws(
      () => encodeMoneyWireTables({ transactions: [{ id: 'tx', amount: 1.005 }] }, 'cents-v1'),
      /money-precision-unsupported/,
    );
  });
});
