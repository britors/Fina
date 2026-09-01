import * as fs from 'node:fs';

export interface DatabaseRestoreLifecycle {
  closeDatabase(): void;
  openRestoredDatabase(): void;
  reopenPreviousDatabase(): void;
  reportRollbackError?(error: unknown): void;
}

export interface RestoredDatabaseValidation {
  runMigrations(): void;
  validateEncryptedDatabase(): boolean | null;
}

// Mantido separado do driver nativo para que a decisão de segurança seja
// testável no Node do CI. O binding SQLite cifrado é compilado para o ABI do
// Electron e sua abertura real continua coberta pelo adaptador de runtime.
export function validateRestoredDatabase(
  isPlaintext: boolean,
  validation: RestoredDatabaseValidation,
): void {
  if (isPlaintext) {
    validation.runMigrations();
    return;
  }
  if (validation.validateEncryptedDatabase() !== true) {
    throw new Error('Não foi possível validar o backup criptografado com a senha atual.');
  }
}

function removeSidecars(target: string): void {
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = target + suffix;
    if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
  }
}

// Instala um arquivo de banco autocontido. A cópia de segurança deve ter sido
// criada por uma conexão SQLite ainda aberta, para incorporar páginas do WAL.
export function replaceDatabaseFile(
  source: string,
  target: string,
  safetyCopy: string,
  lifecycle: DatabaseRestoreLifecycle,
): void {
  try {
    lifecycle.closeDatabase();
    removeSidecars(target);
    fs.copyFileSync(source, target);
    lifecycle.openRestoredDatabase();
  } catch (error) {
    try {
      lifecycle.closeDatabase();
      removeSidecars(target);
      fs.copyFileSync(safetyCopy, target);
      lifecycle.reopenPreviousDatabase();
    } catch (rollbackError) {
      lifecycle.reportRollbackError?.(rollbackError);
    }
    throw error;
  }

  // Em caso de sucesso não mantenha uma cópia sensível desnecessária. Se a
  // remoção falhar, preserve-a para recuperação manual em vez de falhar um
  // restore que já foi concluído e validado.
  try { fs.unlinkSync(safetyCopy); } catch { /* recuperação manual */ }
}
