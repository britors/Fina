import { ipcMain } from 'electron';
import {
  cancelPairing, confirmPairing, listPairedDevices, revokeDevice, startSyncListener, stopSyncListener,
} from '../mobileSync';

export function registerMobileSyncHandlers(): void {
  ipcMain.handle('mobileSync:startListener', () => startSyncListener());
  ipcMain.handle('mobileSync:stopListener', () => stopSyncListener());

  ipcMain.handle('mobileSync:confirmPairing', (_e, { sessionId, code, name, owner }: {
    sessionId: string; code: string; name: string; owner: string | null;
  }) => confirmPairing(sessionId, code, name, owner));

  ipcMain.handle('mobileSync:cancelPairing', (_e, sessionId: string) => cancelPairing(sessionId));

  ipcMain.handle('mobileSync:listDevices', () => listPairedDevices());

  ipcMain.handle('mobileSync:revokeDevice', (_e, id: string) => revokeDevice(id));
}
