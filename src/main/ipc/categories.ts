import { ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { getDb } from '../database';
import type { Category, CategoryType } from '../../shared/types';

type CreatePayload = Omit<Category, 'id' | 'created_at'>;
type UpdatePayload = { id: string } & Partial<CreatePayload>;

export function registerCategoryHandlers(): void {
  ipcMain.handle('categories:list', (_e, type?: CategoryType) => {
    if (type) {
      return getDb().prepare('SELECT * FROM categories WHERE type = ? ORDER BY name').all(type);
    }
    return getDb().prepare('SELECT * FROM categories ORDER BY type, name').all();
  });

  ipcMain.handle('categories:get', (_e, id: string) =>
    getDb().prepare('SELECT * FROM categories WHERE id = ?').get(id) ?? null
  );

  ipcMain.handle('categories:create', (_e, data: CreatePayload) => {
    const id = randomUUID();
    getDb().prepare(
      'INSERT INTO categories (id, name, icon, color, type) VALUES (?,?,?,?,?)'
    ).run(id, data.name, data.icon, data.color, data.type);
    return getDb().prepare('SELECT * FROM categories WHERE id = ?').get(id);
  });

  ipcMain.handle('categories:update', (_e, { id, ...data }: UpdatePayload) => {
    getDb().prepare(
      'UPDATE categories SET name=?, icon=?, color=?, type=? WHERE id=?'
    ).run(data.name, data.icon, data.color, data.type, id);
    return getDb().prepare('SELECT * FROM categories WHERE id = ?').get(id);
  });

  ipcMain.handle('categories:delete', (_e, id: string) => {
    const db = getDb();
    const inUse = db.prepare('SELECT 1 FROM transactions WHERE category_id = ? LIMIT 1').get(id);
    if (inUse) {
      throw new Error('Esta categoria possui transações vinculadas e não pode ser removida.');
    }
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  });
}
