import { ipcMain, shell } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { app } from 'electron';
import { getDb } from '../database';
import type { FinancialDocument } from '../../shared/types';

function documentsDir(): string {
  const dir = path.join(app.getPath('userData'), 'documents');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function registerDocumentHandlers(): void {
  ipcMain.handle('documents:list', (): FinancialDocument[] =>
    getDb().prepare('SELECT * FROM financial_documents ORDER BY created_at DESC').all() as FinancialDocument[]
  );

  ipcMain.handle('documents:import', (_event, sourcePath: string): FinancialDocument => {
    if (!sourcePath || !path.isAbsolute(sourcePath) || !fs.existsSync(sourcePath)) throw new Error('Arquivo não encontrado.');
    const id = randomUUID();
    const filename = path.basename(sourcePath).replace(/[\\/]/g, '_');
    const storedPath = path.join(documentsDir(), `${id}-${filename}`);
    fs.copyFileSync(sourcePath, storedPath);
    const hash = createHash('sha256').update(fs.readFileSync(storedPath)).digest('hex');
    const stat = fs.statSync(storedPath);
    const doc = { id, filename, stored_path: storedPath, mime_type: null, size_bytes: stat.size, sha256: hash };
    try {
      getDb().prepare('INSERT INTO financial_documents (id, filename, stored_path, mime_type, size_bytes, sha256) VALUES (?,?,?,?,?,?)').run(id, filename, storedPath, null, stat.size, hash);
    } catch (error) {
      fs.rmSync(storedPath, { force: true });
      throw error;
    }
    return { ...doc, mime_type: null, created_at: new Date().toISOString() };
  });

  ipcMain.handle('documents:delete', (_event, id: string) => {
    const doc = getDb().prepare('SELECT stored_path FROM financial_documents WHERE id = ?').get(id) as { stored_path: string } | undefined;
    if (!doc) return false;
    getDb().prepare('DELETE FROM financial_documents WHERE id = ?').run(id);
    fs.rmSync(doc.stored_path, { force: true });
    return true;
  });

  ipcMain.handle('documents:open', async (_event, id: string) => {
    const doc = getDb().prepare('SELECT stored_path FROM financial_documents WHERE id = ?').get(id) as { stored_path: string } | undefined;
    if (!doc || !fs.existsSync(doc.stored_path)) throw new Error('Documento não encontrado.');
    await shell.openPath(doc.stored_path);
    return true;
  });
}
