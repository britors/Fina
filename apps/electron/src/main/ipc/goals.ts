import { ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { getDb } from '../database';
import type { Goal } from '../../shared/types';

type CreatePayload = Omit<Goal, 'id' | 'created_at' | 'updated_at'>;

export function registerGoalHandlers(): void {
  ipcMain.handle('goals:list', () =>
    getDb().prepare(`SELECT * FROM goals ORDER BY target_date ASC NULLS LAST, name`).all()
  );

  ipcMain.handle('goals:create', (_e, data: CreatePayload) => {
    const id = randomUUID();
    getDb().prepare(`
      INSERT INTO goals (id, name, type, target_amount, current_amount, target_date, account_id, description)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(id, data.name, data.type, data.target_amount ?? 0, data.current_amount ?? 0,
           data.target_date ?? null, data.account_id ?? null, data.description ?? null);
    return getDb().prepare('SELECT * FROM goals WHERE id = ?').get(id);
  });

  ipcMain.handle('goals:update', (_e, { id, ...data }: Partial<CreatePayload> & { id: string }) => {
    getDb().prepare(`
      UPDATE goals SET name=?, type=?, target_amount=?, current_amount=?,
        target_date=?, account_id=?, description=?, updated_at=datetime('now')
      WHERE id=?
    `).run(data.name, data.type, data.target_amount, data.current_amount,
           data.target_date ?? null, data.account_id ?? null, data.description ?? null, id);
    return getDb().prepare('SELECT * FROM goals WHERE id = ?').get(id);
  });

  ipcMain.handle('goals:delete', (_e, id: string) =>
    getDb().prepare('DELETE FROM goals WHERE id = ?').run(id)
  );
}
