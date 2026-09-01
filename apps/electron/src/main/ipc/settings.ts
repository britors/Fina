import { ipcMain } from 'electron';
import { getDb } from '../database';
import { deleteLocalSecret, getLocalSecret, setLocalSecret } from '../localSecrets';
import { filterPublicSettings, validatePublicSettingEntries } from '../settingsPolicy';
import { auditMoneyShadowConsistency } from '../moneyMigrationAudit';

function migrateLegacySmtpPassword(): void {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get('smtp_pass') as { value: string } | undefined;
  if (!row?.value) return;
  if (getLocalSecret('smtp_pass')) {
    getDb().prepare('UPDATE app_settings SET value = ? WHERE key = ?').run('', 'smtp_pass');
    return;
  }
  try {
    setLocalSecret('smtp_pass', row.value);
    getDb().prepare('UPDATE app_settings SET value = ? WHERE key = ?').run('', 'smtp_pass');
  } catch {
    // Não mantenha credenciais em app_settings quando o cofre do sistema não
    // estiver disponível. O usuário poderá cadastrá-la novamente quando o
    // ambiente oferecer armazenamento seguro.
    getDb().prepare('UPDATE app_settings SET value = ? WHERE key = ?').run('', 'smtp_pass');
  }
}

function persistEntries(entries: Record<string, string>): void {
  const { smtp_pass, ...regularEntries } = entries;
  if (typeof smtp_pass === 'string' && smtp_pass.trim()) {
    setLocalSecret('smtp_pass', smtp_pass);
  }
  const kvs = Object.entries(regularEntries);
  if (kvs.length === 0) return;
  const stmt = getDb().prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?,?)');
  const tx = getDb().transaction((items: [string, string][]) => {
    for (const [key, value] of items) stmt.run(key, value);
  });
  tx(kvs);
}

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:moneyDiagnostic', () => auditMoneyShadowConsistency(getDb()));

  ipcMain.handle('settings:getAll', () => {
    migrateLegacySmtpPassword();
    const rows = getDb()
      .prepare('SELECT key, value FROM app_settings')
      .all() as { key: string; value: string }[];
    const result = filterPublicSettings(rows);
    // Senhas ficam somente no cofre do sistema e nunca atravessam o IPC.
    result.smtp_pass = '';
    return result;
  });

  ipcMain.handle('settings:set', (_e, payload: unknown) => {
    const raw = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
    if (typeof raw.key !== 'string') throw new Error('settings-payload-invalid');
    persistEntries(validatePublicSettingEntries({ [raw.key]: raw.value }));
  });

  ipcMain.handle('settings:setMany', (_e, entries: unknown) => {
    persistEntries(validatePublicSettingEntries(entries));
  });

  ipcMain.handle('settings:clearSmtpPassword', () => {
    deleteLocalSecret('smtp_pass');
    getDb().prepare('UPDATE app_settings SET value = ? WHERE key = ?').run('', 'smtp_pass');
    return true;
  });
}
