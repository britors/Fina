import { ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { getDb } from '../database';
import type { PaymentSplit, PaymentSplitWithAccount, Transaction, TransactionFilters, TransactionType } from '../../shared/types';
import { isCreditLikeAccountType } from '../../shared/utils';

const JOIN = `
  SELECT t.*, a.name as account_name,
    c.name as category_name, c.icon as category_icon, c.color as category_color
  FROM transactions t
  JOIN accounts a ON t.account_id = a.id
  JOIN categories c ON t.category_id = c.id
`;

type TransactionInput = Omit<Transaction, 'id' | 'created_at' | 'updated_at'> & { payments?: PaymentSplit[] };
type TransactionUpdateInput = Partial<Transaction> & { id: string; payments?: PaymentSplit[] };

export function balanceDelta(type: TransactionType, amount: number): number {
  return type === 'income' ? amount : -amount;
}

// Para crédito/vales, "balance" representa a fatura (dívida), não caixa:
// uma despesa deve aumentar o valor devido, e não diminuí-lo como numa conta
// corrente. Por isso o delta é invertido para esses meios de pagamento.
export function adjustBalance(accountId: string, delta: number): void {
  const db = getDb();
  const account = db.prepare('SELECT type FROM accounts WHERE id = ?').get(accountId) as { type: string } | undefined;
  const signedDelta = account && isCreditLikeAccountType(account.type) ? -delta : delta;
  db.prepare(`UPDATE accounts SET balance = balance + ?, updated_at = datetime('now') WHERE id = ?`)
    .run(signedDelta, accountId);
}

// Transferências movem dinheiro entre duas contas: debita a origem e credita o
// destino, em vez de simplesmente desaparecer como uma despesa comum.
function applyBalanceEffect(
  tx: { id?: string; account_id: string; to_account_id?: string | null; type: TransactionType; amount: number; payments?: PaymentSplit[] },
  sign: 1 | -1,
): void {
  if (tx.type === 'transfer' && tx.to_account_id) {
    adjustBalance(tx.account_id, -tx.amount * sign);
    adjustBalance(tx.to_account_id, tx.amount * sign);
  } else {
    const payments = tx.payments?.length ? tx.payments : tx.id ? getTransactionPayments(tx.id) : [{ account_id: tx.account_id, amount: tx.amount }];
    for (const payment of payments) {
      adjustBalance(payment.account_id, balanceDelta(tx.type, payment.amount) * sign);
    }
  }
}

function normalizePayments(data: { type: TransactionType; account_id: string; amount: number; payments?: PaymentSplit[] }): PaymentSplit[] {
  if (data.type === 'transfer') return [];
  const payments = data.payments?.length ? data.payments : [{ account_id: data.account_id, amount: data.amount }];
  const seen = new Set<string>();
  let total = 0;

  for (const payment of payments) {
    if (!payment.account_id) throw new Error('Selecione todos os meios de pagamento.');
    if (!Number.isFinite(payment.amount) || payment.amount <= 0) throw new Error('Informe valores válidos para os meios de pagamento.');
    if (seen.has(payment.account_id)) throw new Error('Não repita o mesmo meio de pagamento no lançamento.');
    seen.add(payment.account_id);
    total += payment.amount;
  }

  if (Math.abs(total - data.amount) > 0.005) {
    throw new Error('A soma dos meios de pagamento deve ser igual ao valor total.');
  }

  return payments.map(payment => ({ account_id: payment.account_id, amount: roundMoney(payment.amount) }));
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function replaceTransactionPayments(transactionId: string, payments: PaymentSplit[]): void {
  const db = getDb();
  db.prepare('DELETE FROM transaction_payments WHERE transaction_id = ?').run(transactionId);
  const stmt = db.prepare('INSERT INTO transaction_payments (id, transaction_id, account_id, amount) VALUES (?,?,?,?)');
  for (const payment of payments) {
    stmt.run(randomUUID(), transactionId, payment.account_id, payment.amount);
  }
}

function getTransactionPayments(transactionId: string): PaymentSplitWithAccount[] {
  return getDb().prepare(`
    SELECT p.account_id, p.amount, a.name as account_name
    FROM transaction_payments p
    JOIN accounts a ON a.id = p.account_id
    WHERE p.transaction_id = ?
    ORDER BY p.created_at, p.id
  `).all(transactionId) as PaymentSplitWithAccount[];
}

function enrichTransaction<T extends Transaction & { account_name: string }>(row: T | undefined | null): (T & { payments: PaymentSplitWithAccount[] }) | null {
  if (!row) return null;
  const payments = getTransactionPayments(row.id);
  const accountName = payments.length > 1
    ? payments.map(p => p.account_name).join(' + ')
    : payments[0]?.account_name ?? row.account_name;
  return { ...row, account_name: accountName, payments };
}

function enrichTransactions<T extends Transaction & { account_name: string }>(rows: T[]): (T & { payments: PaymentSplitWithAccount[] })[] {
  return rows.map(row => enrichTransaction(row)!);
}

export function registerTransactionHandlers(): void {
  ipcMain.handle('transactions:list', (_e, filters: TransactionFilters = {}) => {
    const conds: string[] = ['1=1'];
    const params: unknown[] = [];

    if (filters.dateFrom || filters.dateTo) {
      if (filters.dateFrom) { conds.push('t.date >= ?'); params.push(filters.dateFrom); }
      if (filters.dateTo)   { conds.push('t.date <= ?'); params.push(filters.dateTo); }
    } else {
      if (filters.month != null) {
        conds.push("CAST(strftime('%m', t.date) AS INTEGER) = ?");
        params.push(filters.month);
      }
      if (filters.year != null) {
        conds.push("CAST(strftime('%Y', t.date) AS INTEGER) = ?");
        params.push(filters.year);
      }
    }
    if (filters.account_id)  {
      conds.push('(t.account_id = ? OR EXISTS (SELECT 1 FROM transaction_payments p WHERE p.transaction_id = t.id AND p.account_id = ?))');
      params.push(filters.account_id, filters.account_id);
    }
    if (filters.category_id) { conds.push('t.category_id = ?'); params.push(filters.category_id); }
    if (filters.type)        { conds.push('t.type = ?');        params.push(filters.type); }
    if (filters.status)      { conds.push('t.status = ?');      params.push(filters.status); }

    const limit  = filters.limit  ?? 200;
    const offset = filters.offset ?? 0;

    const rows = getDb()
      .prepare(`${JOIN} WHERE ${conds.join(' AND ')} ORDER BY t.date DESC, t.created_at DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as (Transaction & { account_name: string })[];
    return enrichTransactions(rows);
  });

  ipcMain.handle('transactions:get', (_e, id: string) =>
    enrichTransaction(getDb().prepare(`${JOIN} WHERE t.id = ?`).get(id) as (Transaction & { account_name: string }) | undefined)
  );

  ipcMain.handle('transactions:create', (_e, data: TransactionInput) => {
    if (data.type === 'transfer' && (!data.to_account_id || data.to_account_id === data.account_id)) {
      throw new Error('Selecione um meio de pagamento de destino diferente do meio de origem para a transferência.');
    }
    const payments = normalizePayments(data);
    const primaryAccountId = data.type === 'transfer' ? data.account_id : payments[0]?.account_id ?? data.account_id;
    const id = randomUUID();
    const db = getDb();
    db.transaction(() => {
      db.prepare(
        'INSERT INTO transactions (id, account_id, to_account_id, category_id, description, amount, type, date, status, notes, recurring) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
      ).run(id, primaryAccountId, data.to_account_id ?? null, data.category_id, data.description, data.amount, data.type, data.date, data.status, data.notes ?? null, data.recurring ? 1 : 0);
      replaceTransactionPayments(id, payments);
      if (data.status === 'confirmed') {
        applyBalanceEffect({ ...data, id, account_id: primaryAccountId, payments }, 1);
      }
    })();
    return enrichTransaction(db.prepare(`${JOIN} WHERE t.id = ?`).get(id) as (Transaction & { account_name: string }) | undefined);
  });

  ipcMain.handle('transactions:update', (_e, { id, ...data }: TransactionUpdateInput) => {
    if (data.type === 'transfer' && (!data.to_account_id || data.to_account_id === data.account_id)) {
      throw new Error('Selecione um meio de pagamento de destino diferente do meio de origem para a transferência.');
    }
    const payments = normalizePayments(data as TransactionInput);
    const primaryAccountId = data.type === 'transfer' ? data.account_id! : payments[0]?.account_id ?? data.account_id!;
    const db = getDb();
    db.transaction(() => {
      const old = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as Transaction | undefined;
      const oldPayments = old ? getTransactionPayments(id) : [];
      db.prepare(
        `UPDATE transactions SET account_id=?, to_account_id=?, category_id=?, description=?, amount=?, type=?, date=?, status=?, notes=?, recurring=?, updated_at=datetime('now') WHERE id=?`
      ).run(primaryAccountId, data.to_account_id ?? null, data.category_id, data.description, data.amount, data.type, data.date, data.status, data.notes ?? null, data.recurring ? 1 : 0, id);

      if (old) {
        const wasConfirmed = old.status === 'confirmed';
        const isConfirmed  = data.status === 'confirmed';

        if (wasConfirmed) {
          // Reverte o efeito anterior
          applyBalanceEffect({ ...old, payments: oldPayments }, -1);
        }
        replaceTransactionPayments(id, payments);
        if (isConfirmed) {
          // Aplica o novo efeito
          applyBalanceEffect({
            id,
            account_id: primaryAccountId,
            to_account_id: data.to_account_id,
            type: data.type!,
            amount: data.amount!,
            payments,
          }, 1);
        }
      }
    })();
    return enrichTransaction(db.prepare(`${JOIN} WHERE t.id = ?`).get(id) as (Transaction & { account_name: string }) | undefined);
  });

  ipcMain.handle('transactions:delete', (_e, id: string) => {
    const db = getDb();
    db.transaction(() => {
      const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as Transaction | undefined;
      const payments = tx ? getTransactionPayments(id) : [];
      db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
      if (tx?.status === 'confirmed') {
        applyBalanceEffect({ ...tx, payments }, -1);
      }
    })();
  });

  ipcMain.handle('transactions:getMonthlySummary', (_e, { month, year }: { month: number; year: number }) => {
    const row = getDb().prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END), 0) as income,
        COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) as expense
      FROM transactions
      WHERE CAST(strftime('%m', date) AS INTEGER) = ?
        AND CAST(strftime('%Y', date) AS INTEGER) = ?
    `).get(month, year) as { income: number; expense: number };
    return { ...row, balance: row.income - row.expense };
  });

  ipcMain.handle('transactions:getMonthlyHistory', (_e, months = 6) => {
    const rows: { label: string; income: number; expense: number }[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const m = d.getMonth() + 1;
      const y = d.getFullYear();
      const label = d.toLocaleDateString('pt-BR', { month: 'short' });
      const row = getDb().prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END), 0) as income,
          COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) as expense
        FROM transactions
        WHERE CAST(strftime('%m', date) AS INTEGER) = ?
          AND CAST(strftime('%Y', date) AS INTEGER) = ?
      `).get(m, y) as { income: number; expense: number };
      rows.push({ label, ...row });
    }
    return rows;
  });

  ipcMain.handle('transactions:getExpensesByCategory', (_e, { month, year }: { month: number; year: number }) => {
    return getDb().prepare(`
      SELECT c.name, c.color, COALESCE(SUM(t.amount), 0) as total
      FROM categories c
      LEFT JOIN transactions t ON t.category_id = c.id AND t.type = 'expense'
        AND CAST(strftime('%m', t.date) AS INTEGER) = ?
        AND CAST(strftime('%Y', t.date) AS INTEGER) = ?
      WHERE c.type = 'expense'
      GROUP BY c.id
      HAVING total > 0
      ORDER BY total DESC
    `).all(month, year);
  });

  // Variante por intervalo de datas (dateFrom/dateTo, formato YYYY-MM-DD), usada
  // pelo filtro de período "de/até" do dashboard principal.
  ipcMain.handle('transactions:getSummaryRange', (_e, { dateFrom, dateTo }: { dateFrom: string; dateTo: string }) => {
    const row = getDb().prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END), 0) as income,
        COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) as expense
      FROM transactions
      WHERE date >= ? AND date <= ?
    `).get(dateFrom, dateTo) as { income: number; expense: number };
    return { ...row, balance: row.income - row.expense };
  });

  ipcMain.handle('transactions:getExpensesByCategoryRange', (_e, { dateFrom, dateTo }: { dateFrom: string; dateTo: string }) => {
    return getDb().prepare(`
      SELECT c.name, c.color, COALESCE(SUM(t.amount), 0) as total
      FROM categories c
      LEFT JOIN transactions t ON t.category_id = c.id AND t.type = 'expense'
        AND t.date >= ? AND t.date <= ?
      WHERE c.type = 'expense'
      GROUP BY c.id
      HAVING total > 0
      ORDER BY total DESC
    `).all(dateFrom, dateTo);
  });
}
