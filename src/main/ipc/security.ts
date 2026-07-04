import { ipcMain } from 'electron';
import {
  unlockDatabase,
  isEncryptionActive,
  enableEncryption,
  changeEncryptionPassword,
  disableEncryption,
} from '../database';

// Registrado bem cedo, antes da tela de desbloqueio carregar (ver index.ts).
export function registerUnlockHandler(): void {
  ipcMain.handle('security:unlock', (_e, password: string) => unlockDatabase(password ?? ''));
}

export function registerSecurityHandlers(): void {
  ipcMain.handle('security:status', () => ({ active: isEncryptionActive() }));

  ipcMain.handle('security:enable', (_e, password: string) => {
    if (!password || password.length < 4) throw new Error('Use uma senha de pelo menos 4 caracteres.');
    enableEncryption(password);
  });

  ipcMain.handle('security:changePassword', (_e, { oldPassword, newPassword }: { oldPassword: string; newPassword: string }) => {
    if (!newPassword || newPassword.length < 4) throw new Error('Use uma senha de pelo menos 4 caracteres.');
    changeEncryptionPassword(oldPassword ?? '', newPassword);
  });

  ipcMain.handle('security:disable', (_e, currentPasswordInput: string) => {
    disableEncryption(currentPasswordInput ?? '');
  });
}
