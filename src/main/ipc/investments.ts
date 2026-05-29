import { ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { getDb } from '../database';
import type { Investment, InvestmentSummary, InvestmentType } from '../../shared/types';

type CreatePayload = Omit<Investment, 'id' | 'created_at' | 'updated_at'>;

const TYPE_COLORS: Record<InvestmentType, string> = {
  renda_fixa:     '#1D9E75',
  renda_variavel: '#3B82F6',
  fundo:          '#8B5CF6',
  cripto:         '#EF9F27',
  outro:          '#A8A8A8',
};

const TYPE_LABELS: Record<InvestmentType, string> = {
  renda_fixa:     'Renda Fixa',
  renda_variavel: 'Renda Variável',
  fundo:          'Fundos',
  cripto:         'Criptomoedas',
  outro:          'Outros',
};

export function registerInvestmentHandlers(): void {
  ipcMain.handle('investments:list', () =>
    getDb().prepare('SELECT * FROM investments ORDER BY type, name').all()
  );

  ipcMain.handle('investments:create', (_e, data: CreatePayload) => {
    const id = randomUUID();
    getDb().prepare(`
      INSERT INTO investments (id, name, type, institution, applied_amount, current_value, application_date, maturity_date, notes)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(id, data.name, data.type, data.institution ?? null, data.applied_amount ?? 0,
           data.current_value ?? 0, data.application_date ?? null,
           data.maturity_date ?? null, data.notes ?? null);
    return getDb().prepare('SELECT * FROM investments WHERE id = ?').get(id);
  });

  ipcMain.handle('investments:update', (_e, { id, ...data }: Partial<CreatePayload> & { id: string }) => {
    getDb().prepare(`
      UPDATE investments SET name=?, type=?, institution=?, applied_amount=?, current_value=?,
        application_date=?, maturity_date=?, notes=?, updated_at=datetime('now') WHERE id=?
    `).run(data.name, data.type, data.institution ?? null, data.applied_amount, data.current_value,
           data.application_date ?? null, data.maturity_date ?? null, data.notes ?? null, id);
    return getDb().prepare('SELECT * FROM investments WHERE id = ?').get(id);
  });

  ipcMain.handle('investments:delete', (_e, id: string) =>
    getDb().prepare('DELETE FROM investments WHERE id = ?').run(id)
  );

  ipcMain.handle('investments:getSummary', (): InvestmentSummary => {
    const rows = getDb().prepare(`
      SELECT type, SUM(applied_amount) as applied, SUM(current_value) as current
      FROM investments GROUP BY type
    `).all() as { type: InvestmentType; applied: number; current: number }[];

    const total_applied = rows.reduce((s, r) => s + r.applied, 0);
    const total_current = rows.reduce((s, r) => s + r.current, 0);
    const gain = total_current - total_applied;
    const gain_pct = total_applied > 0 ? (gain / total_applied) * 100 : 0;

    return {
      total_applied,
      total_current,
      gain,
      gain_pct,
      by_type: rows.map(r => ({
        type: r.type,
        label: TYPE_LABELS[r.type],
        total: r.current,
        color: TYPE_COLORS[r.type],
      })),
    };
  });
}
