import { ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { getDb } from '../database';
import type { Asset } from '../../shared/types';

type CreatePayload = Omit<Asset, 'id' | 'created_at' | 'updated_at'>;

export function registerAssetHandlers(): void {
  ipcMain.handle('assets:list', () =>
    getDb().prepare('SELECT * FROM assets ORDER BY type, name').all()
  );

  ipcMain.handle('assets:create', (_e, data: CreatePayload) => {
    const id = randomUUID();
    getDb().prepare(`
      INSERT INTO assets (id, name, type, acquisition_value, current_value, acquisition_date, description)
      VALUES (?,?,?,?,?,?,?)
    `).run(id, data.name, data.type, data.acquisition_value ?? 0, data.current_value ?? 0,
           data.acquisition_date ?? null, data.description ?? null);
    return getDb().prepare('SELECT * FROM assets WHERE id = ?').get(id);
  });

  ipcMain.handle('assets:update', (_e, { id, ...data }: Partial<CreatePayload> & { id: string }) => {
    getDb().prepare(`
      UPDATE assets SET name=?, type=?, acquisition_value=?, current_value=?,
        acquisition_date=?, description=?, updated_at=datetime('now') WHERE id=?
    `).run(data.name, data.type, data.acquisition_value, data.current_value,
           data.acquisition_date ?? null, data.description ?? null, id);
    return getDb().prepare('SELECT * FROM assets WHERE id = ?').get(id);
  });

  ipcMain.handle('assets:delete', (_e, id: string) =>
    getDb().prepare('DELETE FROM assets WHERE id = ?').run(id)
  );

  ipcMain.handle('assets:getSummary', () => {
    const rows = getDb().prepare(`
      SELECT type, SUM(current_value) as total FROM assets GROUP BY type
    `).all() as { type: string; total: number }[];
    const total = rows.reduce((s, r) => s + r.total, 0);
    return { total, by_type: rows };
  });
}
