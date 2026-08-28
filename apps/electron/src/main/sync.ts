import * as path from 'node:path';
import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
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

interface SyncState {
  lastSyncedMtime?: number;
  lastSyncedHash?: string;
}

function readSyncState(): SyncState {
  try {
    const raw = fs.readFileSync(syncStatePath(), 'utf-8');
    return JSON.parse(raw) as SyncState;
  } catch {
    return {};
  }
}

function fileHash(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function writeSyncState(mtime: number, hash: string): void {
  const target = syncStatePath();
  const temp = `${target}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(temp, JSON.stringify({ lastSyncedMtime: mtime, lastSyncedHash: hash }), { mode: 0o600 });
    fs.chmodSync(temp, 0o600);
    try {
      fs.renameSync(temp, target);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (process.platform !== 'win32' || !['EEXIST', 'EPERM', 'ENOTEMPTY'].includes(code ?? '')) throw err;
      if (fs.existsSync(target)) fs.unlinkSync(target);
      fs.renameSync(temp, target);
    }
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

function syncFilePath(folder: string): string {
  return path.join(folder, SYNC_FILE_NAME);
}

function assertNoRemoteConflict(folder: string): void {
  const filePath = syncFilePath(folder);
  if (!fs.existsSync(filePath)) return;
  const remoteMtime = fs.statSync(filePath).mtimeMs;
  const state = readSyncState();
  const remoteHash = fileHash(filePath);
  if (!state.lastSyncedHash) {
    throw new Error('Confirme a versão da pasta sincronizada recebendo-a uma vez antes de enviar dados locais.');
  }
  if (remoteHash !== state.lastSyncedHash) {
    throw new Error('Existe uma versão mais nova na pasta sincronizada. Receba essa versão antes de enviar dados locais.');
  }
}

export function getSyncStatus(): SyncStatus {
  const enabled = getSetting('sync_enabled') === 'true';
  const folder = getSetting('sync_folder') ?? '';
  const state = readSyncState();
  const lastSyncedMtime = state.lastSyncedMtime ?? null;

  if (!enabled || !folder || !fs.existsSync(folder)) {
    return { enabled, folder, remoteAvailable: false, remoteNewer: false, remoteMtime: null, lastSyncedMtime };
  }

  const filePath = syncFilePath(folder);
  if (!fs.existsSync(filePath)) {
    return { enabled, folder, remoteAvailable: false, remoteNewer: false, remoteMtime: null, lastSyncedMtime };
  }

  const remoteMtime = fs.statSync(filePath).mtimeMs;
  const remoteNewer = state.lastSyncedHash
    ? fileHash(filePath) !== state.lastSyncedHash
    : true;
  return { enabled, folder, remoteAvailable: true, remoteNewer, remoteMtime, lastSyncedMtime };
}

// Envia o estado atual do banco para a pasta compartilhada.
export function pushSync(folder: string): void {
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
    throw new Error('A pasta de sincronização não existe ou não é uma pasta.');
  }
  assertNoRemoteConflict(folder);
  const filePath = syncFilePath(folder);
  // Revalida logo antes de substituir o arquivo remoto: o VACUUM INTO acima
  // pode levar segundos, e outra máquina sincronizando a mesma pasta pode ter
  // gravado uma versão mais nova nesse meio-tempo.
  performBackup(filePath, () => assertNoRemoteConflict(folder));
  writeSyncState(fs.statSync(filePath).mtimeMs, fileHash(filePath));
}

// Substitui o banco atual pela versão da pasta compartilhada e reinicia o
// app (mesmo mecanismo da importação manual de backup).
export function pullSync(folder: string): void {
  const filePath = syncFilePath(folder);
  if (!fs.existsSync(filePath)) throw new Error('Nenhum arquivo de sincronização encontrado na pasta.');
  const remoteMtime = fs.statSync(filePath).mtimeMs;
  const remoteHash = fileHash(filePath);
  restoreFromFile(filePath);
  // Só avance o marcador depois que a validação, cópia e abertura do banco
  // restaurado concluírem sem erro.
  writeSyncState(remoteMtime, remoteHash);
}
