import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseBelvoAccounts, parseBelvoTransactions } from '../src/shared/utils';

describe('parseBelvoAccounts', () => {
  test('extrai contas de uma resposta paginada ({results: [...]})', () => {
    const payload = {
      results: [
        {
          id: 'acc-1',
          name: 'Conta Corrente',
          category: 'CHECKING_ACCOUNT',
          institution: { name: 'Banco Teste' },
          balance: { current: 1200.5, available: 1100 },
        },
        {
          id: 'acc-2',
          category: 'CREDIT_CARD',
          institution: { name: 'Banco Teste' },
          balance: { current: 300 },
          credit_data: { credit_limit: 5000 },
        },
      ],
    };

    const accounts = parseBelvoAccounts(payload);
    assert.equal(accounts.length, 2);
    assert.deepEqual(accounts[0], {
      id: 'acc-1', name: 'Conta Corrente', type: 'checking', bankName: 'Banco Teste', balance: 1200.5, creditLimit: null,
    });
    assert.equal(accounts[1].type, 'credit_card');
    assert.equal(accounts[1].creditLimit, 5000);
  });

  test('aceita um array simples (sem envelope de paginação)', () => {
    const accounts = parseBelvoAccounts([{ id: 'acc-3', category: 'SAVINGS_ACCOUNT', balance: { current: 50 } }]);
    assert.equal(accounts.length, 1);
    assert.equal(accounts[0].type, 'savings');
  });

  test('ignora contas sem id', () => {
    assert.deepEqual(parseBelvoAccounts({ results: [{ balance: { current: 10 } }] }), []);
  });

  test('retorna lista vazia para payload inesperado', () => {
    assert.deepEqual(parseBelvoAccounts(null), []);
    assert.deepEqual(parseBelvoAccounts({ message: 'erro' }), []);
  });
});

describe('parseBelvoTransactions', () => {
  test('mapeia INFLOW/OUTFLOW para income/expense', () => {
    const payload = {
      results: [
        { id: 'tx-1', amount: 500, type: 'INFLOW', value_date: '2026-07-01', description: 'Salário' },
        { id: 'tx-2', amount: 120.3, type: 'OUTFLOW', value_date: '2026-07-02', description: 'Mercado' },
      ],
    };
    const transactions = parseBelvoTransactions(payload, 'acc-1');
    assert.equal(transactions.length, 2);
    assert.deepEqual(transactions[0], { id: 'tx-1', accountId: 'acc-1', description: 'Salário', amount: 500, type: 'income', date: '2026-07-01' });
    assert.equal(transactions[1].type, 'expense');
  });

  test('usa o sinal do valor quando o tipo não é INFLOW/OUTFLOW', () => {
    const transactions = parseBelvoTransactions({ results: [{ id: 'tx-1', amount: -42, value_date: '2026-07-01' }] }, 'acc-1');
    assert.equal(transactions[0].type, 'expense');
    assert.equal(transactions[0].amount, 42);
  });

  test('usa o nome do merchant quando não há description', () => {
    const transactions = parseBelvoTransactions({ results: [{ id: 'tx-1', amount: 10, merchant: { name: 'Padaria' } }] }, 'acc-1');
    assert.equal(transactions[0].description, 'Padaria');
  });

  test('ignora transações sem id ou com valor zero', () => {
    const transactions = parseBelvoTransactions({ results: [{ amount: 10 }, { id: 'tx-1', amount: 0 }] }, 'acc-1');
    assert.deepEqual(transactions, []);
  });
});
