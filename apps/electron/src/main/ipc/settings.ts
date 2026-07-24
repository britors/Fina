import { ipcMain } from 'electron';
import { getDb } from '../database';

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:getAll', () => {
    const rows = getDb()
      .prepare('SELECT key, value FROM app_settings')
      .all() as { key: string; value: string }[];
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  });

  ipcMain.handle('settings:set', (_e, { key, value }: { key: string; value: string }) => {
    getDb()
      .prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?,?)')
      .run(key, value);
  });

  ipcMain.handle('settings:setMany', (_e, entries: Record<string, string>) => {
    const stmt = getDb().prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?,?)');
    const tx = getDb().transaction((kvs: [string, string][]) => {
      for (const [k, v] of kvs) stmt.run(k, v);
    });
    tx(Object.entries(entries));
  });
}
