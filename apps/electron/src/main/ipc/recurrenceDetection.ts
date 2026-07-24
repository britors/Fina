import { ipcMain } from 'electron';
import { getDb } from '../database';
import type { BillInterval, DetectedRecurrence } from '../../shared/types';

function normalizeKey(description: string): string {
  return description.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Estima o intervalo de recorrência a partir do intervalo médio em dias entre
// ocorrências, usando as mesmas faixas de BillInterval já usadas em Fixas.
function guessInterval(avgDays: number): BillInterval | 'irregular' {
  if (avgDays <= 10) return 'weekly';
  if (avgDays <= 20) return 'biweekly';
  if (avgDays <= 45) return 'monthly';
  if (avgDays <= 75) return 'bimonthly';
  if (avgDays <= 110) return 'quarterly';
  if (avgDays <= 250) return 'semiannual';
  if (avgDays <= 400) return 'annual';
  return 'irregular';
}

function detectRecurrences(type: 'expense' | 'income'): DetectedRecurrence[] {
  const db = getDb();

  const dismissedKeys = new Set(
    (db.prepare('SELECT key FROM dismissed_recurrence_suggestions').all() as { key: string }[]).map(r => r.key)
  );

  const trackedTable = type === 'income' ? 'receivables' : 'bills';
  const trackedKeys = new Set(
    (db.prepare(`SELECT description FROM ${trackedTable} WHERE recurring = 1`).all() as { description: string }[])
      .map(r => normalizeKey(r.description))
  );

  const rows = db.prepare(`
    SELECT description, amount, date
    FROM transactions
    WHERE type = ? AND status = 'confirmed' AND date >= date('now', '-12 months')
    ORDER BY date ASC
  `).all(type) as { description: string; amount: number; date: string }[];

  const groups = new Map<string, { description: string; amounts: number[]; dates: string[] }>();
  for (const row of rows) {
    const key = normalizeKey(row.description);
    if (!key) continue;
    let group = groups.get(key);
    if (!group) {
      group = { description: row.description, amounts: [], dates: [] };
      groups.set(key, group);
    }
    group.description = row.description;
    group.amounts.push(row.amount);
    group.dates.push(row.date);
  }

  const results: DetectedRecurrence[] = [];

  for (const [rawKey, group] of groups) {
    const key = `${type}:${rawKey}`;
    if (group.dates.length < 3 || dismissedKeys.has(key) || trackedKeys.has(rawKey)) continue;

    const gaps: number[] = [];
    for (let i = 1; i < group.dates.length; i++) {
      const d1 = new Date(group.dates[i - 1] + 'T00:00:00').getTime();
      const d2 = new Date(group.dates[i] + 'T00:00:00').getTime();
      gaps.push((d2 - d1) / 86_400_000);
    }
    const avgGap = gaps.reduce((s, v) => s + v, 0) / gaps.length;
    const maxDeviation = Math.max(...gaps.map(g => Math.abs(g - avgGap)));

    // Tolerância proporcional: recorrências mais espaçadas (ex: anuais) têm
    // mais folga de calendário do que semanais.
    const tolerance = Math.max(4, avgGap * 0.3);
    if (maxDeviation > tolerance) continue;

    const interval = guessInterval(avgGap);
    if (interval === 'irregular') continue;

    const avgAmount = group.amounts.reduce((s, v) => s + v, 0) / group.amounts.length;

    results.push({
      key,
      description: group.description,
      occurrences: group.dates.length,
      avgAmount: Math.round(avgAmount * 100) / 100,
      lastDate: group.dates[group.dates.length - 1],
      interval,
      likelyForgotten: group.dates.length >= 4,
    });
  }

  return results.sort((a, b) => b.occurrences - a.occurrences);
}

export function registerRecurrenceDetectionHandlers(): void {
  ipcMain.handle('recurrenceDetection:list', (_e, type: 'expense' | 'income' = 'expense') => detectRecurrences(type));

  ipcMain.handle('recurrenceDetection:dismiss', (_e, key: string) => {
    getDb().prepare('INSERT OR IGNORE INTO dismissed_recurrence_suggestions (key) VALUES (?)').run(key);
    return true;
  });
}
