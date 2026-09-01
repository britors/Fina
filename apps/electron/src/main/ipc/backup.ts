import { ipcMain, dialog, app } from 'electron';
import { localizeDialogOptions } from '../i18n';
import * as fs from 'node:fs';
import * as path from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { getDb, closeDatabase, openDatabase, reopenWithCurrentCredentials, runMigrations, dbPath, validateDatabaseFile } from '../database';
import { exportPortableIncrementalBackup, getLastIncrementalBackupAt, importIncrementalPatch, incrementalBackupFileName, incrementalCursorNow, setLastIncrementalBackupAt } from '../incrementalBackup';
import { confirmIpcAction } from '../ipcConfirmation';
import { requireRecord, requireString } from '../ipcValidation';

const SQLITE_PLAINTEXT_HEADER = 'SQLite format 3\0';

function readHeader(filePath: string): string {
  const buf = Buffer.alloc(16);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, buf, 0, 16, 0);
  fs.closeSync(fd);
  return buf.toString('utf8');
}

// A validação também abre bancos criptografados com a senha já destravada na
// sessão. Arquivos criptografados sem credencial disponível são recusados,
// pois não há como diferenciá-los de um arquivo aleatório antes de substituir
// o banco atual.
export function isValidFinaBackup(filePath: string): boolean {
  let header: string;
  try {
    header = readHeader(filePath);
  } catch {
    return false;
  }

  if (header !== SQLITE_PLAINTEXT_HEADER) {
    return validateDatabaseFile(filePath) === true;
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
// `beforeReplace`, se informado, roda depois do VACUUM INTO (que pode levar
// segundos num banco grande) e antes da substituição do arquivo final —
// janela em que outra máquina sincronizando a mesma pasta pode ter gravado
// uma versão mais nova; o chamador pode usá-lo para checar de novo e abortar.
export function performBackup(filePath: string, beforeReplace?: () => void): void {
  const target = path.resolve(filePath);
  if (target === path.resolve(dbPath())) {
    throw new Error('O destino do backup não pode ser o próprio banco de dados.');
  }

  // VACUUM INTO exige um destino inexistente. Gere primeiro um arquivo
  // completo temporário; só depois substitua o anterior, para uma falha de
  // disco não destruir o último backup válido.
  const temp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
    getDb().prepare('VACUUM INTO ?').run(temp);
    if (!fs.existsSync(temp) || fs.statSync(temp).size === 0) {
      throw new Error('O backup gerado está vazio.');
    }
    beforeReplace?.();
    try {
      fs.renameSync(temp, filePath);
    } catch (err) {
      // rename não substitui arquivo existente no Windows. O novo backup já
      // está completo neste ponto, então a remoção do antigo é segura.
      const code = (err as NodeJS.ErrnoException).code;
      if (process.platform !== 'win32' || !['EEXIST', 'EPERM', 'ENOTEMPTY'].includes(code ?? '')) throw err;
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      fs.renameSync(temp, filePath);
    }
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

export function backupFileName(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.fin`;
}

const BACKUP_FILE_RE = /^backup-(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})\.fin$/;

function backupFileDate(name: string): Date | null {
  const m = BACKUP_FILE_RE.exec(name);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
}

// Apaga backups automáticos com mais de `maxAgeDays`, mantendo sempre pelo
// menos 1 arquivo na pasta (o mais recente nunca é removido, mesmo se
// estiver vencido).
export function cleanupOldBackups(folder: string, maxAgeDays = 15): void {
  const backups = fs.readdirSync(folder)
    .map(name => ({ name, date: backupFileDate(name) }))
    .filter((entry): entry is { name: string; date: Date } => entry.date !== null)
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  if (backups.length <= 1) return;

  const cutoff = Date.now() - maxAgeDays * 86_400_000;
  for (const { name, date } of backups.slice(1)) {
    if (date.getTime() < cutoff) fs.unlinkSync(path.join(folder, name));
  }
}

// Substitui o banco atual pelo arquivo informado e reinicia o app. Usado
// tanto pela importação manual de backup quanto pela sincronização entre
// dispositivos — ambas trocam um arquivo .fin inteiro, nunca fazem merge.
export function restoreFromFile(filePath: string): void {
  if (!isValidFinaBackup(filePath)) {
    throw new Error('Arquivo inválido: não é um backup do Fina.');
  }

  const target = dbPath();
  if (path.resolve(filePath) === path.resolve(target)) {
    throw new Error('Escolha um arquivo de backup diferente do banco atual.');
  }

  // Gera a cópia de segurança enquanto a conexão ainda está aberta. Copiar
  // apenas o arquivo principal depois de fechar a conexão pode perder páginas
  // que ainda estejam no WAL.
  const safetyCopy = `${target}.bak-${Date.now()}`;
  performBackup(safetyCopy);

  try {
    closeDatabase();

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
    else if (validateDatabaseFile(target) !== true) throw new Error('Não foi possível validar o backup criptografado com a senha atual.');
  } catch (err) {
    // Falhas de cópia, abertura ou migração não podem deixar o app apontando
    // para um banco parcial. Restaura a cópia consistente criada acima.
    try {
      closeDatabase();
      for (const suffix of ['-wal', '-shm']) {
        if (fs.existsSync(target + suffix)) fs.unlinkSync(target + suffix);
      }
      fs.copyFileSync(safetyCopy, target);
      reopenWithCurrentCredentials();
    } catch (rollbackError) {
      console.error('[Backup] Falha também ao restaurar a cópia de segurança:', rollbackError);
    }
    throw err;
  }

  // A cópia só é necessária para rollback durante esta operação. Mantê-la
  // indefinidamente deixaria versões sensíveis antigas espalhadas no disco.
  try { fs.unlinkSync(safetyCopy); } catch { /* a cópia pode ser necessária para recuperação manual */ }

  // Reinicia o app para garantir que toda a UI releia os dados restaurados.
  setTimeout(() => { app.relaunch(); app.exit(0); }, 800);
}

export function registerBackupHandlers(): void {
  ipcMain.handle('backup:export', async () => {
    const { filePath } = await dialog.showSaveDialog(localizeDialogOptions({
      title: 'Exportar backup',
      defaultPath: backupFileName(),
      filters: [{ name: 'Backup Fina', extensions: ['fin'] }],
    }));
    if (!filePath) return null;

    performBackup(filePath);
    return filePath;
  });

  ipcMain.handle('backup:chooseFolder', async () => {
    const { filePaths } = await dialog.showOpenDialog(localizeDialogOptions({
      title: 'Escolher pasta',
      properties: ['openDirectory', 'createDirectory'],
    }));
    return filePaths?.[0] ?? null;
  });

  ipcMain.handle('backup:import', async (event) => {
    const { filePaths } = await dialog.showOpenDialog(localizeDialogOptions({
      title: 'Importar backup',
      filters: [{ name: 'Backup Fina', extensions: ['fin'] }],
      properties: ['openFile'],
    }));
    const filePath = filePaths?.[0];
    if (!filePath) return { imported: false };

    const confirmed = await confirmIpcAction(event, {
      type: 'warning',
      title: 'Importar backup',
      message: 'Importar um backup substituirá TODOS os dados atuais do app. Esta ação não pode ser desfeita. Deseja continuar?',
      buttons: ['Importar', 'Cancelar'],
      defaultId: 1,
      cancelId: 1,
    });
    if (!confirmed) return { imported: false };

    restoreFromFile(filePath);
    return { imported: true };
  });

  ipcMain.handle('backup:exportIncremental', async (_event, value: unknown) => {
    const payload = requireRecord(value, 'patch-payload');
    const password = requireString(payload.password, { name: 'patch-password', maxLength: 1_024 });
    const { filePath } = await dialog.showSaveDialog(localizeDialogOptions({
      title: 'Exportar backup incremental',
      defaultPath: incrementalBackupFileName(),
      filters: [{ name: 'Patch incremental Fina', extensions: ['finpatch'] }],
    }));
    if (!filePath) return null;

    const result = exportPortableIncrementalBackup(getLastIncrementalBackupAt('portable'), filePath, password);
    setLastIncrementalBackupAt(incrementalCursorNow(), 'portable');
    return result;
  });

  ipcMain.handle('backup:importIncremental', async (event, value: unknown) => {
    const payload = requireRecord(value, 'patch-payload');
    const password = requireString(payload.password, { name: 'patch-password', maxLength: 1_024 });
    const { filePaths } = await dialog.showOpenDialog(localizeDialogOptions({
      title: 'Importar backup incremental',
      filters: [{ name: 'Patch incremental Fina', extensions: ['finpatch'] }],
      properties: ['openFile'],
    }));
    const filePath = filePaths?.[0];
    if (!filePath) return { imported: false };

    const confirmed = await confirmIpcAction(event, {
      type: 'warning',
      title: 'Importar backup incremental',
      message: 'Importar um patch incremental? Ele pode atualizar ou remover registros correspondentes ao arquivo. Deseja continuar?',
      buttons: ['Importar', 'Cancelar'],
      defaultId: 1,
      cancelId: 1,
    });
    if (!confirmed) return { imported: false };

    importIncrementalPatch(filePath, password);
    return { imported: true };
  });
}
