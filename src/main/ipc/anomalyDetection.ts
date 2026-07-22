import { ipcMain } from 'electron';
import { getDb } from '../database';
import type { SpendingAnomaly } from '../../shared/types';

interface RecentTx {
  id: string;
  description: string;
  amount: number;
  date: string;
  account_id: string;
  category_id: string | null;
  account_name: string;
}

function normalizeKey(description: string): string {
  return description.trim().toLowerCase().replace(/\s+/g, ' ');
}

function detectHighAmounts(db: ReturnType<typeof getDb>, recent: RecentTx[], dismissed: Set<string>): SpendingAnomaly[] {
  const baselines = db.prepare(`
    SELECT category_id, AVG(amount) as avg_amount,
           AVG(amount * amount) - AVG(amount) * AVG(amount) as variance
    FROM transactions
    WHERE type = 'expense' AND status = 'confirmed' AND category_id IS NOT NULL
      AND date >= date('now', '-6 months')
    GROUP BY category_id
    HAVING COUNT(*) >= 5
  `).all() as { category_id: string; avg_amount: number; variance: number }[];
  const baselineByCategory = new Map(baselines.map(b => [b.category_id, b]));

  const findings: SpendingAnomaly[] = [];
  for (const tx of recent) {
    if (dismissed.has(tx.id) || !tx.category_id) continue;
    const baseline = baselineByCategory.get(tx.category_id);
    if (!baseline) continue;
    const stddev = Math.sqrt(Math.max(baseline.variance, 0));
    const threshold = stddev > 0 ? baseline.avg_amount + 2.5 * stddev : baseline.avg_amount * 2.5;
    if (tx.amount <= threshold || tx.amount <= baseline.avg_amount * 1.5) continue;

    findings.push({
      transactionId: tx.id,
      description: tx.description,
      amount: tx.amount,
      date: tx.date,
      accountName: tx.account_name,
      type: 'high_amount',
      reason: `Valor bem acima da média recente da categoria (média: ${baseline.avg_amount.toFixed(2)}).`,
    });
  }
  return findings;
}

function detectDuplicates(recent: RecentTx[], dismissed: Set<string>): SpendingAnomaly[] {
  const findings: SpendingAnomaly[] = [];
  for (let i = 0; i < recent.length; i++) {
    for (let j = i + 1; j < recent.length; j++) {
      const a = recent[i], b = recent[j];
      if (dismissed.has(a.id)) continue;
      if (a.account_id !== b.account_id) continue;
      if (Math.abs(a.amount - b.amount) > 0.01) continue;
      if (normalizeKey(a.description) !== normalizeKey(b.description)) continue;
      const days = Math.abs(new Date(a.date + 'T00:00:00').getTime() - new Date(b.date + 'T00:00:00').getTime()) / 86_400_000;
      if (days > 2) continue;

      findings.push({
        transactionId: a.id,
        description: a.description,
        amount: a.amount,
        date: a.date,
        accountName: a.account_name,
        type: 'duplicate',
        reason: `Lançamento igual (mesmo valor, descrição e conta) em ${b.date}.`,
      });
      break;
    }
  }
  return findings;
}

function detectRecurringChanges(db: ReturnType<typeof getDb>, recent: RecentTx[], dismissed: Set<string>): SpendingAnomaly[] {
  const history = db.prepare(`
    SELECT description, amount, date
    FROM transactions
    WHERE type = 'expense' AND status = 'confirmed' AND date >= date('now', '-12 months')
    ORDER BY date ASC
  `).all() as { description: string; amount: number; date: string }[];

  const groups = new Map<string, { amount: number; date: string }[]>();
  for (const row of history) {
    const key = normalizeKey(row.description);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ amount: row.amount, date: row.date });
  }

  const findings: SpendingAnomaly[] = [];
  for (const tx of recent) {
    if (dismissed.has(tx.id)) continue;
    const previous = (groups.get(normalizeKey(tx.description)) ?? []).filter(x => x.date < tx.date);
    if (previous.length < 3) continue;

    const avgPrevious = previous.reduce((s, v) => s + v.amount, 0) / previous.length;
    if (avgPrevious <= 0) continue;
    const deviation = Math.abs(tx.amount - avgPrevious) / avgPrevious;
    if (deviation < 0.25) continue;

    findings.push({
      transactionId: tx.id,
      description: tx.description,
      amount: tx.amount,
      date: tx.date,
      accountName: tx.account_name,
      type: 'recurring_change',
      reason: `Cobrança recorrente com valor ${tx.amount > avgPrevious ? 'maior' : 'menor'} que o habitual (média anterior: ${avgPrevious.toFixed(2)}).`,
    });
  }
  return findings;
}

function detectAnomalies(): SpendingAnomaly[] {
  const db = getDb();

  const dismissed = new Set(
    (db.prepare('SELECT transaction_id FROM dismissed_anomalies').all() as { transaction_id: string }[])
      .map(r => r.transaction_id)
  );

  const recent = db.prepare(`
    SELECT t.id, t.description, t.amount, t.date, t.account_id, t.category_id, a.name as account_name
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    WHERE t.type = 'expense' AND t.status = 'confirmed' AND t.date >= date('now', '-60 days')
    ORDER BY t.date DESC
  `).all() as RecentTx[];

  const findings = [
    ...detectDuplicates(recent, dismissed),
    ...detectRecurringChanges(db, recent, dismissed),
    ...detectHighAmounts(db, recent, dismissed),
  ];

  // Uma transação pode acionar mais de uma regra; mantém só o primeiro
  // achado (duplicidade > recorrência alterada > valor incomum) por transação.
  const seen = new Set<string>();
  return findings
    .filter(f => (seen.has(f.transactionId) ? false : (seen.add(f.transactionId), true)))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function registerAnomalyDetectionHandlers(): void {
  ipcMain.handle('anomalies:list', () => detectAnomalies());

  ipcMain.handle('anomalies:dismiss', (_e, transactionId: string) => {
    getDb().prepare('INSERT OR IGNORE INTO dismissed_anomalies (transaction_id) VALUES (?)').run(transactionId);
    return true;
  });
}
