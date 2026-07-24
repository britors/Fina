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
  const rule = db.prepare(`
    SELECT r.category_id,
      CASE WHEN parent.id IS NULL THEN c.name ELSE parent.name || ' › ' || c.name END as category_name
    FROM import_category_rules r JOIN categories c ON c.id = r.category_id
    LEFT JOIN categories parent ON parent.id = c.parent_id
    WHERE r.description_key = ? AND r.transaction_type = ?
  `).get(key, type) as { category_id: string; category_name: string } | undefined;
  if (rule) return {
    categoryId: rule.category_id, categoryName: rule.category_name, occurrences: 1, totalOccurrences: 1,
    reason: `Regra aprendida: descrições como "${description.trim()}" usam ${rule.category_name}.`,
  };
  const rows = db.prepare(`
    SELECT t.category_id,
      CASE WHEN parent.id IS NULL THEN c.name ELSE parent.name || ' › ' || c.name END as category_name,
      t.description
    FROM transactions t
    JOIN categories c ON c.id = t.category_id
    LEFT JOIN categories parent ON parent.id = c.parent_id
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

export function learnCategoryRule(description: string, type: TransactionType, categoryId: string): void {
  const key = normalizeKey(description);
  if (!key || type === 'transfer' || !categoryId) return;
  getDb().prepare(`
    INSERT INTO import_category_rules (description_key, transaction_type, category_id)
    VALUES (?, ?, ?)
    ON CONFLICT(description_key, transaction_type) DO UPDATE SET category_id=excluded.category_id, updated_at=datetime('now')
  `).run(key, type, categoryId);
}

export function registerCategorySuggestionHandlers(): void {
  ipcMain.handle('categories:suggestFromHistory', (_e, payload: { description: string; type: TransactionType }) => {
    return suggestCategoryFromHistory(payload.description, payload.type);
  });
}
