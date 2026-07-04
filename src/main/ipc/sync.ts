import { ipcMain } from 'electron';
import { getSyncStatus, pushSync, pullSync } from '../sync';

export function registerSyncHandlers(): void {
  ipcMain.handle('sync:status', () => getSyncStatus());

  ipcMain.handle('sync:push', (_e, folder: string) => {
    if (!folder) throw new Error('Escolha uma pasta antes de sincronizar.');
    pushSync(folder);
  });

  ipcMain.handle('sync:pull', (_e, folder: string) => {
    if (!folder) throw new Error('Escolha uma pasta antes de sincronizar.');
    pullSync(folder);
  });
}
