import { ipcMain, dialog, app } from 'electron';
import * as fs from 'node:fs';
import Database from 'better-sqlite3';
import { getDb, closeDatabase, openDatabase, runMigrations, dbPath } from '../database';

function isValidFinaBackup(filePath: string): boolean {
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
// Reaproveitada pela exportação manual e pelo auto-backup.
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
      title: 'Escolher pasta para o auto-backup',
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

    if (!isValidFinaBackup(filePath)) {
      throw new Error('Arquivo inválido: não é um backup do Fina.');
    }

    const target = dbPath();
    closeDatabase();

    // Guarda uma cópia de segurança do banco atual antes de sobrescrever.
    const safetyCopy = `${target}.bak-${Date.now()}`;
    if (fs.existsSync(target)) fs.copyFileSync(target, safetyCopy);

    // Remove arquivos de WAL/SHM do banco atual: o backup importado é um
    // arquivo único e autocontido, sem journal pendente.
    for (const suffix of ['-wal', '-shm']) {
      if (fs.existsSync(target + suffix)) fs.unlinkSync(target + suffix);
    }

    fs.copyFileSync(filePath, target);
    openDatabase();
    runMigrations();

    // Reinicia o app para garantir que toda a UI releia os dados restaurados.
    setTimeout(() => { app.relaunch(); app.exit(0); }, 800);

    return { imported: true };
  });
}
