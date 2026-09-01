import { ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { getDb } from '../database';
import type { MeiDasPayment, MeiMonthRevenue, MeiReport } from '../../shared/types';

// Limite anual de faturamento do MEI vigente na legislação atual. Constante
// nomeada para facilitar o ajuste se o valor mudar em anos futuros.
const MEI_ANNUAL_LIMIT = 81000;

export function registerMeiHandlers(): void {
  ipcMain.handle('mei:getReport', (_e, year: number): MeiReport => {
    const db = getDb();
    const rows = db.prepare(`
      SELECT strftime('%Y-%m', date) AS month, SUM(amount_cents) / 100.0 AS revenue
      FROM transactions
      WHERE type = 'income' AND status = 'confirmed' AND is_mei_revenue = 1 AND strftime('%Y', date) = ?
      GROUP BY month ORDER BY month
    `).all(String(year)) as { month: string; revenue: number }[];

    let cumulative = 0;
    const months: MeiMonthRevenue[] = rows.map(r => {
      cumulative += r.revenue;
      return { month: r.month, revenue: r.revenue, cumulative };
    });

    const totalRevenue = cumulative;
    const isCurrentYear = year === new Date().getFullYear();
    const elapsedMonths = isCurrentYear ? new Date().getMonth() + 1 : 12;
    // Em anos passados, o projetado é o próprio total; no ano corrente,
    // extrapola pela média mensal até agora.
    const projected = isCurrentYear && elapsedMonths > 0 ? (totalRevenue / elapsedMonths) * 12 : totalRevenue;

    const dasPayments = db.prepare(`
      SELECT * FROM mei_das_payments WHERE competencia LIKE ? ORDER BY competencia
    `).all(`${year}-%`) as MeiDasPayment[];

    return {
      year,
      months,
      total_revenue: totalRevenue,
      annual_limit: MEI_ANNUAL_LIMIT,
      projected_to_exceed: projected > MEI_ANNUAL_LIMIT,
      das_payments: dasPayments,
    };
  });

  ipcMain.handle('mei:listDAS', (_e, year?: number) => {
    const db = getDb();
    return year
      ? db.prepare(`SELECT * FROM mei_das_payments WHERE competencia LIKE ? ORDER BY competencia DESC`).all(`${year}-%`)
      : db.prepare(`SELECT * FROM mei_das_payments ORDER BY competencia DESC`).all();
  });

  ipcMain.handle('mei:createDAS', (_e, data: { competencia: string; amount: number }) => {
    if (!/^\d{4}-\d{2}$/.test(data.competencia ?? '')) throw new Error('Informe a competência no formato AAAA-MM.');
    if (!Number.isFinite(data.amount) || data.amount < 0) throw new Error('Informe um valor válido para o DAS.');
    const id = randomUUID();
    getDb().prepare(`
      INSERT INTO mei_das_payments (id, competencia, amount, status) VALUES (?,?,?,'pendente')
    `).run(id, data.competencia, data.amount ?? 0);
    return getDb().prepare('SELECT * FROM mei_das_payments WHERE id = ?').get(id);
  });

  ipcMain.handle('mei:markDASPaid', (_e, { id, paid_date }: { id: string; paid_date: string }) => {
    getDb().prepare(`UPDATE mei_das_payments SET status='pago', paid_date=?, updated_at=datetime('now') WHERE id=?`).run(paid_date, id);
    return getDb().prepare('SELECT * FROM mei_das_payments WHERE id = ?').get(id);
  });

  ipcMain.handle('mei:deleteDAS', (_e, id: string) =>
    getDb().prepare('DELETE FROM mei_das_payments WHERE id = ?').run(id)
  );
}
