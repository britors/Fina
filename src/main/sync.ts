import * as path from 'node:path';
import * as fs from 'node:fs';
import { app } from 'electron';
import { getDb } from './database';
import { performBackup, restoreFromFile } from './ipc/backup';

const SYNC_FILE_NAME = 'fina-sync.fin';

export interface SyncStatus {
  enabled: boolean;
  folder: string;
  remoteAvailable: boolean;
  remoteNewer: boolean;
  remoteMtime: number | null;
  lastSyncedMtime: number | null;
}

function getSetting(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

// Guardado fora do banco (não é sincronizado, não é apagado por uma
// restauração): registra o mtime do arquivo remoto na última vez que este
// dispositivo enviou ou recebeu uma sincronização, para saber se a versão
// na pasta compartilhada é mais nova do que a que já vimos.
function syncStatePath(): string {
  return path.join(app.getPath('userData'), 'sync-state.json');
}

function readLastSyncedMtime(): number | null {
  try {
    const raw = fs.readFileSync(syncStatePath(), 'utf-8');
    const parsed = JSON.parse(raw) as { lastSyncedMtime?: number };
    return parsed.lastSyncedMtime ?? null;
  } catch {
    return null;
  }
}

function writeLastSyncedMtime(mtime: number): void {
  fs.writeFileSync(syncStatePath(), JSON.stringify({ lastSyncedMtime: mtime }));
}

function syncFilePath(folder: string): string {
  return path.join(folder, SYNC_FILE_NAME);
}

export function getSyncStatus(): SyncStatus {
  const enabled = getSetting('sync_enabled') === 'true';
  const folder = getSetting('sync_folder') ?? '';
  const lastSyncedMtime = readLastSyncedMtime();

  if (!enabled || !folder || !fs.existsSync(folder)) {
    return { enabled, folder, remoteAvailable: false, remoteNewer: false, remoteMtime: null, lastSyncedMtime };
  }

  const filePath = syncFilePath(folder);
  if (!fs.existsSync(filePath)) {
    return { enabled, folder, remoteAvailable: false, remoteNewer: false, remoteMtime: null, lastSyncedMtime };
  }

  const remoteMtime = fs.statSync(filePath).mtimeMs;
  const remoteNewer = lastSyncedMtime === null || remoteMtime > lastSyncedMtime;
  return { enabled, folder, remoteAvailable: true, remoteNewer, remoteMtime, lastSyncedMtime };
}

// Envia o estado atual do banco para a pasta compartilhada.
export function pushSync(folder: string): void {
  const filePath = syncFilePath(folder);
  performBackup(filePath);
  writeLastSyncedMtime(fs.statSync(filePath).mtimeMs);
}

// Substitui o banco atual pela versão da pasta compartilhada e reinicia o
// app (mesmo mecanismo da importação manual de backup).
export function pullSync(folder: string): void {
  const filePath = syncFilePath(folder);
  if (!fs.existsSync(filePath)) throw new Error('Nenhum arquivo de sincronização encontrado na pasta.');
  writeLastSyncedMtime(fs.statSync(filePath).mtimeMs);
  restoreFromFile(filePath);
}
