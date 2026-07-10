import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mapOpenFinanceAccountType, parseKlaviReport } from '../src/shared/utils';

describe('mapOpenFinanceAccountType', () => {
  test('reconhece cartão de crédito em inglês', () => {
    assert.equal(mapOpenFinanceAccountType('CREDIT_CARD', 'FLEX'), 'credit_card');
  });

  test('reconhece cartão de crédito em português (padrão Open Finance Brasil)', () => {
    assert.equal(mapOpenFinanceAccountType('CARTAO_CREDITO', 'VISA'), 'credit_card');
  });

  test('reconhece poupança em português', () => {
    assert.equal(mapOpenFinanceAccountType('CONTA_POUPANCA'), 'savings');
  });

  test('reconhece carteira digital', () => {
    assert.equal(mapOpenFinanceAccountType('CARTEIRA_DIGITAL'), 'wallet');
  });

  test('cai em conta corrente por padrão', () => {
    assert.equal(mapOpenFinanceAccountType('CONTA_DEPOSITO_A_VISTA'), 'checking');
  });
});

describe('parseKlaviReport', () => {
  test('extrai contas e transações de um relatório com "accounts" na raiz', () => {
    const report = {
      accounts: [
        {
          accountid: 'acc-1',
          name: 'Conta Corrente',
          type: 'CONTA_DEPOSITO_A_VISTA',
          brandname: 'Banco Teste',
          balance: 1500.5,
          transactions: [
            { transactionid: 'tx-1', amount: 200, creditdebittype: 'CREDITO', transactiondate: '2026-07-01', transactionname: 'Salário' },
            { transactionid: 'tx-2', amount: 50.25, creditdebittype: 'DEBITO', transactiondate: '2026-07-02', transactionname: 'Mercado' },
          ],
        },
      ],
    };

    const { accounts, transactions } = parseKlaviReport(report);
    assert.equal(accounts.length, 1);
    assert.deepEqual(accounts[0], {
      id: 'acc-1',
      name: 'Conta Corrente',
      type: 'checking',
      bankName: 'Banco Teste',
      balance: 1500.5,
      creditLimit: null,
    });

    assert.equal(transactions.length, 2);
    assert.deepEqual(transactions[0], {
      id: 'tx-1', accountId: 'acc-1', description: 'Salário', amount: 200, type: 'income', date: '2026-07-01',
    });
    assert.deepEqual(transactions[1], {
      id: 'tx-2', accountId: 'acc-1', description: 'Mercado', amount: 50.25, type: 'expense', date: '2026-07-02',
    });
  });

  test('extrai contas aninhadas por produto (ex.: "pf checking account": {accounts: [...]})', () => {
    const report = {
      'pf checking account': {
        accounts: [{ id: 'acc-2', type: 'checking', balance: { amount: 300 } }],
      },
      'pf credit card': {
        accounts: [{ id: 'acc-3', type: 'CARTAO_CREDITO', balance: 0, creditlimit: 5000 }],
      },
    };

    const { accounts } = parseKlaviReport(report);
    assert.equal(accounts.length, 2);
    const byId = Object.fromEntries(accounts.map(a => [a.id, a]));
    assert.equal(byId['acc-2'].balance, 300);
    assert.equal(byId['acc-3'].type, 'credit_card');
    assert.equal(byId['acc-3'].creditLimit, 5000);
  });

  test('deduplica contas repetidas entre grupos', () => {
    const report = {
      accounts: [{ id: 'dup', balance: 10 }],
      data: { accounts: [{ id: 'dup', balance: 999 }] },
    };
    const { accounts } = parseKlaviReport(report);
    assert.equal(accounts.length, 1);
    assert.equal(accounts[0].balance, 10);
  });

  test('ignora nós de conta sem identificador', () => {
    const report = { accounts: [{ balance: 100 }] };
    assert.deepEqual(parseKlaviReport(report).accounts, []);
  });

  test('ignora transações com valor zero ou ausente', () => {
    const report = {
      accounts: [{
        id: 'acc-4',
        balance: 0,
        movements: [
          { id: 'tx-0', amount: 0, date: '2026-07-01' },
          { id: 'tx-1', amount: 10, date: '2026-07-01' },
        ],
      }],
    };
    const { transactions } = parseKlaviReport(report);
    assert.equal(transactions.length, 1);
    assert.equal(transactions[0].id, 'tx-1');
  });

  test('usa o sinal do valor quando não há indicador de crédito/débito', () => {
    const report = {
      accounts: [{
        id: 'acc-5',
        balance: 0,
        lancamentos: [{ id: 'tx-1', amount: -75, date: '2026-07-01' }],
      }],
    };
    const { transactions } = parseKlaviReport(report);
    assert.equal(transactions[0].type, 'expense');
    assert.equal(transactions[0].amount, 75);
  });

  test('retorna listas vazias para payload sem contas', () => {
    assert.deepEqual(parseKlaviReport({ message: 'ok' }), { accounts: [], transactions: [] });
    assert.deepEqual(parseKlaviReport(null), { accounts: [], transactions: [] });
  });
});
