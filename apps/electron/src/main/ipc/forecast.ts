import { ipcMain } from 'electron';
import { getDb } from '../database';
import type { EndOfMonthForecast, ForecastFactor, ForecastPoint } from '../../shared/types';

export function registerForecastHandlers(): void {
  ipcMain.handle('forecast:get', (_e, days = 30): ForecastPoint[] => {
    const db = getDb();

    // Saldo atual de todas as contas
    const { total } = db.prepare(`SELECT COALESCE(SUM(balance),0) AS total FROM accounts`).get() as { total: number };

    // Transações confirmadas futuras (pendentes)
    const futureTxs = db.prepare(`
      SELECT date, type, SUM(amount) AS amount
      FROM transactions
      WHERE status = 'confirmed'
        AND date > date('now')
        AND date <= date('now', '+' || ? || ' days')
      GROUP BY date, type
    `).all(days) as { date: string; type: string; amount: number }[];

    // Contas a pagar pendentes dentro do horizonte
    const futureBills = db.prepare(`
      SELECT due_date AS date, SUM(amount) AS amount
      FROM bills
      WHERE status != 'paid'
        AND due_date >= date('now')
        AND due_date <= date('now', '+' || ? || ' days')
      GROUP BY due_date
    `).all(days) as { date: string; amount: number }[];

    // Contas a receber pendentes dentro do horizonte
    const futureReceivables = db.prepare(`
      SELECT due_date AS date, SUM(amount) AS amount
      FROM receivables
      WHERE status != 'received'
        AND due_date >= date('now')
        AND due_date <= date('now', '+' || ? || ' days')
      GROUP BY due_date
    `).all(days) as { date: string; amount: number }[];

    // Montar mapa de fluxo por data
    const flow = new Map<string, number>();

    for (const tx of futureTxs) {
      const delta = tx.type === 'income' ? tx.amount : -tx.amount;
      flow.set(tx.date, (flow.get(tx.date) ?? 0) + delta);
    }

    for (const bill of futureBills) {
      flow.set(bill.date, (flow.get(bill.date) ?? 0) - bill.amount);
    }

    for (const receivable of futureReceivables) {
      flow.set(receivable.date, (flow.get(receivable.date) ?? 0) + receivable.amount);
    }

    // Gerar série diária
    const points: ForecastPoint[] = [];
    let running = total;

    for (let d = 0; d <= days; d++) {
      const dt = new Date();
      dt.setDate(dt.getDate() + d);
      const iso = dt.toISOString().slice(0, 10);
      running += flow.get(iso) ?? 0;
      points.push({ date: iso, balance: Math.round(running * 100) / 100 });
    }

    return points;
  });

  ipcMain.handle('forecast:endOfMonth', (): EndOfMonthForecast => {
    const db = getDb();
    const now = new Date();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const endIso = endOfMonth.toISOString().slice(0, 10);
    const days = Math.max(0, Math.round((endOfMonth.getTime() - now.getTime()) / 86400000));

    const { total } = db.prepare(`SELECT COALESCE(SUM(balance),0) AS total FROM accounts`).get() as { total: number };

    const futureTxs = db.prepare(`
      SELECT date, type, description, amount
      FROM transactions
      WHERE status = 'confirmed' AND date > date('now') AND date <= ?
    `).all(endIso) as { date: string; type: string; description: string; amount: number }[];

    const futureBills = db.prepare(`
      SELECT due_date AS date, description, amount
      FROM bills
      WHERE status != 'paid' AND due_date >= date('now') AND due_date <= ?
    `).all(endIso) as { date: string; description: string; amount: number }[];

    const futureReceivables = db.prepare(`
      SELECT due_date AS date, description, amount
      FROM receivables
      WHERE status != 'received' AND due_date >= date('now') AND due_date <= ?
    `).all(endIso) as { date: string; description: string; amount: number }[];

    const flow = new Map<string, number>();
    const factors: ForecastFactor[] = [];

    for (const tx of futureTxs) {
      const delta = tx.type === 'income' ? tx.amount : -tx.amount;
      flow.set(tx.date, (flow.get(tx.date) ?? 0) + delta);
      factors.push({ label: tx.description, date: tx.date, amount: delta, type: delta >= 0 ? 'income' : 'expense' });
    }

    for (const bill of futureBills) {
      flow.set(bill.date, (flow.get(bill.date) ?? 0) - bill.amount);
      factors.push({ label: bill.description, date: bill.date, amount: -bill.amount, type: 'expense' });
    }

    for (const receivable of futureReceivables) {
      flow.set(receivable.date, (flow.get(receivable.date) ?? 0) + receivable.amount);
      factors.push({ label: receivable.description, date: receivable.date, amount: receivable.amount, type: 'income' });
    }

    const points: ForecastPoint[] = [];
    let running = total;

    for (let d = 0; d <= days; d++) {
      const dt = new Date(now);
      dt.setDate(dt.getDate() + d);
      const iso = dt.toISOString().slice(0, 10);
      running += flow.get(iso) ?? 0;
      points.push({ date: iso, balance: Math.round(running * 100) / 100 });
    }

    const topFactors = factors
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
      .slice(0, 5);

    return {
      points,
      projectedBalance: points[points.length - 1]?.balance ?? total,
      currentBalance: total,
      factors: topFactors,
    };
  });
}
