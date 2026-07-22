import { ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { getDb } from '../database';
import { adjustBalance } from './transactions';
import { attachToInvoice } from '../invoices';
import { addInterval } from './bills';
import type { CategorySplit, CategorySplitWithCategory, Receivable, ReceivableInterval, ReceivablePriceIncrease, PaymentSplit, PaymentSplitWithAccount } from '../../shared/types';
import { categoryOrChildPredicate } from '../categoryHierarchyQueries';
import { isPixEligibleAccountType } from '../../shared/utils';

type ReceivableInput = Omit<Receivable, 'id' | 'created_at' | 'updated_at'> & { payments?: PaymentSplit[]; categories?: CategorySplit[] };
type ReceivableUpdateInput = Partial<Receivable> & { id: string; payments?: PaymentSplit[]; categories?: CategorySplit[] };

function autoMarkOverdue(): void {
  getDb().prepare(
    `UPDATE receivables SET status='overdue', updated_at=datetime('now') WHERE status='pending' AND due_date < date('now')`
  ).run();
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
  if (payments.length === 0) throw new Error('Defina pelo menos uma conta.');

  const seen = new Set<string>();
  let total = 0;
  for (const payment of payments) {
    if (!payment.account_id) throw new Error('Selecione todas as contas.');
    if (!Number.isFinite(payment.amount) || payment.amount <= 0) throw new Error('Informe valores válidos para as contas.');
    if (seen.has(payment.account_id)) throw new Error('Não repita a mesma conta.');
    seen.add(payment.account_id);
    total += payment.amount;
    assertPixEligible(payment);
  }

  if (Math.abs(total - data.amount) > 0.005) {
    throw new Error('A soma das contas deve ser igual ao valor total.');
  }

  return payments.map(payment => ({ account_id: payment.account_id, amount: roundMoney(payment.amount), is_pix: payment.is_pix ? 1 : 0 }));
}

function assertPixEligible(payment: PaymentSplit): void {
  if (!payment.is_pix) return;
  const account = getDb().prepare('SELECT type FROM accounts WHERE id = ?').get(payment.account_id) as { type: string } | undefined;
  if (!account || !isPixEligibleAccountType(account.type)) {
    throw new Error('Pix só está disponível para recebimentos em conta corrente ou cartão de crédito.');
  }
}

function normalizeCategories(data: { amount: number; category_id?: string | null; categories?: CategorySplit[] }, allowEmpty: boolean): CategorySplit[] {
  const categories = data.categories?.length
    ? data.categories
    : data.category_id
      ? [{ category_id: data.category_id, amount: data.amount }]
      : [];

  if (allowEmpty && categories.length === 0) return [];
  if (categories.length === 0) throw new Error('Defina pelo menos uma categoria.');

  const seen = new Set<string>();
  let total = 0;
  for (const category of categories) {
    if (!category.category_id) throw new Error('Selecione todas as categorias.');
    if (!Number.isFinite(category.amount) || category.amount <= 0) throw new Error('Informe valores válidos para as categorias.');
    if (seen.has(category.category_id)) throw new Error('Não repita a mesma categoria.');
    seen.add(category.category_id);
    total += category.amount;
    assertIncomeCategory(category.category_id);
  }

  if (Math.abs(total - data.amount) > 0.005) {
    throw new Error('A soma das categorias deve ser igual ao valor total.');
  }

  return categories.map(category => ({ category_id: category.category_id, amount: roundMoney(category.amount) }));
}

function assertIncomeCategory(categoryId: string): void {
  const category = getDb().prepare('SELECT type FROM categories WHERE id = ?').get(categoryId) as { type: string } | undefined;
  if (!category || category.type !== 'income') {
    throw new Error('Selecione uma categoria de receita válida.');
  }
}

function replaceReceivablePayments(receivableId: string, payments: PaymentSplit[]): void {
  const db = getDb();
  db.prepare('DELETE FROM receivable_payments WHERE receivable_id = ?').run(receivableId);
  const stmt = db.prepare('INSERT INTO receivable_payments (id, receivable_id, account_id, amount, is_pix) VALUES (?,?,?,?,?)');
  for (const payment of payments) {
    stmt.run(randomUUID(), receivableId, payment.account_id, payment.amount, payment.is_pix ? 1 : 0);
  }
}

function getReceivablePayments(receivableId: string): PaymentSplitWithAccount[] {
  return getDb().prepare(`
    SELECT p.account_id, p.amount, p.is_pix, a.name as account_name
    FROM receivable_payments p
    JOIN accounts a ON a.id = p.account_id
    WHERE p.receivable_id = ?
    ORDER BY p.created_at, p.id
  `).all(receivableId) as PaymentSplitWithAccount[];
}

function replaceReceivableCategories(receivableId: string, categories: CategorySplit[]): void {
  const db = getDb();
  db.prepare('DELETE FROM receivable_categories WHERE receivable_id = ?').run(receivableId);
  const stmt = db.prepare('INSERT INTO receivable_categories (id, receivable_id, category_id, amount) VALUES (?,?,?,?)');
  for (const category of categories) {
    stmt.run(randomUUID(), receivableId, category.category_id, category.amount);
  }
}

function getReceivableCategories(receivableId: string): CategorySplitWithCategory[] {
  return getDb().prepare(`
    SELECT rc.category_id, rc.amount, c.name as category_name, c.icon as category_icon, c.color as category_color
    FROM receivable_categories rc
    JOIN categories c ON c.id = rc.category_id
    WHERE rc.receivable_id = ?
    ORDER BY rc.created_at, rc.id
  `).all(receivableId) as CategorySplitWithCategory[];
}

function enrichReceivable<T extends Receivable>(receivable: T | undefined | null): (T & { payments: PaymentSplitWithAccount[]; categories: CategorySplitWithCategory[] }) | null {
  if (!receivable) return null;
  return { ...receivable, payments: getReceivablePayments(receivable.id), categories: getReceivableCategories(receivable.id) };
}

function enrichReceivables<T extends Receivable>(receivables: T[]): (T & { payments: PaymentSplitWithAccount[]; categories: CategorySplitWithCategory[] })[] {
  return receivables.map(receivable => enrichReceivable(receivable)!);
}

function latestPriceHistoryAmount(receivableId: string): number | null {
  const row = getDb().prepare(
    `SELECT amount FROM receivable_price_history WHERE receivable_id = ? ORDER BY changed_at DESC, rowid DESC LIMIT 1`
  ).get(receivableId) as { amount: number } | undefined;
  return row?.amount ?? null;
}

// Registra o valor de um recebimento recorrente sempre que ele mudar, para
// permitir detectar reajuste de mensalidades/recebimentos fixos
// (receivables:getPriceIncreases).
function trackPriceHistory(receivableId: string, amount: number): void {
  const previous = latestPriceHistoryAmount(receivableId);
  if (previous !== null && Math.abs(previous - amount) < 0.005) return;
  getDb().prepare(
    'INSERT INTO receivable_price_history (id, receivable_id, amount) VALUES (?,?,?)'
  ).run(randomUUID(), receivableId, amount);
}

export function registerReceivableHandlers(): void {
  ipcMain.handle('receivables:list', (_e, filters: { status?: string; dateFrom?: string; dateTo?: string; category_id?: string } = {}) => {
    autoMarkOverdue();
    const conds: string[] = ['1=1'];
    const params: unknown[] = [];
    if (filters.status)      { conds.push('r.status = ?');      params.push(filters.status); }
    if (filters.dateFrom)    { conds.push('r.due_date >= ?');   params.push(filters.dateFrom); }
    if (filters.dateTo)      { conds.push('r.due_date <= ?');   params.push(filters.dateTo); }
    if (filters.category_id) {
      conds.push(categoryOrChildPredicate('r.category_id'));
      params.push(filters.category_id, filters.category_id);
    }
    const rows = getDb().prepare(`
      SELECT r.*,
        CASE WHEN parent.id IS NULL THEN c.name ELSE parent.name || ' › ' || c.name END as category_name,
        c.icon as category_icon, c.color as category_color
      FROM receivables r
      LEFT JOIN categories c ON r.category_id = c.id
      LEFT JOIN categories parent ON parent.id = c.parent_id
      WHERE ${conds.join(' AND ')}
      ORDER BY r.due_date
    `).all(...params) as Receivable[];
    return enrichReceivables(rows);
  });

  ipcMain.handle('receivables:getUpcoming', (_e, days = 30) => {
    autoMarkOverdue();
    const rows = getDb().prepare(
      `SELECT * FROM receivables WHERE status != 'received' AND due_date <= date('now', '+' || ? || ' days') ORDER BY due_date`
    ).all(days) as Receivable[];
    return enrichReceivables(rows);
  });

  ipcMain.handle('receivables:create', (_e, data: ReceivableInput) => {
    const payments = normalizePayments(data, true);
    const categories = normalizeCategories(data, true);
    const primaryAccountId = payments[0]?.account_id ?? data.account_id ?? null;
    const primaryCategoryId = categories[0]?.category_id ?? data.category_id ?? null;
    const id = randomUUID();
    const db = getDb();
    db.transaction(() => {
      db.prepare(
        'INSERT INTO receivables (id, description, amount, due_date, status, account_id, category_id, recurring, recurrence_interval) VALUES (?,?,?,?,?,?,?,?,?)'
      ).run(id, data.description, data.amount, data.due_date, data.status ?? 'pending', primaryAccountId, primaryCategoryId, data.recurring ? 1 : 0, data.recurrence_interval ?? 'monthly');
      replaceReceivablePayments(id, payments);
      if (categories.length) replaceReceivableCategories(id, categories);
      if (data.recurring) trackPriceHistory(id, data.amount);
    })();
    return enrichReceivable(db.prepare('SELECT * FROM receivables WHERE id = ?').get(id) as Receivable | undefined);
  });

  // Cria N cópias do recebimento com o vencimento avançado a cada repetição,
  // segundo o intervalo escolhido (semanal, mensal, trimestral, etc).
  // Não mexe no recebimento original nem usa o mecanismo de recurring=1.
  ipcMain.handle('receivables:duplicate', (_e, { id, times, interval }: { id: string; times: number; interval: ReceivableInterval }) => {
    const db = getDb();
    const receivable = db.prepare('SELECT * FROM receivables WHERE id = ?').get(id) as Receivable | undefined;
    if (!receivable) throw new Error('Conta a receber não encontrada.');
    if (!Number.isInteger(times) || times < 1) throw new Error('Informe quantas vezes repetir (mínimo 1).');

    const createdIds: string[] = [];
    db.transaction(() => {
      for (let i = 1; i <= times; i++) {
        const newId = randomUUID();
        const newDue = addInterval(receivable.due_date, interval, i);
        db.prepare(
          'INSERT INTO receivables (id, description, amount, due_date, status, account_id, category_id, recurring) VALUES (?,?,?,?,?,?,?,0)'
        ).run(newId, receivable.description, receivable.amount, newDue, 'pending', receivable.account_id, receivable.category_id);
        replaceReceivablePayments(newId, getReceivablePayments(receivable.id));
        replaceReceivableCategories(newId, getReceivableCategories(receivable.id));
        createdIds.push(newId);
      }
    })();

    return enrichReceivables(db.prepare(`SELECT * FROM receivables WHERE id IN (${createdIds.map(() => '?').join(',')}) ORDER BY due_date`).all(...createdIds) as Receivable[]);
  });

  ipcMain.handle('receivables:update', (_e, { id, ...data }: ReceivableUpdateInput) => {
    const payments = normalizePayments(data as ReceivableInput, true);
    const categories = normalizeCategories(data as ReceivableInput, true);
    const primaryAccountId = payments[0]?.account_id ?? data.account_id ?? null;
    const primaryCategoryId = categories[0]?.category_id ?? data.category_id ?? null;
    const db = getDb();
    db.transaction(() => {
      db.prepare(
        `UPDATE receivables SET description=?, amount=?, due_date=?, status=?, account_id=?, category_id=?, recurring=?, recurrence_interval=?, updated_at=datetime('now') WHERE id=?`
      ).run(data.description, data.amount, data.due_date, data.status, primaryAccountId, primaryCategoryId, data.recurring ? 1 : 0, data.recurrence_interval ?? 'monthly', id);
      replaceReceivablePayments(id, payments);
      if (categories.length) replaceReceivableCategories(id, categories);
      if (data.recurring && data.amount != null) trackPriceHistory(id, data.amount);
    })();
    return enrichReceivable(db.prepare('SELECT * FROM receivables WHERE id = ?').get(id) as Receivable | undefined);
  });

  ipcMain.handle('receivables:delete', (_e, id: string) => {
    getDb().prepare('DELETE FROM receivables WHERE id = ?').run(id);
  });

  // Recebimentos fixos/recorrentes cujo valor mais recente é maior que o
  // valor anterior registrado no histórico — usado no painel de alertas e
  // nas notificações nativas/e-mail/webhook.
  ipcMain.handle('receivables:getPriceIncreases', () => {
    return getDb().prepare(`
      SELECT r.id as receivable_id, r.description, prev.amount as previous_amount, last.amount as new_amount, last.changed_at
      FROM receivables r
      JOIN (
        SELECT receivable_id, amount, changed_at,
               ROW_NUMBER() OVER (PARTITION BY receivable_id ORDER BY changed_at DESC, rowid DESC) as rn
        FROM receivable_price_history
      ) last ON last.receivable_id = r.id AND last.rn = 1
      JOIN (
        SELECT receivable_id, amount, changed_at,
               ROW_NUMBER() OVER (PARTITION BY receivable_id ORDER BY changed_at DESC, rowid DESC) as rn
        FROM receivable_price_history
      ) prev ON prev.receivable_id = r.id AND prev.rn = 2
      WHERE r.recurring = 1 AND last.amount > prev.amount
      ORDER BY last.changed_at DESC
    `).all() as ReceivablePriceIncrease[];
  });

  // Marca a conta como recebida gerando o lançamento de receita
  // correspondente: o crédito na conta acontece uma única vez, através da
  // criação da transação (nunca diretamente aqui), e a conta a receber é
  // removida da lista — ela "virou" o lançamento. Receivables recorrentes
  // (recurring=1) são o molde usado por generateRecurrences() para gerar as
  // próximas ocorrências, então continuam existindo (apenas com
  // status='received') em vez de serem apagadas, senão a recorrência para
  // de funcionar.
  ipcMain.handle('receivables:markAsReceived', (_e, { id, category_id, categories: inputCategories, date, payments: inputPayments }: { id: string; category_id?: string; categories?: CategorySplit[]; date?: string; payments?: PaymentSplit[] }) => {
    const db = getDb();
    const receivable = db.prepare('SELECT * FROM receivables WHERE id = ?').get(id) as Receivable | undefined;
    if (!receivable) return null;
    if (receivable.status === 'received') return receivable;
    const payments = normalizePayments({ amount: receivable.amount, account_id: receivable.account_id, payments: inputPayments?.length ? inputPayments : getReceivablePayments(id) }, false);
    const resolvedCategories = inputCategories?.length
      ? inputCategories
      : category_id
        ? [{ category_id, amount: receivable.amount }]
        : getReceivableCategories(id);
    if (!receivable.category_id && !category_id && resolvedCategories.length === 0) {
      throw new Error('Selecione uma categoria para o lançamento.');
    }
    const categories = normalizeCategories({ amount: receivable.amount, category_id: category_id || receivable.category_id, categories: resolvedCategories }, false);

    const receivedAt = date ?? new Date().toISOString().slice(0, 10);

    db.transaction(() => {
      if (receivable.recurring) {
        for (const payment of payments) {
          const signedDelta = adjustBalance(payment.account_id, payment.amount);
          attachToInvoice(payment.account_id, receivedAt, signedDelta);
        }
        db.prepare(`UPDATE receivables SET status='received', updated_at=datetime('now') WHERE id=?`).run(id);
        replaceReceivablePayments(id, payments);
        replaceReceivableCategories(id, categories);
        return;
      }

      const txId = randomUUID();
      db.prepare(
        'INSERT INTO transactions (id, account_id, category_id, description, amount, type, date, status, notes, recurring) VALUES (?,?,?,?,?,?,?,?,?,0)'
      ).run(txId, payments[0].account_id, categories[0].category_id, receivable.description, receivable.amount, 'income', receivedAt, 'confirmed', null);
      const txPaymentStmt = db.prepare('INSERT INTO transaction_payments (id, transaction_id, account_id, amount, is_pix) VALUES (?,?,?,?,?)');
      const invoiceLinkStmt = db.prepare('UPDATE transaction_payments SET invoice_id = ? WHERE id = ?');
      for (const payment of payments) {
        const paymentId = randomUUID();
        txPaymentStmt.run(paymentId, txId, payment.account_id, payment.amount, payment.is_pix ? 1 : 0);
        const signedDelta = adjustBalance(payment.account_id, payment.amount);
        const invoiceId = attachToInvoice(payment.account_id, receivedAt, signedDelta);
        if (invoiceId) invoiceLinkStmt.run(invoiceId, paymentId);
      }
      const txCategoryStmt = db.prepare('INSERT INTO transaction_categories (id, transaction_id, category_id, amount) VALUES (?,?,?,?)');
      for (const category of categories) {
        txCategoryStmt.run(randomUUID(), txId, category.category_id, category.amount);
      }
      db.prepare('DELETE FROM receivables WHERE id = ?').run(id);
    })();

    return db.prepare('SELECT * FROM receivables WHERE id = ?').get(id) ?? null;
  });
}
