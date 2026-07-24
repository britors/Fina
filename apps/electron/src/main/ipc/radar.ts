import { ipcMain } from 'electron';
import { getDb } from '../database';
import type { RadarSignal } from '../../shared/types';

type FlowRow = { date: string; delta: number };

function radarSignals(): RadarSignal[] {
  const db = getDb();
  const dismissed = new Set(
    (db.prepare('SELECT signal_key FROM dismissed_radar_signals').all() as { signal_key: string }[])
      .map(row => row.signal_key),
  );
  const signals: RadarSignal[] = [];
  const add = (signal: RadarSignal): void => {
    if (!dismissed.has(signal.key)) signals.push(signal);
  };

  const { total } = db.prepare(
    `SELECT COALESCE(SUM(balance), 0) AS total FROM accounts WHERE type != 'credit_card'`,
  ).get() as { total: number };
  const flow = db.prepare(`
    SELECT date, SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END) AS delta
    FROM transactions
    WHERE status = 'confirmed' AND date > date('now') AND date <= date('now', '+30 days')
    GROUP BY date
    UNION ALL
    SELECT due_date AS date, -SUM(amount) AS delta FROM bills
    WHERE status != 'paid' AND due_date >= date('now') AND due_date <= date('now', '+30 days')
    GROUP BY due_date
    UNION ALL
    SELECT due_date AS date, SUM(amount) AS delta FROM receivables
    WHERE status != 'received' AND due_date >= date('now') AND due_date <= date('now', '+30 days')
    GROUP BY due_date
    ORDER BY date
  `).all() as FlowRow[];
  let projected = total;
  let minimum = total;
  let minimumDate = '';
  for (const row of flow) {
    projected += row.delta;
    if (projected < minimum) {
      minimum = projected;
      minimumDate = row.date;
    }
  }
  if (minimum < 0) {
    add({
      key: 'negative-balance-30d', severity: 'danger', icon: 'ti-trending-down',
      title: 'Saldo projetado ficará negativo',
      body: `A projeção chega a ${formatMoney(minimum)} em ${formatDate(minimumDate)}.`,
      action: 'Revise os próximos vencimentos ou ajuste o plano mensal.', route: 'agenda',
    });
  }

  const upcoming = db.prepare(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM bills WHERE status != 'paid' AND due_date >= date('now') AND due_date <= date('now', '+7 days')`,
  ).get() as { total: number };
  if (upcoming.total > 0 && total > 0 && upcoming.total / total >= 0.25) {
    add({
      key: 'bill-pressure-7d', severity: 'warning', icon: 'ti-calendar-event',
      title: 'Vencimentos pressionam o saldo desta semana',
      body: `${formatMoney(upcoming.total)} vencem nos próximos 7 dias (${Math.round(upcoming.total / total * 100)}% do saldo disponível).`,
      action: 'Confira a agenda e confirme quais pagamentos já estão provisionados.', route: 'agenda',
    });
  }

  const month = new Date();
  const budgets = db.prepare(`
    SELECT b.limit_amount, COALESCE(SUM(t.amount), 0) AS spent, c.name
    FROM budgets b JOIN categories c ON c.id = b.category_id
    LEFT JOIN transactions t ON t.category_id = b.category_id AND t.type = 'expense'
      AND t.status = 'confirmed' AND strftime('%m', t.date) = printf('%02d', b.month) AND strftime('%Y', t.date) = CAST(b.year AS TEXT)
    WHERE b.month = ? AND b.year = ? GROUP BY b.id
  `).all(month.getMonth() + 1, month.getFullYear()) as { limit_amount: number; spent: number; name: string }[];
  const exceeded = budgets.filter(b => b.limit_amount > 0 && b.spent >= b.limit_amount * 1.1);
  if (exceeded.length) {
    add({
      key: 'budget-overrun-month', severity: 'warning', icon: 'ti-target-off',
      title: `${exceeded.length} orçamento${exceeded.length > 1 ? 's' : ''} acima do limite`,
      body: exceeded.map(b => `${b.name}: ${formatMoney(b.spent)} de ${formatMoney(b.limit_amount)}`).join(' · '),
      action: 'Revise os gastos ou redistribua os limites do mês.', route: 'budget',
    });
  }
  return signals;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDate(value: string): string {
  if (!value) return 'a próxima janela';
  return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR');
}

export function registerRadarHandlers(): void {
  ipcMain.handle('radar:list', () => radarSignals());
  ipcMain.handle('radar:dismiss', (_event, key: string) => {
    if (!key || key.length > 120) throw new Error('Sinal inválido.');
    getDb().prepare('INSERT OR IGNORE INTO dismissed_radar_signals (signal_key) VALUES (?)').run(key);
    return true;
  });
}
