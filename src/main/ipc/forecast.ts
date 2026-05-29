import { ipcMain } from 'electron';
import { getDb } from '../database';
import type { ForecastPoint } from '../../shared/types';

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

    // Montar mapa de fluxo por data
    const flow = new Map<string, number>();

    for (const tx of futureTxs) {
      const delta = tx.type === 'income' ? tx.amount : -tx.amount;
      flow.set(tx.date, (flow.get(tx.date) ?? 0) + delta);
    }

    for (const bill of futureBills) {
      flow.set(bill.date, (flow.get(bill.date) ?? 0) - bill.amount);
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
}
