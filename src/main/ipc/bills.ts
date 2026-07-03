import { ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { getDb } from '../database';
import { adjustBalance } from './transactions';
import type { Bill, BillInterval } from '../../shared/types';

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
function addInterval(dueDate: string, interval: BillInterval, multiplier: number): string {
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

export function registerBillHandlers(): void {
  ipcMain.handle('bills:list', (_e, filters: { status?: string; dateFrom?: string; dateTo?: string; category_id?: string } = {}) => {
    autoMarkOverdue();
    const conds: string[] = ['1=1'];
    const params: unknown[] = [];
    if (filters.status)      { conds.push('b.status = ?');      params.push(filters.status); }
    if (filters.dateFrom)    { conds.push('b.due_date >= ?');   params.push(filters.dateFrom); }
    if (filters.dateTo)      { conds.push('b.due_date <= ?');   params.push(filters.dateTo); }
    if (filters.category_id) { conds.push('b.category_id = ?'); params.push(filters.category_id); }
    return getDb().prepare(`
      SELECT b.*, c.name as category_name, c.icon as category_icon, c.color as category_color
      FROM bills b
      LEFT JOIN categories c ON b.category_id = c.id
      WHERE ${conds.join(' AND ')}
      ORDER BY b.due_date
    `).all(...params);
  });

  ipcMain.handle('bills:getUpcoming', (_e, days = 30) => {
    autoMarkOverdue();
    return getDb().prepare(
      `SELECT * FROM bills WHERE status != 'paid' AND due_date <= date('now', '+' || ? || ' days') ORDER BY due_date`
    ).all(days);
  });

  ipcMain.handle('bills:create', (_e, data: Omit<Bill, 'id' | 'created_at' | 'updated_at'>) => {
    const id = randomUUID();
    getDb().prepare(
      'INSERT INTO bills (id, description, amount, due_date, status, account_id, category_id, recurring) VALUES (?,?,?,?,?,?,?,?)'
    ).run(id, data.description, data.amount, data.due_date, data.status ?? 'pending', data.account_id ?? null, data.category_id ?? null, data.recurring ? 1 : 0);
    return getDb().prepare('SELECT * FROM bills WHERE id = ?').get(id);
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
        createdIds.push(newId);
      }
    })();

    return db.prepare(`SELECT * FROM bills WHERE id IN (${createdIds.map(() => '?').join(',')}) ORDER BY due_date`).all(...createdIds);
  });

  ipcMain.handle('bills:update', (_e, { id, ...data }: Partial<Bill> & { id: string }) => {
    getDb().prepare(
      `UPDATE bills SET description=?, amount=?, due_date=?, status=?, account_id=?, category_id=?, recurring=?, updated_at=datetime('now') WHERE id=?`
    ).run(data.description, data.amount, data.due_date, data.status, data.account_id ?? null, data.category_id ?? null, data.recurring ? 1 : 0, id);
    return getDb().prepare('SELECT * FROM bills WHERE id = ?').get(id);
  });

  ipcMain.handle('bills:delete', (_e, id: string) => {
    getDb().prepare('DELETE FROM bills WHERE id = ?').run(id);
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
  ipcMain.handle('bills:markAsPaid', (_e, { id, category_id, date }: { id: string; category_id?: string; date?: string }) => {
    const db = getDb();
    const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(id) as Bill | undefined;
    if (!bill) return null;
    if (bill.status === 'paid') return bill;
    if (!bill.account_id) {
      throw new Error('Defina uma conta para esta despesa antes de marcá-la como paga.');
    }
    const finalCategoryId = category_id || bill.category_id;
    if (!finalCategoryId) {
      throw new Error('Selecione uma categoria para o lançamento.');
    }

    const paidAt = date ?? new Date().toISOString().slice(0, 10);

    db.transaction(() => {
      if (bill.recurring) {
        adjustBalance(bill.account_id!, -bill.amount);
        db.prepare(`UPDATE bills SET status='paid', updated_at=datetime('now') WHERE id=?`).run(id);
        return;
      }

      const txId = randomUUID();
      db.prepare(
        'INSERT INTO transactions (id, account_id, category_id, description, amount, type, date, status, notes, recurring) VALUES (?,?,?,?,?,?,?,?,?,0)'
      ).run(txId, bill.account_id, finalCategoryId, bill.description, bill.amount, 'expense', paidAt, 'confirmed', null);
      adjustBalance(bill.account_id!, -bill.amount);
      db.prepare('DELETE FROM bills WHERE id = ?').run(id);
    })();

    return db.prepare('SELECT * FROM bills WHERE id = ?').get(id) ?? null;
  });
}
