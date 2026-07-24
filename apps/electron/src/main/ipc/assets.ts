import { ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { getDb } from '../database';
import type { Asset } from '../../shared/types';
import { isCreditLikeAccountType } from '../../shared/utils';

type CreatePayload = Omit<Asset, 'id' | 'created_at' | 'updated_at'>;

export function registerAssetHandlers(): void {
  ipcMain.handle('assets:list', () =>
    getDb().prepare('SELECT * FROM assets ORDER BY type, name').all()
  );

  ipcMain.handle('assets:create', (_e, data: CreatePayload) => {
    const id = randomUUID();
    getDb().prepare(`
      INSERT INTO assets (id, name, type, acquisition_value, current_value, acquisition_date, description)
      VALUES (?,?,?,?,?,?,?)
    `).run(id, data.name, data.type, data.acquisition_value ?? 0, data.current_value ?? 0,
           data.acquisition_date ?? null, data.description ?? null);
    return getDb().prepare('SELECT * FROM assets WHERE id = ?').get(id);
  });

  ipcMain.handle('assets:update', (_e, { id, ...data }: Partial<CreatePayload> & { id: string }) => {
    getDb().prepare(`
      UPDATE assets SET name=?, type=?, acquisition_value=?, current_value=?,
        acquisition_date=?, description=?, updated_at=datetime('now') WHERE id=?
    `).run(data.name, data.type, data.acquisition_value, data.current_value,
           data.acquisition_date ?? null, data.description ?? null, id);
    return getDb().prepare('SELECT * FROM assets WHERE id = ?').get(id);
  });

  ipcMain.handle('assets:delete', (_e, id: string) =>
    getDb().prepare('DELETE FROM assets WHERE id = ?').run(id)
  );

  ipcMain.handle('assets:getSummary', () => {
    const rows = getDb().prepare(`
      SELECT type, SUM(current_value) as total FROM assets GROUP BY type
    `).all() as { type: string; total: number }[];
    const total = rows.reduce((s, r) => s + r.total, 0);
    return { total, by_type: rows };
  });

  // Evolução mensal do patrimônio líquido. O saldo em contas é reconstruído
  // com precisão a partir do razão de lançamentos confirmados (cada
  // receita/despesa confirmada altera o patrimônio líquido em +/- o valor,
  // independente da conta/cartão usado — transferências se cancelam na soma).
  // Investimentos, bens e dívidas não têm histórico datado no modelo atual,
  // então entram pelo valor de hoje em todos os meses (só a parte "contas"
  // varia de fato mês a mês).
  ipcMain.handle('assets:getNetWorthHistory', (_e, months = 12) => {
    const db = getDb();
    const accounts = db.prepare('SELECT type, balance FROM accounts').all() as { type: string; balance: number }[];
    const currentAccountBalance = accounts.reduce((sum, account) =>
      sum + (isCreditLikeAccountType(account.type) ? -account.balance : account.balance), 0);
    const investmentsTotal = (db.prepare('SELECT COALESCE(SUM(current_value),0) AS total FROM investments').get() as { total: number }).total;
    const assetsTotal = (db.prepare('SELECT COALESCE(SUM(current_value),0) AS total FROM assets').get() as { total: number }).total;
    const debtsTotal = (db.prepare(`SELECT COALESCE(SUM(outstanding_balance),0) AS total FROM debts WHERE status NOT IN ('quitada')`).get() as { total: number }).total;

    const netAfterCutoff = db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount WHEN type='expense' THEN -amount ELSE 0 END), 0) AS net
      FROM transactions WHERE status = 'confirmed' AND date > ?
    `);

    const now = new Date();
    const result: { month: string; label: string; account_balance: number; net_worth: number }[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const cursor = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      const cutoff = `${monthEnd.getFullYear()}-${String(monthEnd.getMonth() + 1).padStart(2, '0')}-${String(monthEnd.getDate()).padStart(2, '0')}`;
      const { net } = netAfterCutoff.get(cutoff) as { net: number };
      const accountBalance = currentAccountBalance - net;
      result.push({
        month: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
        label: cursor.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
        account_balance: accountBalance,
        net_worth: accountBalance + investmentsTotal + assetsTotal - debtsTotal,
      });
    }
    return result;
  });
}
