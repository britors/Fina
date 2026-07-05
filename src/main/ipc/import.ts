import { ipcMain } from 'electron';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { getDb } from '../database';
import { parseOFX } from '../import/ofx-parser';
import { parseCSV } from '../import/csv-parser';
import { adjustBalance, balanceDelta } from './transactions';
import { suggestCategoryFromHistory } from './categorySuggestion';
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

function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function suggestCategory(description: string, type: TransactionType): { id: string; name: string; reason: string } | null {
  // Prioriza o histórico de categorização do próprio usuário sobre as dicas
  // genéricas abaixo — mais preciso, e explica o motivo da sugestão.
  const fromHistory = suggestCategoryFromHistory(description, type);
  if (fromHistory) return { id: fromHistory.categoryId, name: fromHistory.categoryName, reason: fromHistory.reason };

  const db = getDb();
  const categories = db.prepare('SELECT id, name FROM categories WHERE type = ?').all(type === 'income' ? 'income' : 'expense') as { id: string; name: string }[];
  const desc = normalizeText(description);
  const direct = categories.find(c => desc.includes(normalizeText(c.name)));
  if (direct) return { ...direct, reason: `A descrição contém o nome da categoria "${direct.name}".` };

  const hints: Record<string, string[]> = {
    Alimentação: ['mercado', 'supermercado', 'restaurante', 'ifood', 'padaria', 'hortifruti', 'acougue'],
    Transporte: ['uber', '99', 'posto', 'combustivel', 'gasolina', 'metro', 'onibus', 'estacionamento'],
    Moradia: ['aluguel', 'condominio', 'energia', 'luz', 'agua', 'internet', 'claro', 'vivo', 'tim'],
    Saúde: ['farmacia', 'drogaria', 'hospital', 'clinica', 'medico', 'consulta', 'exame'],
    Educação: ['curso', 'faculdade', 'escola', 'livraria', 'udemy'],
    Lazer: ['netflix', 'spotify', 'cinema', 'prime', 'disney', 'steam'],
    Salário: ['salario', 'pagamento', 'folha'],
    Freelance: ['freela', 'freelance', 'servico'],
  };

  for (const category of categories) {
    const words = hints[category.name] ?? [];
    const matchedWord = words.find(word => desc.includes(word));
    if (matchedWord) return { ...category, reason: `A descrição contém "${matchedWord}", associado à categoria "${category.name}".` };
  }

  return null;
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
      const suggestion = suggestCategory(row.description, row.type);
      row.suggested_category_id = suggestion?.id ?? null;
      row.suggested_category_name = suggestion?.name ?? null;
      row.suggested_category_reason = suggestion?.reason ?? null;
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
    useSuggestions?: boolean;
  }): { imported: number; skipped: number } => {
    const db = getDb();
    let imported = 0;
    let skipped  = 0;

    const insert = db.prepare(`
      INSERT INTO transactions (id, account_id, category_id, description, amount, type, date, status, notes, recurring)
      VALUES (?,?,?,?,?,?,?,'confirmed',?,0)
    `);
    const insertPayment = db.prepare(`
      INSERT INTO transaction_payments (id, transaction_id, account_id, amount)
      VALUES (?,?,?,?)
    `);

    const doImport = db.transaction((rows: ImportPreviewRow[]) => {
      for (const row of rows) {
        if (row.duplicate) { skipped++; continue; }

        const hash  = txHash(row.date, row.amount, row.description);
        const notes = row.fitid ? `FITID:${row.fitid}|HASH:${hash}` : `HASH:${hash}`;
        const id = randomUUID();
        const categoryId = payload.useSuggestions && row.suggested_category_id ? row.suggested_category_id : payload.categoryId;
        insert.run(id, payload.accountId, categoryId,
                   row.description, row.amount, row.type as TransactionType,
                   row.date, notes);
        if (row.type !== 'transfer') {
          insertPayment.run(randomUUID(), id, payload.accountId, row.amount);
        }
        adjustBalance(payload.accountId, balanceDelta(row.type as TransactionType, row.amount));
        imported++;
      }
    });

    doImport(payload.rows);
    return { imported, skipped };
  });
}
