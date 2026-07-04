import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateTotalBalance,
  calculateAvailableCredit,
  formatCurrency,
  accountTypeLabel,
} from '../src/shared/utils';
import type { Account } from '../src/shared/types';

const make = (overrides: Partial<Account> = {}): Account => ({
  id: 'x', name: 'Test', type: 'checking', bank_name: null,
  balance: 0, credit_limit: null, color: null,
  currency: 'BRL', original_balance: null,
  created_at: '', updated_at: '', ...overrides,
});

const ACCOUNTS: Account[] = [
  make({ id: '1', balance: 3500.00 }),
  make({ id: '2', balance: 12000.00, type: 'savings' }),
  make({ id: '3', balance: 500.00,   type: 'credit_card', credit_limit: 5000.00 }),
];

describe('calculateTotalBalance', () => {
  test('calcula patrimônio tratando cartão como dívida', () => {
    assert.equal(calculateTotalBalance(ACCOUNTS), 15000);
  });

  test('retorna 0 para lista vazia', () => {
    assert.equal(calculateTotalBalance([]), 0);
  });

  test('funciona com conta de saldo zero', () => {
    assert.equal(calculateTotalBalance([make({ balance: 0 })]), 0);
  });
});

describe('calculateAvailableCredit', () => {
  test('retorna limite disponível para cartão de crédito', () => {
    assert.equal(calculateAvailableCredit(ACCOUNTS[2]), 4500);
  });

  test('retorna 0 quando não há limite', () => {
    assert.equal(calculateAvailableCredit(ACCOUNTS[0]), 0);
  });

  test('retorna 0 para credit_limit null', () => {
    const acc = make({ type: 'credit_card', credit_limit: null });
    assert.equal(calculateAvailableCredit(acc), 0);
  });
});

describe('formatCurrency', () => {
  test('formata valor como BRL', () => {
    const result = formatCurrency(1500);
    assert.ok(result.includes('1') && result.includes('5'), `formato inesperado: ${result}`);
  });

  test('lida com zero', () => {
    const result = formatCurrency(0);
    assert.ok(result.length > 0);
  });

  test('normaliza zero negativo', () => {
    const result = formatCurrency(-0);
    assert.equal(result.includes('-'), false);
  });

  test('lida com valores decimais', () => {
    const result = formatCurrency(1234.56);
    assert.ok(result.includes('1') && result.includes('234'));
  });
});

describe('accountTypeLabel', () => {
  test('retorna rótulo correto para checking', () => {
    assert.equal(accountTypeLabel('checking'), 'Conta Corrente');
  });

  test('retorna rótulo correto para savings', () => {
    assert.equal(accountTypeLabel('savings'), 'Poupança');
  });

  test('retorna rótulo correto para credit_card', () => {
    assert.equal(accountTypeLabel('credit_card'), 'Cartão de Crédito');
  });

  test('retorna rótulo correto para vales', () => {
    assert.equal(accountTypeLabel('meal_voucher'), 'Vale Refeição');
    assert.equal(accountTypeLabel('food_voucher'), 'Vale Alimentação');
  });

  test('retorna o próprio valor para tipo desconhecido', () => {
    assert.equal(accountTypeLabel('unknown'), 'unknown');
  });
});
