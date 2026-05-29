import { ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { getDb } from '../database';
import type { Bill } from '../../shared/types';

function autoMarkOverdue(): void {
  getDb().prepare(
    `UPDATE bills SET status='overdue', updated_at=datetime('now') WHERE status='pending' AND due_date < date('now')`
  ).run();
}

export function registerBillHandlers(): void {
  ipcMain.handle('bills:list', (_e, filters: { status?: string } = {}) => {
    autoMarkOverdue();
    if (filters.status) {
      return getDb().prepare('SELECT * FROM bills WHERE status = ? ORDER BY due_date').all(filters.status);
    }
    return getDb().prepare('SELECT * FROM bills ORDER BY due_date').all();
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
      'INSERT INTO bills (id, description, amount, due_date, status, account_id, recurring) VALUES (?,?,?,?,?,?,?)'
    ).run(id, data.description, data.amount, data.due_date, data.status ?? 'pending', data.account_id ?? null, data.recurring ? 1 : 0);
    return getDb().prepare('SELECT * FROM bills WHERE id = ?').get(id);
  });

  ipcMain.handle('bills:update', (_e, { id, ...data }: Partial<Bill> & { id: string }) => {
    getDb().prepare(
      `UPDATE bills SET description=?, amount=?, due_date=?, status=?, account_id=?, recurring=?, updated_at=datetime('now') WHERE id=?`
    ).run(data.description, data.amount, data.due_date, data.status, data.account_id ?? null, data.recurring ? 1 : 0, id);
    return getDb().prepare('SELECT * FROM bills WHERE id = ?').get(id);
  });

  ipcMain.handle('bills:delete', (_e, id: string) => {
    getDb().prepare('DELETE FROM bills WHERE id = ?').run(id);
  });

  ipcMain.handle('bills:markAsPaid', (_e, id: string) => {
    getDb().prepare(
      `UPDATE bills SET status='paid', updated_at=datetime('now') WHERE id=?`
    ).run(id);
    return getDb().prepare('SELECT * FROM bills WHERE id = ?').get(id);
  });
}
