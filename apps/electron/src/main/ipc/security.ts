import { ipcMain } from 'electron';
import {
  unlockDatabase,
  isEncryptionActive,
  enableEncryption,
  changeEncryptionPassword,
  disableEncryption,
} from '../database';
import { localizeMainText } from '../i18n';

// As primeiras tentativas erradas não têm custo, mas a partir daí o atraso
// cresce exponencialmente — não impede um ataque offline (que depende só do
// KDF do SQLCipher), mas trava tentativas automatizadas repetidas na própria
// tela de desbloqueio.
const UNLOCK_FREE_ATTEMPTS = 5;
const UNLOCK_BASE_DELAY_MS = 1_000;
const UNLOCK_MAX_DELAY_MS = 30_000;

let unlockFailures = 0;
let unlockBlockedUntil = 0;

// Registrado bem cedo, antes da tela de desbloqueio carregar (ver index.ts).
export function registerUnlockHandler(): void {
  ipcMain.handle('security:unlock', (_e, password: string) => {
    const now = Date.now();
    if (now < unlockBlockedUntil) {
      throw new Error(localizeMainText('Muitas tentativas incorretas. Aguarde alguns segundos antes de tentar de novo.'));
    }
    const ok = unlockDatabase(password ?? '');
    if (ok) {
      unlockFailures = 0;
      unlockBlockedUntil = 0;
    } else {
      unlockFailures++;
      if (unlockFailures > UNLOCK_FREE_ATTEMPTS) {
        const delay = Math.min(UNLOCK_MAX_DELAY_MS, UNLOCK_BASE_DELAY_MS * 2 ** (unlockFailures - UNLOCK_FREE_ATTEMPTS));
        unlockBlockedUntil = Date.now() + delay;
      }
    }
    return ok;
  });
}

export function registerSecurityHandlers(): void {
  ipcMain.handle('security:status', () => ({ active: isEncryptionActive() }));

  ipcMain.handle('security:enable', (_e, password: string) => {
    if (!password || password.length < 8) throw new Error('Use uma senha de pelo menos 8 caracteres.');
    enableEncryption(password);
  });

  ipcMain.handle('security:changePassword', (_e, { oldPassword, newPassword }: { oldPassword: string; newPassword: string }) => {
    if (!newPassword || newPassword.length < 8) throw new Error('Use uma senha de pelo menos 8 caracteres.');
    changeEncryptionPassword(oldPassword ?? '', newPassword);
  });

  ipcMain.handle('security:disable', (_e, currentPasswordInput: string) => {
    disableEncryption(currentPasswordInput ?? '');
  });
}
