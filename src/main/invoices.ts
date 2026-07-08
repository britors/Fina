import { randomUUID } from 'node:crypto';
import { getDb } from './database';
import { invoicePeriodClosingDate, invoiceDueDate } from '../shared/utils';
import type { CreditCardInvoice } from '../shared/types';

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function creditCardCycleFields(accountId: string): { closing_day: number; due_day: number } | null {
  const account = getDb().prepare('SELECT type, closing_day, due_day FROM accounts WHERE id = ?').get(accountId) as
    { type: string; closing_day: number | null; due_day: number | null } | undefined;
  if (!account || account.type !== 'credit_card' || account.closing_day == null || account.due_day == null) return null;
  return { closing_day: account.closing_day, due_day: account.due_day };
}

function findInvoiceIdByClosing(accountId: string, closingDate: string): string | null {
  const row = getDb().prepare(
    'SELECT id FROM credit_card_invoices WHERE account_id = ? AND closing_date = ?'
  ).get(accountId, closingDate) as { id: string } | undefined;
  return row?.id ?? null;
}

function insertInvoice(accountId: string, closingDate: string, dueDate: string): string {
  const id = randomUUID();
  getDb().prepare(
    `INSERT INTO credit_card_invoices (id, account_id, amount, closing_date, due_date, status) VALUES (?,?,0,?,?,'open')`
  ).run(id, accountId, closingDate, dueDate);
  return id;
}

// Ponto de integração principal: para eventos que afetam o saldo de um
// cartão (despesa/receita/estorno, parcela, conta paga), encontra ou cria a
// fatura do ciclo correspondente à data do evento e ajusta seu total.
// No-op (retorna null) se a conta não for cartão de crédito ou não tiver
// dia de fechamento/vencimento configurado — rastreamento é opt-in e nunca
// retroativo.
export function attachToInvoice(accountId: string, date: string, signedDelta: number): string | null {
  const cycle = creditCardCycleFields(accountId);
  if (!cycle) return null;

  const closingDate = invoicePeriodClosingDate(cycle.closing_day, date);
  const invoiceId = findInvoiceIdByClosing(accountId, closingDate)
    ?? insertInvoice(accountId, closingDate, invoiceDueDate(closingDate, cycle.closing_day, cycle.due_day));

  getDb().prepare(`UPDATE credit_card_invoices SET amount = amount + ?, updated_at = datetime('now') WHERE id = ?`)
    .run(roundMoney(signedDelta), invoiceId);
  return invoiceId;
}

// Reversão exata a partir de um id já conhecido (edição/exclusão de um
// lançamento já anexado) — nunca recalcula por data, o que quebraria se o
// dia de fechamento do cartão tiver mudado depois do lançamento original.
export function adjustInvoiceAmount(invoiceId: string, delta: number): void {
  getDb().prepare(`UPDATE credit_card_invoices SET amount = amount + ?, updated_at = datetime('now') WHERE id = ?`)
    .run(roundMoney(delta), invoiceId);
}

// Bootstrap preguiçoso: acha a fatura em aberto mais antiga do cartão; se
// não existir nenhuma, cria uma para o ciclo de hoje. Nunca cria uma segunda
// fatura aberta enquanto já existir uma mais antiga pendente.
export function ensureCurrentInvoice(accountId: string): CreditCardInvoice | null {
  const cycle = creditCardCycleFields(accountId);
  if (!cycle) return null;

  const db = getDb();
  const existing = db.prepare(
    `SELECT * FROM credit_card_invoices WHERE account_id = ? AND status = 'open' ORDER BY closing_date ASC LIMIT 1`
  ).get(accountId) as CreditCardInvoice | undefined;
  if (existing) return existing;

  const today = new Date().toISOString().slice(0, 10);
  const closingDate = invoicePeriodClosingDate(cycle.closing_day, today);
  const id = insertInvoice(accountId, closingDate, invoiceDueDate(closingDate, cycle.closing_day, cycle.due_day));
  return db.prepare('SELECT * FROM credit_card_invoices WHERE id = ?').get(id) as CreditCardInvoice;
}
