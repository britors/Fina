import { ipcMain, dialog, app } from 'electron';
import * as fs from 'node:fs';
import Database from 'better-sqlite3-multiple-ciphers';
import { getDb, closeDatabase, openDatabase, runMigrations, dbPath } from '../database';

const SQLITE_PLAINTEXT_HEADER = 'SQLite format 3\0';

function readHeader(filePath: string): string {
  const buf = Buffer.alloc(16);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, buf, 0, 16, 0);
  fs.closeSync(fd);
  return buf.toString('utf8');
}

// Backups criptografados têm o cabeçalho embaralhado e não podem ser
// validados sem a senha (que só é pedida depois do reinício, na tela de
// desbloqueio). Nesse caso deixamos passar de forma otimista: se o arquivo
// não for mesmo um banco do Fina, a tela de desbloqueio nunca vai aceitar
// nenhuma senha, e a cópia de segurança feita antes de sobrescrever
// (ver `${target}.bak-*`) permite reverter manualmente.
export function isValidFinaBackup(filePath: string): boolean {
  let header: string;
  try {
    header = readHeader(filePath);
  } catch {
    return false;
  }

  if (header !== SQLITE_PLAINTEXT_HEADER) {
    return fs.statSync(filePath).size > 0;
  }

  let check: Database.Database | null = null;
  try {
    check = new Database(filePath, { readonly: true, fileMustExist: true });
    const hasMigrations = check.prepare(
      `SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'`
    ).get();
    return !!hasMigrations;
  } catch {
    return false;
  } finally {
    check?.close();
  }
}

// Grava uma cópia consistente e autocontida do banco no caminho informado.
// Reaproveitada pela exportação manual, pelo auto-backup e pela sincronização.
export function performBackup(filePath: string): void {
  // VACUUM INTO exige que o arquivo de destino ainda não exista.
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  getDb().prepare('VACUUM INTO ?').run(filePath);
}

export function backupFileName(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.fin`;
}

// Substitui o banco atual pelo arquivo informado e reinicia o app. Usado
// tanto pela importação manual de backup quanto pela sincronização entre
// dispositivos — ambas trocam um arquivo .fin inteiro, nunca fazem merge.
export function restoreFromFile(filePath: string): void {
  if (!isValidFinaBackup(filePath)) {
    throw new Error('Arquivo inválido: não é um backup do Fina.');
  }

  const target = dbPath();
  closeDatabase();

  // Guarda uma cópia de segurança do banco atual antes de sobrescrever.
  const safetyCopy = `${target}.bak-${Date.now()}`;
  if (fs.existsSync(target)) fs.copyFileSync(target, safetyCopy);

  // Remove arquivos de WAL/SHM do banco atual: o arquivo restaurado é único
  // e autocontido, sem journal pendente.
  for (const suffix of ['-wal', '-shm']) {
    if (fs.existsSync(target + suffix)) fs.unlinkSync(target + suffix);
  }

  fs.copyFileSync(filePath, target);

  // Se o arquivo restaurado estiver criptografado, não dá pra rodar
  // migrações aqui sem a senha — o relaunch abaixo passa pela tela de
  // desbloqueio normal, que roda as migrações depois de destravado.
  openDatabase();
  if (readHeader(target) === SQLITE_PLAINTEXT_HEADER) runMigrations();

  // Reinicia o app para garantir que toda a UI releia os dados restaurados.
  setTimeout(() => { app.relaunch(); app.exit(0); }, 800);
}

export function registerBackupHandlers(): void {
  ipcMain.handle('backup:export', async () => {
    const { filePath } = await dialog.showSaveDialog({
      title: 'Exportar backup',
      defaultPath: backupFileName(),
      filters: [{ name: 'Backup Fina', extensions: ['fin'] }],
    });
    if (!filePath) return null;

    performBackup(filePath);
    return filePath;
  });

  ipcMain.handle('backup:chooseFolder', async () => {
    const { filePaths } = await dialog.showOpenDialog({
      title: 'Escolher pasta',
      properties: ['openDirectory', 'createDirectory'],
    });
    return filePaths?.[0] ?? null;
  });

  ipcMain.handle('backup:import', async () => {
    const { filePaths } = await dialog.showOpenDialog({
      title: 'Importar backup',
      filters: [{ name: 'Backup Fina', extensions: ['fin'] }],
      properties: ['openFile'],
    });
    const filePath = filePaths?.[0];
    if (!filePath) return { imported: false };

    restoreFromFile(filePath);
    return { imported: true };
  });
}
