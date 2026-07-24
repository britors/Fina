import * as path from 'node:path';
import * as fs from 'node:fs';
import { getDb } from './database';
import { performBackup, backupFileName, cleanupOldBackups } from './ipc/backup';

type AutoBackupEvent = 'on_open' | 'on_close' | 'scheduled';

function getSetting(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function setSetting(key: string, value: string): void {
  getDb().prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?,?)').run(key, value);
}

function isScheduleDue(trigger: string, lastIso: string | null): boolean {
  if (!lastIso) return true;
  const diffDays = (Date.now() - new Date(lastIso).getTime()) / 86_400_000;
  if (trigger === 'daily')   return diffDays >= 1;
  if (trigger === 'weekly')  return diffDays >= 7;
  if (trigger === 'monthly') return diffDays >= 30;
  return false;
}

function doBackup(folder: string): void {
  const filePath = path.join(folder, backupFileName());
  performBackup(filePath);
  cleanupOldBackups(folder);
  setSetting('autobackup_last', new Date().toISOString());
  console.log(`[AutoBackup] Backup automático salvo em: ${filePath}`);
}

export function runAutoBackup(event: AutoBackupEvent): void {
  try {
    const trigger = getSetting('autobackup_trigger') ?? 'off';
    const folder  = getSetting('autobackup_folder');
    if (trigger === 'off' || !folder || !fs.existsSync(folder)) return;

    if (event === 'on_open' && trigger === 'on_open') { doBackup(folder); return; }
    if (event === 'on_close' && trigger === 'on_close') { doBackup(folder); return; }
    if (event === 'scheduled' && (trigger === 'daily' || trigger === 'weekly' || trigger === 'monthly')) {
      if (isScheduleDue(trigger, getSetting('autobackup_last'))) doBackup(folder);
    }
  } catch (err) {
    console.error('[AutoBackup] Falha ao gerar backup automático:', err);
  }
}

export function startAutoBackupScheduler(): void {
  runAutoBackup('scheduled');
  setInterval(() => runAutoBackup('scheduled'), 60 * 60 * 1000); // verifica a cada 1 hora
}
