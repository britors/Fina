import { ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { getDb } from '../database';
import { adjustBalance } from './transactions';
import { attachToInvoice } from '../invoices';
import type { Bill, BillInterval, BillPriceIncrease, PaymentSplit, PaymentSplitWithAccount } from '../../shared/types';
import { categoryOrChildPredicate } from '../categoryHierarchyQueries';

type BillInput = Omit<Bill, 'id' | 'created_at' | 'updated_at'> & { payments?: PaymentSplit[] };
type BillUpdateInput = Partial<Bill> & { id: string; payments?: PaymentSplit[] };

function autoMarkOverdue(): void {
  getDb().prepare(
    `UPDATE bills SET status='overdue', updated_at=datetime('now') WHERE status='pending' AND due_date < date('now')`
  ).run();
}

const INTERVAL_DAYS: Partial<Record<BillInterval, number>> = { weekly: 7, biweekly: 14 };
const INTERVAL_MONTHS: Partial<Record<BillInterval, number>> = {
  monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, annual: 12,
};

// Soma `multiplier` intervalos a due_date. Para intervalos em meses, o dia é
// preso ao último dia do mês de destino quando ele não existir (ex: dia 31
// de um mês de 30 dias), igual à lógica usada em recurrences.ts.
export function addInterval(dueDate: string, interval: BillInterval, multiplier: number): string {
  const days = INTERVAL_DAYS[interval];
  if (days != null) {
    const d = new Date(dueDate + 'T00:00:00');
    d.setDate(d.getDate() + days * multiplier);
    return d.toISOString().slice(0, 10);
  }

  const months = INTERVAL_MONTHS[interval]! * multiplier;
  const [year, month, day] = dueDate.split('-').map(Number);
  const total = (month - 1) + months;
  const newYear = year + Math.floor(total / 12);
  const newMonth = (total % 12) + 1;
  const lastDay = new Date(newYear, newMonth, 0).getDate();
  const newDay = Math.min(day, lastDay);
  return `${newYear}-${String(newMonth).padStart(2, '0')}-${String(newDay).padStart(2, '0')}`;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizePayments(data: { amount: number; account_id?: string | null; payments?: PaymentSplit[] }, allowEmpty: boolean): PaymentSplit[] {
  const payments = data.payments?.length
    ? data.payments
    : data.account_id
      ? [{ account_id: data.account_id, amount: data.amount }]
      : [];

  if (allowEmpty && payments.length === 0) return [];
  if (payments.length === 0) throw new Error('Defina pelo menos um meio de pagamento.');

  const seen = new Set<string>();
  let total = 0;
  for (const payment of payments) {
    if (!payment.account_id) throw new Error('Selecione todos os meios de pagamento.');
    if (!Number.isFinite(payment.amount) || payment.amount <= 0) throw new Error('Informe valores válidos para os meios de pagamento.');
    if (seen.has(payment.account_id)) throw new Error('Não repita o mesmo meio de pagamento.');
    seen.add(payment.account_id);
    total += payment.amount;
  }

  if (Math.abs(total - data.amount) > 0.005) {
    throw new Error('A soma dos meios de pagamento deve ser igual ao valor total.');
  }

  return payments.map(payment => ({ account_id: payment.account_id, amount: roundMoney(payment.amount) }));
}

function replaceBillPayments(billId: string, payments: PaymentSplit[]): void {
  const db = getDb();
  db.prepare('DELETE FROM bill_payments WHERE bill_id = ?').run(billId);
  const stmt = db.prepare('INSERT INTO bill_payments (id, bill_id, account_id, amount) VALUES (?,?,?,?)');
  for (const payment of payments) {
    stmt.run(randomUUID(), billId, payment.account_id, payment.amount);
  }
}

function getBillPayments(billId: string): PaymentSplitWithAccount[] {
  return getDb().prepare(`
    SELECT p.account_id, p.amount, a.name as account_name
    FROM bill_payments p
    JOIN accounts a ON a.id = p.account_id
    WHERE p.bill_id = ?
    ORDER BY p.created_at, p.id
  `).all(billId) as PaymentSplitWithAccount[];
}

function enrichBill<T extends Bill>(bill: T | undefined | null): (T & { payments: PaymentSplitWithAccount[] }) | null {
  if (!bill) return null;
  return { ...bill, payments: getBillPayments(bill.id) };
}

function enrichBills<T extends Bill>(bills: T[]): (T & { payments: PaymentSplitWithAccount[] })[] {
  return bills.map(bill => enrichBill(bill)!);
}

function latestPriceHistoryAmount(billId: string): number | null {
  const row = getDb().prepare(
    `SELECT amount FROM bill_price_history WHERE bill_id = ? ORDER BY changed_at DESC, rowid DESC LIMIT 1`
  ).get(billId) as { amount: number } | undefined;
  return row?.amount ?? null;
}

// Registra o valor de uma conta recorrente sempre que ele mudar, para
// permitir detectar aumento de preço de assinaturas (bills:getPriceIncreases).
function trackPriceHistory(billId: string, amount: number): void {
  const previous = latestPriceHistoryAmount(billId);
  if (previous !== null && Math.abs(previous - amount) < 0.005) return;
  getDb().prepare(
    'INSERT INTO bill_price_history (id, bill_id, amount) VALUES (?,?,?)'
  ).run(randomUUID(), billId, amount);
}

export function registerBillHandlers(): void {
  ipcMain.handle('bills:list', (_e, filters: { status?: string; dateFrom?: string; dateTo?: string; category_id?: string } = {}) => {
    autoMarkOverdue();
    const conds: string[] = ['1=1'];
    const params: unknown[] = [];
    if (filters.status)      { conds.push('b.status = ?');      params.push(filters.status); }
    if (filters.dateFrom)    { conds.push('b.due_date >= ?');   params.push(filters.dateFrom); }
    if (filters.dateTo)      { conds.push('b.due_date <= ?');   params.push(filters.dateTo); }
    if (filters.category_id) {
      conds.push(categoryOrChildPredicate('b.category_id'));
      params.push(filters.category_id, filters.category_id);
    }
    const rows = getDb().prepare(`
      SELECT b.*,
        CASE WHEN parent.id IS NULL THEN c.name ELSE parent.name || ' › ' || c.name END as category_name,
        c.icon as category_icon, c.color as category_color
      FROM bills b
      LEFT JOIN categories c ON b.category_id = c.id
      LEFT JOIN categories parent ON parent.id = c.parent_id
      WHERE ${conds.join(' AND ')}
      ORDER BY b.due_date
    `).all(...params) as Bill[];
    return enrichBills(rows);
  });

  ipcMain.handle('bills:getUpcoming', (_e, days = 30) => {
    autoMarkOverdue();
    const rows = getDb().prepare(
      `SELECT * FROM bills WHERE status != 'paid' AND due_date <= date('now', '+' || ? || ' days') ORDER BY due_date`
    ).all(days) as Bill[];
    return enrichBills(rows);
  });

  ipcMain.handle('bills:create', (_e, data: BillInput) => {
    const payments = normalizePayments(data, true);
    const primaryAccountId = payments[0]?.account_id ?? data.account_id ?? null;
    const id = randomUUID();
    const db = getDb();
    db.transaction(() => {
      db.prepare(
        'INSERT INTO bills (id, description, amount, due_date, status, account_id, category_id, recurring, recurrence_interval) VALUES (?,?,?,?,?,?,?,?,?)'
      ).run(id, data.description, data.amount, data.due_date, data.status ?? 'pending', primaryAccountId, data.category_id ?? null, data.recurring ? 1 : 0, data.recurrence_interval ?? 'monthly');
      replaceBillPayments(id, payments);
      if (data.recurring) trackPriceHistory(id, data.amount);
    })();
    return enrichBill(db.prepare('SELECT * FROM bills WHERE id = ?').get(id) as Bill | undefined);
  });

  // Cria N cópias da conta com o vencimento avançado a cada repetição,
  // segundo o intervalo escolhido (semanal, mensal, trimestral, etc).
  // Não mexe na conta original nem usa o mecanismo de recurring=1.
  ipcMain.handle('bills:duplicate', (_e, { id, times, interval }: { id: string; times: number; interval: BillInterval }) => {
    const db = getDb();
    const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(id) as Bill | undefined;
    if (!bill) throw new Error('Conta não encontrada.');
    if (!Number.isInteger(times) || times < 1) throw new Error('Informe quantas vezes repetir (mínimo 1).');

    const createdIds: string[] = [];
    db.transaction(() => {
      for (let i = 1; i <= times; i++) {
        const newId = randomUUID();
        const newDue = addInterval(bill.due_date, interval, i);
        db.prepare(
          'INSERT INTO bills (id, description, amount, due_date, status, account_id, category_id, recurring) VALUES (?,?,?,?,?,?,?,0)'
        ).run(newId, bill.description, bill.amount, newDue, 'pending', bill.account_id, bill.category_id);
        replaceBillPayments(newId, getBillPayments(bill.id));
        createdIds.push(newId);
      }
    })();

    return enrichBills(db.prepare(`SELECT * FROM bills WHERE id IN (${createdIds.map(() => '?').join(',')}) ORDER BY due_date`).all(...createdIds) as Bill[]);
  });

  ipcMain.handle('bills:update', (_e, { id, ...data }: BillUpdateInput) => {
    const payments = normalizePayments(data as BillInput, true);
    const primaryAccountId = payments[0]?.account_id ?? data.account_id ?? null;
    const db = getDb();
    db.transaction(() => {
      db.prepare(
        `UPDATE bills SET description=?, amount=?, due_date=?, status=?, account_id=?, category_id=?, recurring=?, recurrence_interval=?, updated_at=datetime('now') WHERE id=?`
      ).run(data.description, data.amount, data.due_date, data.status, primaryAccountId, data.category_id ?? null, data.recurring ? 1 : 0, data.recurrence_interval ?? 'monthly', id);
      replaceBillPayments(id, payments);
      if (data.recurring && data.amount != null) trackPriceHistory(id, data.amount);
    })();
    return enrichBill(db.prepare('SELECT * FROM bills WHERE id = ?').get(id) as Bill | undefined);
  });

  ipcMain.handle('bills:delete', (_e, id: string) => {
    getDb().prepare('DELETE FROM bills WHERE id = ?').run(id);
  });

  // Assinaturas (fixas recorrentes) cujo valor mais recente é maior que o
  // valor anterior registrado no histórico — usado no painel de alertas e
  // nas notificações nativas/e-mail/webhook.
  ipcMain.handle('bills:getPriceIncreases', () => {
    return getDb().prepare(`
      SELECT b.id as bill_id, b.description, prev.amount as previous_amount, last.amount as new_amount, last.changed_at
      FROM bills b
      JOIN (
        SELECT bill_id, amount, changed_at,
               ROW_NUMBER() OVER (PARTITION BY bill_id ORDER BY changed_at DESC, rowid DESC) as rn
        FROM bill_price_history
      ) last ON last.bill_id = b.id AND last.rn = 1
      JOIN (
        SELECT bill_id, amount, changed_at,
               ROW_NUMBER() OVER (PARTITION BY bill_id ORDER BY changed_at DESC, rowid DESC) as rn
        FROM bill_price_history
      ) prev ON prev.bill_id = b.id AND prev.rn = 2
      WHERE b.recurring = 1 AND last.amount > prev.amount
      ORDER BY last.changed_at DESC
    `).all() as BillPriceIncrease[];
  });

  // Marca a conta como paga gerando o lançamento de despesa correspondente:
  // o débito na conta acontece uma única vez, através da criação da
  // transação (nunca diretamente aqui), e a conta a pagar é removida da
  // lista — ela "virou" o lançamento. Bills recorrentes (recurring=1) são
  // o molde usado por generateRecurrences() para gerar as próximas
  // ocorrências, então continuam existindo (apenas com status='paid') em
  // vez de serem apagadas, senão a recorrência para de funcionar.
  // category_id é opcional: se a conta já tiver uma categoria definida, ela é
  // reaproveitada automaticamente no lançamento gerado; só é obrigatório
  // informar uma quando a conta não tem categoria (ex: bills mais antigas).
  ipcMain.handle('bills:markAsPaid', (_e, { id, category_id, date, payments: inputPayments }: { id: string; category_id?: string; date?: string; payments?: PaymentSplit[] }) => {
    const db = getDb();
    const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(id) as Bill | undefined;
    if (!bill) return null;
    if (bill.status === 'paid') return bill;
    const payments = normalizePayments({ amount: bill.amount, account_id: bill.account_id, payments: inputPayments?.length ? inputPayments : getBillPayments(id) }, false);
    const finalCategoryId = category_id || bill.category_id;
    if (!finalCategoryId) {
      throw new Error('Selecione uma categoria para o lançamento.');
    }

    const paidAt = date ?? new Date().toISOString().slice(0, 10);

    db.transaction(() => {
      if (bill.recurring) {
        for (const payment of payments) {
          const signedDelta = adjustBalance(payment.account_id, -payment.amount);
          attachToInvoice(payment.account_id, paidAt, signedDelta);
        }
        db.prepare(`UPDATE bills SET status='paid', updated_at=datetime('now') WHERE id=?`).run(id);
        replaceBillPayments(id, payments);
        return;
      }

      const txId = randomUUID();
      db.prepare(
        'INSERT INTO transactions (id, account_id, category_id, description, amount, type, date, status, notes, recurring) VALUES (?,?,?,?,?,?,?,?,?,0)'
      ).run(txId, payments[0].account_id, finalCategoryId, bill.description, bill.amount, 'expense', paidAt, 'confirmed', null);
      const txPaymentStmt = db.prepare('INSERT INTO transaction_payments (id, transaction_id, account_id, amount) VALUES (?,?,?,?)');
      const invoiceLinkStmt = db.prepare('UPDATE transaction_payments SET invoice_id = ? WHERE id = ?');
      for (const payment of payments) {
        const paymentId = randomUUID();
        txPaymentStmt.run(paymentId, txId, payment.account_id, payment.amount);
        const signedDelta = adjustBalance(payment.account_id, -payment.amount);
        const invoiceId = attachToInvoice(payment.account_id, paidAt, signedDelta);
        if (invoiceId) invoiceLinkStmt.run(invoiceId, paymentId);
      }
      db.prepare('DELETE FROM bills WHERE id = ?').run(id);
    })();

    return db.prepare('SELECT * FROM bills WHERE id = ?').get(id) ?? null;
  });
}
