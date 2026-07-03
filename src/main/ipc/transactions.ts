import { ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { getDb } from '../database';
import type { Transaction, TransactionFilters, TransactionType } from '../../shared/types';

const JOIN = `
  SELECT t.*, a.name as account_name,
    c.name as category_name, c.icon as category_icon, c.color as category_color
  FROM transactions t
  JOIN accounts a ON t.account_id = a.id
  JOIN categories c ON t.category_id = c.id
`;

export function balanceDelta(type: TransactionType, amount: number): number {
  return type === 'income' ? amount : -amount;
}

// Para cartão de crédito, "balance" representa a fatura (dívida), não caixa:
// uma despesa deve aumentar o valor devido, e não diminuí-lo como numa conta
// corrente. Por isso o delta é invertido para contas do tipo credit_card.
export function adjustBalance(accountId: string, delta: number): void {
  const db = getDb();
  const account = db.prepare('SELECT type FROM accounts WHERE id = ?').get(accountId) as { type: string } | undefined;
  const signedDelta = account?.type === 'credit_card' ? -delta : delta;
  db.prepare(`UPDATE accounts SET balance = balance + ?, updated_at = datetime('now') WHERE id = ?`)
    .run(signedDelta, accountId);
}

// Transferências movem dinheiro entre duas contas: debita a origem e credita o
// destino, em vez de simplesmente desaparecer como uma despesa comum.
function applyBalanceEffect(
  tx: { account_id: string; to_account_id?: string | null; type: TransactionType; amount: number },
  sign: 1 | -1,
): void {
  if (tx.type === 'transfer' && tx.to_account_id) {
    adjustBalance(tx.account_id, -tx.amount * sign);
    adjustBalance(tx.to_account_id, tx.amount * sign);
  } else {
    adjustBalance(tx.account_id, balanceDelta(tx.type, tx.amount) * sign);
  }
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
    if (filters.account_id)  { conds.push('t.account_id = ?');  params.push(filters.account_id); }
    if (filters.category_id) { conds.push('t.category_id = ?'); params.push(filters.category_id); }
    if (filters.type)        { conds.push('t.type = ?');        params.push(filters.type); }
    if (filters.status)      { conds.push('t.status = ?');      params.push(filters.status); }

    const limit  = filters.limit  ?? 200;
    const offset = filters.offset ?? 0;

    return getDb()
      .prepare(`${JOIN} WHERE ${conds.join(' AND ')} ORDER BY t.date DESC, t.created_at DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset);
  });

  ipcMain.handle('transactions:get', (_e, id: string) =>
    getDb().prepare(`${JOIN} WHERE t.id = ?`).get(id) ?? null
  );

  ipcMain.handle('transactions:create', (_e, data: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>) => {
    if (data.type === 'transfer' && (!data.to_account_id || data.to_account_id === data.account_id)) {
      throw new Error('Selecione uma conta de destino diferente da conta de origem para a transferência.');
    }
    const id = randomUUID();
    const db = getDb();
    db.transaction(() => {
      db.prepare(
        'INSERT INTO transactions (id, account_id, to_account_id, category_id, description, amount, type, date, status, notes, recurring) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
      ).run(id, data.account_id, data.to_account_id ?? null, data.category_id, data.description, data.amount, data.type, data.date, data.status, data.notes ?? null, data.recurring ? 1 : 0);
      if (data.status === 'confirmed') {
        applyBalanceEffect(data, 1);
      }
    })();
    return db.prepare(`${JOIN} WHERE t.id = ?`).get(id);
  });

  ipcMain.handle('transactions:update', (_e, { id, ...data }: Partial<Transaction> & { id: string }) => {
    if (data.type === 'transfer' && (!data.to_account_id || data.to_account_id === data.account_id)) {
      throw new Error('Selecione uma conta de destino diferente da conta de origem para a transferência.');
    }
    const db = getDb();
    db.transaction(() => {
      const old = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as Transaction | undefined;
      db.prepare(
        `UPDATE transactions SET account_id=?, to_account_id=?, category_id=?, description=?, amount=?, type=?, date=?, status=?, notes=?, recurring=?, updated_at=datetime('now') WHERE id=?`
      ).run(data.account_id, data.to_account_id ?? null, data.category_id, data.description, data.amount, data.type, data.date, data.status, data.notes ?? null, data.recurring ? 1 : 0, id);

      if (old) {
        const wasConfirmed = old.status === 'confirmed';
        const isConfirmed  = data.status === 'confirmed';

        if (wasConfirmed) {
          // Reverte o efeito anterior
          applyBalanceEffect(old, -1);
        }
        if (isConfirmed) {
          // Aplica o novo efeito
          applyBalanceEffect({
            account_id: data.account_id!,
            to_account_id: data.to_account_id,
            type: data.type!,
            amount: data.amount!,
          }, 1);
        }
      }
    })();
    return db.prepare(`${JOIN} WHERE t.id = ?`).get(id);
  });

  ipcMain.handle('transactions:delete', (_e, id: string) => {
    const db = getDb();
    db.transaction(() => {
      const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as Transaction | undefined;
      db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
      if (tx?.status === 'confirmed') {
        applyBalanceEffect(tx, -1);
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
