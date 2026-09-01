import { ipcMain } from 'electron';
import {
  unlockDatabase,
  isEncryptionActive,
  enableEncryption,
  changeEncryptionPassword,
  disableEncryption,
} from '../database';
import { localizeMainText } from '../i18n';
import { requireRecord, requireString } from '../ipcValidation';

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
  ipcMain.handle('security:unlock', (_e, value: unknown) => {
    const password = requireString(value, { name: 'password', allowEmpty: true, maxLength: 1_024 });
    const now = Date.now();
    if (now < unlockBlockedUntil) {
      console.warn(`[Security] tentativa de unlock bloqueada por throttle (${unlockFailures} falhas consecutivas)`);
      throw new Error(localizeMainText('Muitas tentativas incorretas. Aguarde alguns segundos antes de tentar de novo.'));
    }
    const ok = unlockDatabase(password ?? '');
    if (ok) {
      if (unlockFailures > 0) console.log(`[Security] unlock ok após ${unlockFailures} falha(s)`);
      unlockFailures = 0;
      unlockBlockedUntil = 0;
    } else {
      unlockFailures++;
      if (unlockFailures > UNLOCK_FREE_ATTEMPTS) {
        const delay = Math.min(UNLOCK_MAX_DELAY_MS, UNLOCK_BASE_DELAY_MS * 2 ** (unlockFailures - UNLOCK_FREE_ATTEMPTS));
        unlockBlockedUntil = Date.now() + delay;
        console.warn(`[Security] unlock falhou ${unlockFailures}x seguidas, throttle de ${delay}ms ativado`);
      }
    }
    return ok;
  });
}

export function registerSecurityHandlers(): void {
  ipcMain.handle('security:status', () => ({ active: isEncryptionActive() }));

  ipcMain.handle('security:enable', (_e, value: unknown) => {
    const password = requireString(value, { name: 'password', maxLength: 1_024 });
    if (!password || password.length < 8) throw new Error('Use uma senha de pelo menos 8 caracteres.');
    enableEncryption(password);
  });

  ipcMain.handle('security:changePassword', (_e, value: unknown) => {
    const payload = requireRecord(value, 'password-payload');
    const oldPassword = requireString(payload.oldPassword, { name: 'old-password', allowEmpty: true, maxLength: 1_024 });
    const newPassword = requireString(payload.newPassword, { name: 'new-password', maxLength: 1_024 });
    if (!newPassword || newPassword.length < 8) throw new Error('Use uma senha de pelo menos 8 caracteres.');
    changeEncryptionPassword(oldPassword ?? '', newPassword);
  });

  ipcMain.handle('security:disable', (_e, value: unknown) => {
    const currentPasswordInput = requireString(value, { name: 'password', allowEmpty: true, maxLength: 1_024 });
    disableEncryption(currentPasswordInput ?? '');
  });
}
