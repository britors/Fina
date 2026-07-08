import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { addMonthsClamped, invoicePeriodClosingDate, invoiceDueDate } from '../src/shared/utils';

describe('addMonthsClamped', () => {
  test('soma meses mantendo o dia informado', () => {
    assert.equal(addMonthsClamped('2026-03-10', 1, 10), '2026-04-10');
  });

  test('clampa o dia ao tamanho do mês de destino', () => {
    // Fevereiro/2026 (não bissexto) tem 28 dias.
    assert.equal(addMonthsClamped('2026-01-31', 1, 31), '2026-02-28');
  });

  test('clampa em ano bissexto (2028) para 29', () => {
    assert.equal(addMonthsClamped('2028-01-15', 1, 31), '2028-02-29');
  });

  test('atravessa o fim do ano (dezembro -> janeiro)', () => {
    assert.equal(addMonthsClamped('2026-12-05', 1, 15), '2027-01-15');
  });

  test('months=0 mantém o mês, só ajusta/clampa o dia', () => {
    assert.equal(addMonthsClamped('2026-04-05', 0, 30), '2026-04-30');
  });
});

describe('invoicePeriodClosingDate', () => {
  test('dia da compra antes do fechamento cai no fechamento deste mês', () => {
    assert.equal(invoicePeriodClosingDate(10, '2026-07-05'), '2026-07-10');
  });

  test('dia da compra igual ao dia de fechamento cai no fechamento deste mês', () => {
    assert.equal(invoicePeriodClosingDate(10, '2026-07-10'), '2026-07-10');
  });

  test('dia da compra depois do fechamento cai na fatura do mês seguinte', () => {
    assert.equal(invoicePeriodClosingDate(10, '2026-07-11'), '2026-08-10');
  });

  test('compra em dezembro depois do fechamento vira fatura de janeiro do ano seguinte', () => {
    assert.equal(invoicePeriodClosingDate(25, '2026-12-26'), '2027-01-25');
  });

  test('dia de fechamento 31 clampa em mês curto (fevereiro)', () => {
    assert.equal(invoicePeriodClosingDate(31, '2026-02-15'), '2026-02-28');
  });

  test('compra no dia 1, fechamento no dia 31: ainda cai no fechamento deste mês', () => {
    assert.equal(invoicePeriodClosingDate(31, '2026-04-01'), '2026-04-30');
  });
});

describe('invoiceDueDate', () => {
  test('vencimento depois do fechamento no calendário cai no mesmo mês do fechamento', () => {
    // Fecha dia 5, vence dia 25 — vencimento e fechamento no mesmo mês.
    assert.equal(invoiceDueDate('2026-07-05', 5, 25), '2026-07-25');
  });

  test('vencimento antes (ou igual) ao fechamento no calendário cai no mês seguinte', () => {
    // Fecha dia 25, vence dia 5 — ciclo real de cartão (vencimento no mês seguinte).
    assert.equal(invoiceDueDate('2026-07-25', 25, 5), '2026-08-05');
  });

  test('due_day igual ao closing_day cai no mês seguinte (não é "depois")', () => {
    assert.equal(invoiceDueDate('2026-07-10', 10, 10), '2026-08-10');
  });

  test('atravessa o fim do ano (fechamento em dezembro, vencimento em janeiro)', () => {
    assert.equal(invoiceDueDate('2026-12-20', 20, 5), '2027-01-05');
  });

  test('clampa o dia de vencimento ao tamanho do mês de destino', () => {
    assert.equal(invoiceDueDate('2026-01-31', 31, 31), '2026-02-28');
  });
});
