import { ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { getDb } from '../database';
import type { Budget, BudgetWithProgress } from '../../shared/types';

export function registerBudgetHandlers(): void {
  ipcMain.handle('budgets:list', (_e, { month, year }: { month: number; year: number }) => {
    const rows = getDb().prepare(`
      SELECT b.*, c.name as category_name, c.icon as category_icon, c.color as category_color
      FROM budgets b
      JOIN categories c ON b.category_id = c.id
      WHERE b.month = ? AND b.year = ?
      ORDER BY c.name
    `).all(month, year) as (Budget & { category_name: string; category_icon: string; category_color: string })[];

    return rows.map(b => {
      const { spent } = getDb().prepare(`
        SELECT COALESCE(SUM(amount), 0) as spent
        FROM transactions
        WHERE category_id = ? AND type = 'expense'
          AND CAST(strftime('%m', date) AS INTEGER) = ?
          AND CAST(strftime('%Y', date) AS INTEGER) = ?
      `).get(b.category_id, b.month, b.year) as { spent: number };

      return {
        ...b,
        spent,
        percentage: b.limit_amount > 0 ? Math.min((spent / b.limit_amount) * 100, 100) : 0,
      } satisfies BudgetWithProgress;
    });
  });

  ipcMain.handle('budgets:create', (_e, data: Omit<Budget, 'id' | 'created_at' | 'updated_at'>) => {
    const id = randomUUID();
    getDb().prepare(
      'INSERT INTO budgets (id, category_id, month, year, limit_amount) VALUES (?,?,?,?,?)'
    ).run(id, data.category_id, data.month, data.year, data.limit_amount);
    return getDb().prepare('SELECT * FROM budgets WHERE id = ?').get(id);
  });

  ipcMain.handle('budgets:update', (_e, { id, ...data }: Partial<Budget> & { id: string }) => {
    getDb().prepare(
      `UPDATE budgets SET category_id=?, month=?, year=?, limit_amount=?, updated_at=datetime('now') WHERE id=?`
    ).run(data.category_id, data.month, data.year, data.limit_amount, id);
    return getDb().prepare('SELECT * FROM budgets WHERE id = ?').get(id);
  });

  ipcMain.handle('budgets:delete', (_e, id: string) => {
    getDb().prepare('DELETE FROM budgets WHERE id = ?').run(id);
  });
}
