import { randomUUID } from 'node:crypto';
import { getDb } from './database';
import type { CreditCardInvoice } from '../shared/types';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

// Soma `months` a `date` (YYYY-MM-DD), travando o dia resultante em
// `targetDay`, clampado ao tamanho do mês de destino — mesmo padrão de
// `addMonthsIso`/`addInterval` já usados em transactions.ts/bills.ts.
function addMonthsClamped(date: string, months: number, targetDay: number): string {
  const [year, month] = date.split('-').map(Number);
  const target = new Date(year, month - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const day = Math.min(targetDay, lastDay);
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(day)}`;
}

// Data de fechamento (YYYY-MM-DD) do ciclo ao qual `date` pertence: compras
// até o dia de fechamento caem na fatura que fecha nesse mesmo mês; depois
// dele, caem na fatura do mês seguinte.
export function invoicePeriodClosingDate(closingDay: number, date: string): string {
  const day = Number(date.split('-')[2]);
  return day <= closingDay ? addMonthsClamped(date, 0, closingDay) : addMonthsClamped(date, 1, closingDay);
}

// Vencimento correspondente a uma data de fechamento: mesmo mês do
// fechamento se o dia de vencimento vier depois do dia de fechamento nesse
// mês, senão mês seguinte — replica o ciclo real fatura/vencimento.
export function invoiceDueDate(closingDate: string, closingDay: number, dueDay: number): string {
  return dueDay > closingDay ? addMonthsClamped(closingDate, 0, dueDay) : addMonthsClamped(closingDate, 1, dueDay);
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
