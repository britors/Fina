import { ipcMain } from 'electron';
import {
  cancelPairing, confirmPairing, listPairedDevices, revokeDevice, startSyncListener, stopSyncListener,
} from '../mobileSync';
import { optionalNullableString, requireRecord, requireString } from '../ipcValidation';

export function registerMobileSyncHandlers(): void {
  ipcMain.handle('mobileSync:startListener', () => startSyncListener());
  ipcMain.handle('mobileSync:stopListener', () => stopSyncListener());

  ipcMain.handle('mobileSync:confirmPairing', (_e, value: unknown) => {
    const payload = requireRecord(value, 'pairing-payload');
    const sessionId = requireString(payload.sessionId, { name: 'pairing-session', maxLength: 64 });
    const code = requireString(payload.code, { name: 'pairing-code', maxLength: 6, pattern: /^\d{6}$/ });
    const name = requireString(payload.name, { name: 'device-name', maxLength: 120 });
    const owner = optionalNullableString(payload.owner, { name: 'device-owner', maxLength: 120 });
    return confirmPairing(sessionId, code, name, owner);
  });

  ipcMain.handle('mobileSync:cancelPairing', (_e, value: unknown) =>
    cancelPairing(requireString(value, { name: 'pairing-session', maxLength: 64 })),
  );

  ipcMain.handle('mobileSync:listDevices', () => listPairedDevices());

  ipcMain.handle('mobileSync:revokeDevice', (_e, value: unknown) =>
    revokeDevice(requireString(value, { name: 'device-id', maxLength: 64 })),
  );
}
