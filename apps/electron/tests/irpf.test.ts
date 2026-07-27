import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeCapitalGains, CAPITAL_GAINS_EXEMPTION_ACOES, CAPITAL_GAINS_EXEMPTION_CRIPTO, CAPITAL_GAINS_RATE } from '../src/shared/utils';
import type { CapitalGainsOperation } from '../src/shared/utils';

describe('computeCapitalGains', () => {
  test('venda abaixo do limite de isenção (ações): isenta, sem DARF sugerido', () => {
    const ops: CapitalGainsOperation[] = [
      { investment_id: 'inv1', investment_type: 'renda_variavel', type: 'compra', quantity: 100, unit_price: 10, fees: 0, date: '2026-01-05' },
      { investment_id: 'inv1', investment_type: 'renda_variavel', type: 'venda', quantity: 50, unit_price: 12, fees: 0, date: '2026-02-10' },
    ];
    const report = computeCapitalGains(ops, 2026);
    assert.equal(report.months.length, 1);
    const [month] = report.months;
    assert.equal(month.month, '2026-02');
    assert.equal(month.total_sold, 600);
    assert.equal(month.cost_basis, 500);
    assert.equal(month.gain, 100);
    assert.equal(month.exempt, true);
    assert.equal(month.exemption_limit, CAPITAL_GAINS_EXEMPTION_ACOES);
    assert.equal(month.suggested_darf, 0);
    assert.equal(report.total_gain, 100);
    assert.equal(report.total_suggested_darf, 0);
  });

  test('venda acima do limite de isenção (ações): tributa 15% sobre o ganho', () => {
    const ops: CapitalGainsOperation[] = [
      { investment_id: 'inv1', investment_type: 'renda_variavel', type: 'compra', quantity: 3000, unit_price: 10, fees: 0, date: '2026-01-05' },
      { investment_id: 'inv1', investment_type: 'renda_variavel', type: 'venda', quantity: 3000, unit_price: 15, fees: 0, date: '2026-03-10' },
    ];
    const report = computeCapitalGains(ops, 2026);
    const [month] = report.months;
    assert.equal(month.total_sold, 45000);
    assert.equal(month.gain, 15000);
    assert.equal(month.exempt, false);
    assert.equal(month.suggested_darf, 15000 * CAPITAL_GAINS_RATE);
  });

  test('cripto tem limite de isenção próprio (35.000), maior que o de ações', () => {
    const ops: CapitalGainsOperation[] = [
      { investment_id: 'inv1', investment_type: 'cripto', type: 'compra', quantity: 10, unit_price: 1000, fees: 0, date: '2026-01-05' },
      { investment_id: 'inv1', investment_type: 'cripto', type: 'venda', quantity: 10, unit_price: 3000, fees: 0, date: '2026-04-10' },
    ];
    const report = computeCapitalGains(ops, 2026);
    const [month] = report.months;
    assert.equal(month.total_sold, 30000);
    assert.equal(month.exempt, true); // 30.000 < 35.000, mesmo estando acima do limite de ações
    assert.equal(month.exemption_limit, CAPITAL_GAINS_EXEMPTION_CRIPTO);
    assert.equal(month.suggested_darf, 0);
  });

  test('prejuízo não gera DARF sugerido mesmo fora da isenção', () => {
    const ops: CapitalGainsOperation[] = [
      { investment_id: 'inv1', investment_type: 'renda_variavel', type: 'compra', quantity: 3000, unit_price: 20, fees: 0, date: '2026-01-05' },
      { investment_id: 'inv1', investment_type: 'renda_variavel', type: 'venda', quantity: 3000, unit_price: 10, fees: 0, date: '2026-03-10' },
    ];
    const report = computeCapitalGains(ops, 2026);
    const [month] = report.months;
    assert.equal(month.exempt, false);
    assert.equal(month.gain, -30000);
    assert.equal(month.suggested_darf, 0);
    assert.equal(report.total_gain, -30000);
  });

  test('taxas (fees) somam ao custo na compra e reduzem o produto da venda', () => {
    const ops: CapitalGainsOperation[] = [
      { investment_id: 'inv1', investment_type: 'renda_variavel', type: 'compra', quantity: 10, unit_price: 100, fees: 5, date: '2026-01-05' },
      { investment_id: 'inv1', investment_type: 'renda_variavel', type: 'venda', quantity: 10, unit_price: 150, fees: 5, date: '2026-02-10' },
    ];
    const report = computeCapitalGains(ops, 2026);
    const [month] = report.months;
    assert.equal(month.cost_basis, 1005);
    assert.equal(month.total_sold, 1495);
    assert.equal(month.gain, 490);
  });

  test('custo médio ponderado carrega corretamente entre anos, mas só soma no ano da venda', () => {
    const ops: CapitalGainsOperation[] = [
      { investment_id: 'inv1', investment_type: 'renda_variavel', type: 'compra', quantity: 100, unit_price: 10, fees: 0, date: '2025-01-01' },
      { investment_id: 'inv1', investment_type: 'renda_variavel', type: 'venda', quantity: 50, unit_price: 20, fees: 0, date: '2025-06-01' },
      { investment_id: 'inv1', investment_type: 'renda_variavel', type: 'venda', quantity: 50, unit_price: 30, fees: 0, date: '2026-01-01' },
    ];
    const report2026 = computeCapitalGains(ops, 2026);
    assert.equal(report2026.months.length, 1);
    const [month] = report2026.months;
    assert.equal(month.month, '2026-01');
    assert.equal(month.total_sold, 1500);
    assert.equal(month.cost_basis, 500); // custo médio de 10 herdado da compra em 2025
    assert.equal(month.gain, 1000);

    const report2025 = computeCapitalGains(ops, 2025);
    assert.equal(report2025.months.length, 1);
    assert.equal(report2025.months[0].month, '2025-06');
  });

  test('investimentos diferentes não misturam custo médio', () => {
    const ops: CapitalGainsOperation[] = [
      { investment_id: 'inv1', investment_type: 'renda_variavel', type: 'compra', quantity: 100, unit_price: 10, fees: 0, date: '2026-01-01' },
      { investment_id: 'inv2', investment_type: 'renda_variavel', type: 'compra', quantity: 100, unit_price: 50, fees: 0, date: '2026-01-01' },
      { investment_id: 'inv1', investment_type: 'renda_variavel', type: 'venda', quantity: 100, unit_price: 15, fees: 0, date: '2026-02-01' },
      { investment_id: 'inv2', investment_type: 'renda_variavel', type: 'venda', quantity: 100, unit_price: 55, fees: 0, date: '2026-02-01' },
    ];
    const report = computeCapitalGains(ops, 2026);
    assert.equal(report.months.length, 1);
    const [month] = report.months;
    assert.equal(month.total_sold, 1500 + 5500);
    assert.equal(month.gain, 500 + 500);
  });

  test('sem operações no ano, retorna relatório vazio', () => {
    const report = computeCapitalGains([], 2026);
    assert.deepEqual(report.months, []);
    assert.equal(report.total_gain, 0);
    assert.equal(report.total_suggested_darf, 0);
  });
});
