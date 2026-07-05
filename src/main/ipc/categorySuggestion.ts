import { ipcMain } from 'electron';
import { getDb } from '../database';
import type { CategorySuggestion, TransactionType } from '../../shared/types';

function normalizeKey(description: string): string {
  return description.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Sugere uma categoria a partir do próprio histórico de categorização do
// usuário: procura lançamentos anteriores com a mesma descrição (normalizada)
// e sugere a categoria mais usada para ela, com a contagem como justificativa.
// Não depende de IA nem de listas fixas de palavras-chave.
export function suggestCategoryFromHistory(description: string, type: TransactionType): CategorySuggestion | null {
  const key = normalizeKey(description);
  if (!key || type === 'transfer') return null;

  const db = getDb();
  const rows = db.prepare(`
    SELECT t.category_id, c.name as category_name, t.description
    FROM transactions t
    JOIN categories c ON c.id = t.category_id
    WHERE t.type = ? AND t.category_id IS NOT NULL
  `).all(type) as { category_id: string; category_name: string; description: string }[];

  const matches = rows.filter(r => normalizeKey(r.description) === key);
  if (matches.length === 0) return null;

  const counts = new Map<string, { name: string; count: number }>();
  for (const m of matches) {
    const entry = counts.get(m.category_id) ?? { name: m.category_name, count: 0 };
    entry.count += 1;
    counts.set(m.category_id, entry);
  }

  const [topId, top] = [...counts.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  const total = matches.length;

  return {
    categoryId: topId,
    categoryName: top.name,
    occurrences: top.count,
    totalOccurrences: total,
    reason: `Você categorizou "${description.trim()}" como ${top.name} ${top.count} de ${total} ${total === 1 ? 'vez' : 'vezes'}.`,
  };
}

export function registerCategorySuggestionHandlers(): void {
  ipcMain.handle('categories:suggestFromHistory', (_e, payload: { description: string; type: TransactionType }) => {
    return suggestCategoryFromHistory(payload.description, payload.type);
  });
}
