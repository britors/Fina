import { ipcMain } from 'electron';
import { getDb } from '../database';
import type { RadarSignal } from '../../shared/types';
import { formatMainDate, formatMainNumber } from '../i18n';
import { addCents, asCents, fromCents, type Cents } from '../../shared/money';

type FlowRow = { date: string; delta_cents: number };

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

  const balanceRow = db.prepare(
    `SELECT COALESCE(SUM(balance_cents), 0) AS total_cents FROM accounts WHERE type != 'credit_card'`,
  ).get() as { total_cents: number };
  const total = asCents(balanceRow.total_cents);
  const flow = db.prepare(`
    SELECT date, SUM(CASE WHEN type = 'income' THEN amount_cents ELSE -amount_cents END) AS delta_cents
    FROM transactions
    WHERE status = 'confirmed' AND date > date('now') AND date <= date('now', '+30 days')
    GROUP BY date
    UNION ALL
    SELECT due_date AS date, -SUM(amount_cents) AS delta_cents FROM bills
    WHERE status != 'paid' AND due_date >= date('now') AND due_date <= date('now', '+30 days')
    GROUP BY due_date
    UNION ALL
    SELECT due_date AS date, SUM(amount_cents) AS delta_cents FROM receivables
    WHERE status != 'received' AND due_date >= date('now') AND due_date <= date('now', '+30 days')
    GROUP BY due_date
    ORDER BY date
  `).all() as FlowRow[];
  let projected = total;
  let minimum = total;
  let minimumDate = '';
  for (const row of flow) {
    projected = addCents(projected, asCents(row.delta_cents));
    if (projected < minimum) {
      minimum = projected;
      minimumDate = row.date;
    }
  }
  if (minimum < 0) {
    add({
      key: 'negative-balance-30d', severity: 'danger', icon: 'ti-trending-down',
      title: 'Saldo projetado ficará negativo',
      body: `A projeção chega a ${formatMoney(fromCents(minimum))} em ${formatDate(minimumDate)}.`,
      action: 'Revise os próximos vencimentos ou ajuste o plano mensal.', route: 'agenda',
    });
  }

  const upcoming = db.prepare(
    `SELECT COALESCE(SUM(amount_cents), 0) AS total_cents FROM bills WHERE status != 'paid' AND due_date >= date('now') AND due_date <= date('now', '+7 days')`,
  ).get() as { total_cents: number };
  const upcomingTotal = asCents(upcoming.total_cents);
  if (upcomingTotal > 0 && total > 0 && upcomingTotal / total >= 0.25) {
    add({
      key: 'bill-pressure-7d', severity: 'warning', icon: 'ti-calendar-event',
      title: 'Vencimentos pressionam o saldo desta semana',
      body: `${formatMoney(fromCents(upcomingTotal))} vencem nos próximos 7 dias (${Math.round(upcomingTotal / total * 100)}% do saldo disponível).`,
      action: 'Confira a agenda e confirme quais pagamentos já estão provisionados.', route: 'agenda',
    });
  }

  const month = new Date();
  const budgets = db.prepare(`
    SELECT b.limit_amount_cents, COALESCE(SUM(t.amount_cents), 0) AS spent_cents, c.name
    FROM budgets b JOIN categories c ON c.id = b.category_id
    LEFT JOIN transactions t ON t.category_id = b.category_id AND t.type = 'expense'
      AND t.status = 'confirmed' AND strftime('%m', t.date) = printf('%02d', b.month) AND strftime('%Y', t.date) = CAST(b.year AS TEXT)
    WHERE b.month = ? AND b.year = ? GROUP BY b.id
  `).all(month.getMonth() + 1, month.getFullYear()) as { limit_amount_cents: number; spent_cents: number; name: string }[];
  const exceeded = budgets.filter(b => b.limit_amount_cents > 0 && b.spent_cents >= b.limit_amount_cents * 1.1);
  if (exceeded.length) {
    add({
      key: 'budget-overrun-month', severity: 'warning', icon: 'ti-target-off',
      title: `${exceeded.length} orçamento${exceeded.length > 1 ? 's' : ''} acima do limite`,
      body: exceeded.map(b => `${b.name}: ${formatMoney(fromCents(b.spent_cents))} de ${formatMoney(fromCents(b.limit_amount_cents))}`).join(' · '),
      action: 'Revise os gastos ou redistribua os limites do mês.', route: 'budget',
    });
  }
  const cards = db.prepare(`
    SELECT id, name, balance_cents, credit_limit_cents FROM accounts
    WHERE type = 'credit_card' AND credit_limit_cents IS NOT NULL AND credit_limit_cents > 0
  `).all() as { id: string; name: string; balance_cents: number; credit_limit_cents: number }[];
  for (const card of cards) {
    const usage = card.balance_cents / card.credit_limit_cents;
    if (usage < 0.8) continue;
    add({
      key: `card-limit-${card.id}`,
      severity: usage >= 1 ? 'danger' : 'warning',
      icon: 'ti-credit-card',
      title: `Limite do cartão "${card.name}" ${usage >= 1 ? 'estourado' : 'quase no limite'}`,
      body: `Uso atual: ${formatMoney(fromCents(card.balance_cents))} de ${formatMoney(fromCents(card.credit_limit_cents))} (${Math.round(usage * 100)}%).`,
      action: 'Revise os gastos no cartão ou considere antecipar o pagamento da fatura.',
      route: 'accounts',
    });
  }

  const assetReminders = db.prepare(`
    SELECT r.id, r.kind, r.due_date, a.name AS asset_name
    FROM asset_reminders r JOIN assets a ON a.id = r.asset_id
    WHERE r.dismissed_at IS NULL AND r.due_date <= date('now', '+14 days')
  `).all() as { id: string; kind: string; due_date: string; asset_name: string }[];
  const kindLabel: Record<string, string> = { seguro: 'Seguro', garantia: 'Garantia', ipva: 'IPVA', outro: 'Lembrete' };
  const today = new Date().toISOString().slice(0, 10);
  for (const r of assetReminders) {
    const overdue = r.due_date < today;
    add({
      key: `asset-reminder-${r.id}`,
      severity: overdue ? 'danger' : 'warning',
      icon: 'ti-bell',
      title: `${kindLabel[r.kind] ?? 'Lembrete'} de "${r.asset_name}" ${overdue ? 'vencido' : 'a vencer'}`,
      body: `Vencimento em ${formatDate(r.due_date)}.`,
      action: 'Confira em Patrimônio e renove ou registre a renovação.',
      route: 'patrimonio',
    });
  }

  return signals;
}

function formatMoney(value: number): string {
  return formatMainNumber(value, { style: 'currency', currency: 'BRL' });
}

function formatDate(value: string): string {
  if (!value) return 'a próxima janela';
  return formatMainDate(`${value}T00:00:00`);
}

export function registerRadarHandlers(): void {
  ipcMain.handle('radar:list', () => radarSignals());
  ipcMain.handle('radar:dismiss', (_event, key: string) => {
    if (!key || key.length > 120) throw new Error('Sinal inválido.');
    getDb().prepare('INSERT OR IGNORE INTO dismissed_radar_signals (signal_key) VALUES (?)').run(key);
    return true;
  });
}
