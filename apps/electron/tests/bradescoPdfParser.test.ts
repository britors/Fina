import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBradescoPdfPages, type PdfTextItem } from '../src/main/import/bradesco-pdf-parser';

const item = (text: string, x: number, y: number): PdfTextItem => ({ text, x, y });

test('parses Bradesco credits, debits and continuation dates', () => {
  const rows = parseBradescoPdfPages([{ items: [
    item('Bradesco Celular', 40, 770), item('Crédito (R$)', 385, 681), item('Débito (R$)', 452, 681),
    item('01/08/2026', 46, 645), item('PIX RECEBIDO', 110, 649), item('REM: EMPRESA EXEMPLO', 110, 640),
    item('1234567', 303, 645), item('1.250,50', 399, 645), item('2.000,00', 523, 645),
    item('COMPRA CARTAO VISA', 110, 619), item('LOJA EXEMPLO', 110, 610), item('7654321', 303, 614),
    item('49,90', 473, 614), item('1.950,10', 523, 614),
  ] }]);

  assert.deepEqual(rows.map(({ date, description, amount, type }) => ({ date, description, amount, type })), [
    { date: '2026-08-01', description: 'PIX RECEBIDO REM: EMPRESA EXEMPLO', amount: 1250.5, type: 'income' },
    { date: '2026-08-01', description: 'COMPRA CARTAO VISA LOJA EXEMPLO', amount: 49.9, type: 'expense' },
  ]);
  assert.match(rows[0].fitid ?? '', /^BRADESCO:/);
});

test('rejects PDFs from unsupported banks', () => {
  assert.throws(() => parseBradescoPdfPages([{ items: [item('Outro banco', 10, 10)] }]), /não parece ser/);
});
