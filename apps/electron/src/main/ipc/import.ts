import { ipcMain } from 'electron';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { getDb } from '../database';
import { parseOFX } from '../import/ofx-parser';
import { parseCSV } from '../import/csv-parser';
import { parseBradescoPdfPages } from '../import/bradesco-pdf-parser';
import { extractPdfText } from '../import/pdf-text';
import { adjustBalance, balanceDelta } from './transactions';
import { attachToInvoice } from '../invoices';
import { suggestCategoryFromHistory, learnCategoryRule } from './categorySuggestion';
import type { ImportDirection, ImportPreview, ImportPreviewRow, TransactionType } from '../../shared/types';
import { fromCents, toExactCents } from '../../shared/money';

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
  const categories = db.prepare(`
    SELECT c.id, c.name,
      CASE WHEN parent.id IS NULL THEN c.name ELSE parent.name || ' › ' || c.name END AS display_name
    FROM categories c
    LEFT JOIN categories parent ON parent.id = c.parent_id
    WHERE c.type = ?
  `).all(type === 'income' ? 'income' : 'expense') as { id: string; name: string; display_name: string }[];
  const desc = normalizeText(description);
  const direct = categories.find(c => desc.includes(normalizeText(c.name)));
  if (direct) return { id: direct.id, name: direct.display_name, reason: `A descrição contém o nome da categoria "${direct.display_name}".` };

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
    if (matchedWord) return { id: category.id, name: category.display_name, reason: `A descrição contém "${matchedWord}", associado à categoria "${category.display_name}".` };
  }

  return null;
}

export function registerImportHandlers(): void {
  ipcMain.handle('import:preview', async (_e, payload: { filePath: string; direction?: ImportDirection }): Promise<ImportPreview> => {
    const filePath = payload?.filePath;
    if (typeof filePath !== 'string' || !/\.(csv|ofx|qfx|pdf)$/i.test(filePath)) throw new Error('Formato de arquivo não suportado.');
    if (statSync(filePath).size > 25 * 1024 * 1024) throw new Error('O arquivo excede o limite de 25 MB.');
    const lower   = filePath.toLowerCase();
    const isOfx   = lower.endsWith('.ofx') || lower.endsWith('.qfx');
    const isPdf   = lower.endsWith('.pdf');
    const format: ImportPreview['format'] = isPdf ? 'pdf-bradesco' : isOfx ? 'ofx' : 'csv';

    const content = isPdf ? null : readFileSync(filePath, 'utf-8');
    const ofxResult = isOfx && content !== null ? parseOFX(content) : null;
    let raw: ImportPreviewRow[] = isPdf
      ? parseBradescoPdfPages(await extractPdfText(filePath))
      : ofxResult ? ofxResult.rows : parseCSV(content ?? '');
    const direction = payload.direction ?? 'both';
    if (!['expenses', 'income', 'both'].includes(direction)) throw new Error('Tipo de importação inválido.');
    if (direction !== 'both') raw = raw.filter(row => row.type === (direction === 'income' ? 'income' : 'expense'));

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
      invalid: ofxResult?.invalid ?? 0,
    };
  });

  ipcMain.handle('import:confirm', (_e, payload: {
    rows: ImportPreviewRow[];
    accountId: string;
    expenseCategoryId?: string;
    incomeCategoryId?: string;
    useSuggestions?: boolean;
  }): { imported: number; skipped: number; dateFrom: string | null; dateTo: string | null } => {
    const db = getDb();
    if (!Array.isArray(payload.rows) || typeof payload.accountId !== 'string') throw new Error('Dados de importação inválidos.');
    const categoryType = db.prepare('SELECT type FROM categories WHERE id = ?');
    const requiredTypes = new Set(payload.rows.map(row => row.type));
    if (requiredTypes.has('expense') && (typeof payload.expenseCategoryId !== 'string' || (categoryType.get(payload.expenseCategoryId) as { type?: string } | undefined)?.type !== 'expense')) {
      throw new Error('Selecione uma categoria padrão de despesas.');
    }
    if (requiredTypes.has('income') && (typeof payload.incomeCategoryId !== 'string' || (categoryType.get(payload.incomeCategoryId) as { type?: string } | undefined)?.type !== 'income')) {
      throw new Error('Selecione uma categoria padrão de receitas.');
    }
    let imported = 0;
    let skipped  = 0;
    const importedDates: string[] = [];

    const insert = db.prepare(`
      INSERT INTO transactions (id, account_id, category_id, description, amount, amount_cents, type, date, status, notes, recurring)
      VALUES (?,?,?,?,?,?,?,?,'confirmed',?,0)
    `);
    const insertPayment = db.prepare(`
      INSERT INTO transaction_payments (id, transaction_id, account_id, amount, amount_cents)
      VALUES (?,?,?,?,?)
    `);
    const insertCategory = db.prepare(`
      INSERT INTO transaction_categories (id, transaction_id, category_id, amount, amount_cents)
      VALUES (?,?,?,?,?)
    `);
    const linkInvoice = db.prepare('UPDATE transaction_payments SET invoice_id = ? WHERE id = ?');
    const duplicateByAccount = db.prepare(`
      SELECT 1 FROM transactions
      WHERE account_id = ? AND (notes LIKE ? OR notes LIKE ?)
      LIMIT 1
    `);

    const doImport = db.transaction((rows: ImportPreviewRow[]) => {
      for (const row of rows) {
        if (!Number.isFinite(row.amount) || row.amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !['income', 'expense'].includes(row.type)) {
          skipped++;
          continue;
        }
        const hash  = txHash(row.date, row.amount, row.description);
        const fitidPattern = row.fitid ? `%FITID:${row.fitid}%` : '__NO_FITID__';
        if (duplicateByAccount.get(payload.accountId, fitidPattern, `%HASH:${hash}%`)) {
          skipped++;
          continue;
        }
        const notes = row.fitid ? `FITID:${row.fitid}|HASH:${hash}` : `HASH:${hash}`;
        const id = randomUUID();
        const amountCents = toExactCents(row.amount);
        const categoryId = payload.useSuggestions && row.suggested_category_id
          ? row.suggested_category_id
          : row.type === 'income' ? payload.incomeCategoryId! : payload.expenseCategoryId!;
        learnCategoryRule(row.description, row.type as TransactionType, categoryId);
        insert.run(id, payload.accountId, categoryId,
                   row.description, fromCents(amountCents), amountCents, row.type as TransactionType,
                   row.date, notes);
        const signedDelta = adjustBalance(payload.accountId, balanceDelta(row.type as TransactionType, fromCents(amountCents)));
        insertCategory.run(randomUUID(), id, categoryId, fromCents(amountCents), amountCents);
        if (row.type !== 'transfer') {
          const paymentId = randomUUID();
          insertPayment.run(paymentId, id, payload.accountId, fromCents(amountCents), amountCents);
          const invoiceId = attachToInvoice(payload.accountId, row.date, signedDelta);
          if (invoiceId) linkInvoice.run(invoiceId, paymentId);
        }
        imported++;
        importedDates.push(row.date);
      }
    });

    doImport(payload.rows);
    return {
      imported,
      skipped,
      dateFrom: importedDates.length ? importedDates.reduce((a, b) => a < b ? a : b) : null,
      dateTo: importedDates.length ? importedDates.reduce((a, b) => a > b ? a : b) : null,
    };
  });
}
