import { ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { getDb } from '../database';
import type { Account } from '../../shared/types';

type CreatePayload = Omit<Account, 'id' | 'created_at' | 'updated_at'>;
type UpdatePayload = { id: string } & Partial<CreatePayload>;

export function registerAccountHandlers(): void {
  ipcMain.handle('accounts:list', () =>
    getDb().prepare('SELECT * FROM accounts ORDER BY name').all()
  );

  ipcMain.handle('accounts:get', (_e, id: string) =>
    getDb().prepare('SELECT * FROM accounts WHERE id = ?').get(id) ?? null
  );

  ipcMain.handle('accounts:create', (_e, data: CreatePayload) => {
    const id = randomUUID();
    getDb().prepare(
      'INSERT INTO accounts (id, name, type, bank_name, balance, credit_limit, color) VALUES (?,?,?,?,?,?,?)'
    ).run(id, data.name, data.type, data.bank_name ?? null, data.balance ?? 0, data.credit_limit ?? null, data.color ?? null);
    return getDb().prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  });

  ipcMain.handle('accounts:update', (_e, { id, ...data }: UpdatePayload) => {
    getDb().prepare(
      `UPDATE accounts SET name=?, type=?, bank_name=?, balance=?, credit_limit=?, color=?, updated_at=datetime('now') WHERE id=?`
    ).run(data.name, data.type, data.bank_name ?? null, data.balance, data.credit_limit ?? null, data.color ?? null, id);
    return getDb().prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  });

  ipcMain.handle('accounts:delete', (_e, id: string) => {
    getDb().prepare('DELETE FROM accounts WHERE id = ?').run(id);
  });
}
