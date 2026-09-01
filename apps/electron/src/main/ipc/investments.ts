import { ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { getDb } from '../database';
import type { Investment, InvestmentOperation, InvestmentOperationWithInvestment, InvestmentSummary, InvestmentType } from '../../shared/types';

type CreatePayload = Omit<Investment, 'id' | 'created_at' | 'updated_at'>;
type CreateOperationPayload = Omit<InvestmentOperation, 'id' | 'created_at'>;

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
      SELECT type, SUM(applied_amount_cents) / 100.0 as applied,
        SUM(current_value_cents) / 100.0 as current
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

  // ── Livro de operações (compra/venda) — base para o cálculo de ganho de capital ──

  ipcMain.handle('investments:listOperations', (_e, investmentId?: string) => {
    const db = getDb();
    if (investmentId) {
      return db.prepare(`
        SELECT o.*, i.name AS investment_name, i.type AS investment_type
        FROM investment_operations o JOIN investments i ON i.id = o.investment_id
        WHERE o.investment_id = ? ORDER BY o.date DESC, o.rowid DESC
      `).all(investmentId) as InvestmentOperationWithInvestment[];
    }
    return db.prepare(`
      SELECT o.*, i.name AS investment_name, i.type AS investment_type
      FROM investment_operations o JOIN investments i ON i.id = o.investment_id
      ORDER BY o.date DESC, o.rowid DESC
    `).all() as InvestmentOperationWithInvestment[];
  });

  ipcMain.handle('investments:createOperation', (_e, data: CreateOperationPayload) => {
    if (data.type !== 'compra' && data.type !== 'venda') throw new Error('Tipo de operação inválido.');
    if (!Number.isFinite(data.quantity) || data.quantity <= 0) throw new Error('Informe uma quantidade válida.');
    if (!Number.isFinite(data.unit_price) || data.unit_price < 0) throw new Error('Informe um preço unitário válido.');
    if (!data.date) throw new Error('Informe a data da operação.');
    const db = getDb();
    const id = randomUUID();
    db.transaction(() => {
      db.prepare(`
        INSERT INTO investment_operations (id, investment_id, type, quantity, unit_price, fees, date, notes)
        VALUES (?,?,?,?,?,?,?,?)
      `).run(id, data.investment_id, data.type, data.quantity ?? 0, data.unit_price ?? 0,
             data.fees ?? 0, data.date, data.notes ?? null);
      // Toca updated_at do investimento pai para o backup incremental
      // ressincronizar as operações junto com ele.
      db.prepare(`UPDATE investments SET updated_at = datetime('now') WHERE id = ?`).run(data.investment_id);
    })();
    return getDb().prepare('SELECT * FROM investment_operations WHERE id = ?').get(id);
  });

  ipcMain.handle('investments:deleteOperation', (_e, id: string) => {
    const db = getDb();
    const op = db.prepare('SELECT investment_id FROM investment_operations WHERE id = ?').get(id) as { investment_id: string } | undefined;
    db.transaction(() => {
      db.prepare('DELETE FROM investment_operations WHERE id = ?').run(id);
      if (op) db.prepare(`UPDATE investments SET updated_at = datetime('now') WHERE id = ?`).run(op.investment_id);
    })();
  });
}
