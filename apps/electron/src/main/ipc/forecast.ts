import { ipcMain } from 'electron';
import { getDb } from '../database';
import type { EndOfMonthForecast, ForecastFactor, ForecastPoint } from '../../shared/types';
import { addCents, asCents, fromCents, type Cents } from '../../shared/money';

function addDailyFlow(flow: Map<string, Cents>, date: string, delta: Cents): void {
  flow.set(date, addCents(flow.get(date) ?? asCents(0), delta));
}

export function registerForecastHandlers(): void {
  ipcMain.handle('forecast:get', (_e, days = 30): ForecastPoint[] => {
    const db = getDb();

    // Saldo atual de todas as contas
    const balanceRow = db.prepare(`SELECT COALESCE(SUM(CASE WHEN type = 'credit_card' THEN -balance_cents ELSE balance_cents END),0) AS total_cents FROM accounts`).get() as { total_cents: number };
    const total = asCents(balanceRow.total_cents);

    // Transações confirmadas futuras (pendentes)
    const futureTxs = db.prepare(`
      SELECT date, type, SUM(amount_cents) AS amount_cents
      FROM transactions
      WHERE status = 'confirmed'
        AND date > date('now')
        AND date <= date('now', '+' || ? || ' days')
      GROUP BY date, type
    `).all(days) as { date: string; type: string; amount_cents: number }[];

    // Contas a pagar pendentes dentro do horizonte
    const futureBills = db.prepare(`
      SELECT due_date AS date, SUM(amount_cents) AS amount_cents
      FROM bills
      WHERE status != 'paid'
        AND due_date >= date('now')
        AND due_date <= date('now', '+' || ? || ' days')
      GROUP BY due_date
    `).all(days) as { date: string; amount_cents: number }[];

    // Contas a receber pendentes dentro do horizonte
    const futureReceivables = db.prepare(`
      SELECT due_date AS date, SUM(amount_cents) AS amount_cents
      FROM receivables
      WHERE status != 'received'
        AND due_date >= date('now')
        AND due_date <= date('now', '+' || ? || ' days')
      GROUP BY due_date
    `).all(days) as { date: string; amount_cents: number }[];

    // Montar mapa de fluxo por data
    const flow = new Map<string, Cents>();

    for (const tx of futureTxs) {
      const amount = asCents(tx.amount_cents);
      addDailyFlow(flow, tx.date, (tx.type === 'income' ? amount : -amount) as Cents);
    }

    for (const bill of futureBills) {
      addDailyFlow(flow, bill.date, -asCents(bill.amount_cents) as Cents);
    }

    for (const receivable of futureReceivables) {
      addDailyFlow(flow, receivable.date, asCents(receivable.amount_cents));
    }

    // Gerar série diária
    const points: ForecastPoint[] = [];
    let running = total;

    for (let d = 0; d <= days; d++) {
      const dt = new Date();
      dt.setDate(dt.getDate() + d);
      const iso = dt.toISOString().slice(0, 10);
      running = addCents(running, flow.get(iso) ?? asCents(0));
      points.push({ date: iso, balance: fromCents(running) });
    }

    return points;
  });

  ipcMain.handle('forecast:endOfMonth', (): EndOfMonthForecast => {
    const db = getDb();
    const now = new Date();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const endIso = endOfMonth.toISOString().slice(0, 10);
    const days = Math.max(0, Math.round((endOfMonth.getTime() - now.getTime()) / 86400000));

    const balanceRow = db.prepare(`SELECT COALESCE(SUM(CASE WHEN type = 'credit_card' THEN -balance_cents ELSE balance_cents END),0) AS total_cents FROM accounts`).get() as { total_cents: number };
    const total = asCents(balanceRow.total_cents);

    const futureTxs = db.prepare(`
      SELECT date, type, description, amount_cents
      FROM transactions
      WHERE status = 'confirmed' AND date > date('now') AND date <= ?
    `).all(endIso) as { date: string; type: string; description: string; amount_cents: number }[];

    const futureBills = db.prepare(`
      SELECT due_date AS date, description, amount_cents
      FROM bills
      WHERE status != 'paid' AND due_date >= date('now') AND due_date <= ?
    `).all(endIso) as { date: string; description: string; amount_cents: number }[];

    const futureReceivables = db.prepare(`
      SELECT due_date AS date, description, amount_cents
      FROM receivables
      WHERE status != 'received' AND due_date >= date('now') AND due_date <= ?
    `).all(endIso) as { date: string; description: string; amount_cents: number }[];

    const flow = new Map<string, Cents>();
    const factors: ForecastFactor[] = [];

    for (const tx of futureTxs) {
      const amount = asCents(tx.amount_cents);
      const delta = (tx.type === 'income' ? amount : -amount) as Cents;
      addDailyFlow(flow, tx.date, delta);
      factors.push({ label: tx.description, date: tx.date, amount: fromCents(delta), type: delta >= 0 ? 'income' : 'expense' });
    }

    for (const bill of futureBills) {
      const delta = -asCents(bill.amount_cents) as Cents;
      addDailyFlow(flow, bill.date, delta);
      factors.push({ label: bill.description, date: bill.date, amount: fromCents(delta), type: 'expense' });
    }

    for (const receivable of futureReceivables) {
      const delta = asCents(receivable.amount_cents);
      addDailyFlow(flow, receivable.date, delta);
      factors.push({ label: receivable.description, date: receivable.date, amount: fromCents(delta), type: 'income' });
    }

    const points: ForecastPoint[] = [];
    let running = total;

    for (let d = 0; d <= days; d++) {
      const dt = new Date(now);
      dt.setDate(dt.getDate() + d);
      const iso = dt.toISOString().slice(0, 10);
      running = addCents(running, flow.get(iso) ?? asCents(0));
      points.push({ date: iso, balance: fromCents(running) });
    }

    const topFactors = factors
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
      .slice(0, 5);

    return {
      points,
      projectedBalance: points[points.length - 1]?.balance ?? fromCents(total),
      currentBalance: fromCents(total),
      factors: topFactors,
    };
  });
}
