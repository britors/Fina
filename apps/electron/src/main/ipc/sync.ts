import { ipcMain } from 'electron';
import { getSyncStatus, pushSync, pullSync } from '../sync';
import { requireString } from '../ipcValidation';
import { confirmIpcAction } from '../ipcConfirmation';

function syncFolder(value: unknown): string {
  try {
    return requireString(value, { name: 'sync-folder', maxLength: 4_096 });
  } catch {
    throw new Error('Escolha uma pasta antes de sincronizar.');
  }
}

export function registerSyncHandlers(): void {
  ipcMain.handle('sync:status', () => getSyncStatus());

  ipcMain.handle('sync:push', (_e, value: unknown) => {
    const folder = syncFolder(value);
    pushSync(folder);
  });

  ipcMain.handle('sync:pull', async (event, value: unknown) => {
    const folder = syncFolder(value);
    const confirmed = await confirmIpcAction(event, {
      type: 'warning',
      title: 'Sincronização',
      message: 'Receber a versão sincronizada substituirá TODOS os dados atuais deste dispositivo. Deseja continuar?',
      buttons: ['Receber', 'Cancelar'],
      defaultId: 1,
      cancelId: 1,
    });
    if (!confirmed) return;
    pullSync(folder);
  });
}
