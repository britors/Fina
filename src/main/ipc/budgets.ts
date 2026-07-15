import { ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { getDb } from '../database';
import type { Budget, BudgetWithProgress } from '../../shared/types';
import { CATEGORY_SPENT_MONTH_SQL } from '../categoryHierarchyQueries';

function monthSpent(categoryId: string, month: number, year: number): number {
  const row = getDb().prepare(CATEGORY_SPENT_MONTH_SQL).get(categoryId, categoryId, month, year) as { spent: number };
  return row.spent;
}

function assertNoOverlappingBudget(categoryId: string, month: number, year: number, exceptId?: string): void {
  const db = getDb();
  const category = db.prepare('SELECT parent_id FROM categories WHERE id = ?').get(categoryId) as { parent_id: string | null } | undefined;
  if (!category) throw new Error('Categoria não encontrada.');

  const conflict = category.parent_id
    ? db.prepare(`
        SELECT 1 FROM budgets
        WHERE category_id = ? AND month = ? AND year = ? AND id != COALESCE(?, '')
        LIMIT 1
      `).get(category.parent_id, month, year, exceptId ?? null)
    : db.prepare(`
        SELECT 1 FROM budgets b
        JOIN categories child ON child.id = b.category_id
        WHERE child.parent_id = ? AND b.month = ? AND b.year = ? AND b.id != COALESCE(?, '')
        LIMIT 1
      `).get(categoryId, month, year, exceptId ?? null);

  if (conflict) {
    throw new Error('Não é possível ter orçamento na categoria pai e em uma subcategoria no mesmo mês.');
  }
}

// Saldo do envelope trazido do mês anterior: só existe se o orçamento do mês
// anterior tiver "carry_over" ativado, e é recursivo (o saldo do mês
// anterior já inclui o que ele recebeu do mês antes dele, e assim por
// diante). O limite de profundidade é só uma proteção contra cadeias
// absurdamente longas, não deve ser atingido em uso normal.
function carriedInFor(categoryId: string, month: number, year: number, depth = 0): number {
  if (depth > 36) return 0;
  let prevMonth = month - 1;
  let prevYear = year;
  if (prevMonth === 0) { prevMonth = 12; prevYear -= 1; }

  const prev = getDb().prepare(
    'SELECT * FROM budgets WHERE category_id = ? AND month = ? AND year = ?'
  ).get(categoryId, prevMonth, prevYear) as Budget | undefined;
  if (!prev || !prev.carry_over) return 0;

  const prevSpent = monthSpent(categoryId, prevMonth, prevYear);
  const prevCarriedIn = carriedInFor(categoryId, prevMonth, prevYear, depth + 1);
  return Math.max(0, prev.limit_amount + prevCarriedIn - prevSpent);
}

export function registerBudgetHandlers(): void {
  ipcMain.handle('budgets:list', (_e, params: { month: number; year: number } | undefined) => {
    const rows = params
      ? getDb().prepare(`
          SELECT b.*, c.name as category_name, c.icon as category_icon, c.color as category_color
          FROM budgets b
          JOIN categories c ON b.category_id = c.id
          WHERE b.month = ? AND b.year = ?
          ORDER BY c.name
        `).all(params.month, params.year) as (Budget & { category_name: string; category_icon: string; category_color: string })[]
      : getDb().prepare(`
          SELECT b.*, c.name as category_name, c.icon as category_icon, c.color as category_color
          FROM budgets b
          JOIN categories c ON b.category_id = c.id
          ORDER BY b.year DESC, b.month DESC, c.name
        `).all() as (Budget & { category_name: string; category_icon: string; category_color: string })[];

    return rows.map(b => {
      const spent = monthSpent(b.category_id, b.month, b.year);
      const carriedIn = carriedInFor(b.category_id, b.month, b.year);
      const effectiveLimit = b.limit_amount + carriedIn;

      return {
        ...b,
        spent,
        carried_in: carriedIn,
        percentage: effectiveLimit > 0 ? Math.min((spent / effectiveLimit) * 100, 100) : 0,
      } satisfies BudgetWithProgress;
    });
  });

  ipcMain.handle('budgets:create', (_e, data: Omit<Budget, 'id' | 'created_at' | 'updated_at'>) => {
    assertNoOverlappingBudget(data.category_id, data.month, data.year);
    const id = randomUUID();
    getDb().prepare(
      'INSERT INTO budgets (id, category_id, month, year, limit_amount, carry_over) VALUES (?,?,?,?,?,?)'
    ).run(id, data.category_id, data.month, data.year, data.limit_amount, data.carry_over ? 1 : 0);
    return getDb().prepare('SELECT * FROM budgets WHERE id = ?').get(id);
  });

  ipcMain.handle('budgets:update', (_e, { id, ...data }: Partial<Budget> & { id: string }) => {
    if (!data.category_id || data.month == null || data.year == null) throw new Error('Preencha todos os campos do orçamento.');
    assertNoOverlappingBudget(data.category_id, data.month, data.year, id);
    getDb().prepare(
      `UPDATE budgets SET category_id=?, month=?, year=?, limit_amount=?, carry_over=?, updated_at=datetime('now') WHERE id=?`
    ).run(data.category_id, data.month, data.year, data.limit_amount, data.carry_over ? 1 : 0, id);
    return getDb().prepare('SELECT * FROM budgets WHERE id = ?').get(id);
  });

  ipcMain.handle('budgets:delete', (_e, id: string) => {
    getDb().prepare('DELETE FROM budgets WHERE id = ?').run(id);
  });
}
