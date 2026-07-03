import { ipcMain } from 'electron';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { getDb } from '../database';
import { parseOFX } from '../import/ofx-parser';
import { parseCSV } from '../import/csv-parser';
import { adjustBalance, balanceDelta } from './transactions';
import type { ImportPreview, ImportPreviewRow, TransactionType } from '../../shared/types';

function txHash(date: string, amount: number, description: string): string {
  return createHash('md5').update(`${date}|${amount}|${description}`).digest('hex');
}

function alreadyExists(fitid: string | null, hash: string): boolean {
  const db = getDb();
  if (fitid) {
    const row = db.prepare(`SELECT 1 FROM transactions WHERE notes LIKE ?`).get(`%FITID:${fitid}%`);
    if (row) return true;
  }
  const row = db.prepare(`SELECT 1 FROM transactions WHERE notes LIKE ?`).get(`%HASH:${hash}%`);
  return !!row;
}

export function registerImportHandlers(): void {
  ipcMain.handle('import:preview', (_e, filePath: string): ImportPreview => {
    const content = readFileSync(filePath, 'utf-8');
    const lower   = filePath.toLowerCase();
    const isOfx   = lower.endsWith('.ofx') || lower.endsWith('.qfx');
    const format: 'csv' | 'ofx' = isOfx ? 'ofx' : 'csv';

    const raw: ImportPreviewRow[] = isOfx ? parseOFX(content) : parseCSV(content);

    for (const row of raw) {
      const hash = txHash(row.date, row.amount, row.description);
      row.duplicate = alreadyExists(row.fitid, hash);
    }

    return {
      rows: raw,
      format,
      total: raw.length,
      duplicates: raw.filter(r => r.duplicate).length,
    };
  });

  ipcMain.handle('import:confirm', (_e, payload: {
    rows: ImportPreviewRow[];
    accountId: string;
    categoryId: string;
  }): { imported: number; skipped: number } => {
    const db = getDb();
    let imported = 0;
    let skipped  = 0;

    const insert = db.prepare(`
      INSERT INTO transactions (id, account_id, category_id, description, amount, type, date, status, notes, recurring)
      VALUES (?,?,?,?,?,?,?,'confirmed',?,0)
    `);

    const doImport = db.transaction((rows: ImportPreviewRow[]) => {
      for (const row of rows) {
        if (row.duplicate) { skipped++; continue; }

        const hash  = txHash(row.date, row.amount, row.description);
        const notes = row.fitid ? `FITID:${row.fitid}|HASH:${hash}` : `HASH:${hash}`;
        insert.run(randomUUID(), payload.accountId, payload.categoryId,
                   row.description, row.amount, row.type as TransactionType,
                   row.date, notes);
        adjustBalance(payload.accountId, balanceDelta(row.type as TransactionType, row.amount));
        imported++;
      }
    });

    doImport(payload.rows);
    return { imported, skipped };
  });
}
