import { ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { getDb } from '../database';
import type { Goal, GoalContribution, GoalContributionWithMember } from '../../shared/types';
import { fromCents, toExactCents } from '../../shared/money';

type CreatePayload = Omit<Goal, 'id' | 'created_at' | 'updated_at'>;
type CreateContributionPayload = Omit<GoalContribution, 'id'>;

export function registerGoalHandlers(): void {
  ipcMain.handle('goals:list', () =>
    getDb().prepare(`SELECT * FROM goals ORDER BY target_date ASC NULLS LAST, name`).all()
  );

  ipcMain.handle('goals:create', (_e, data: CreatePayload) => {
    const id = randomUUID();
    const targetCents = toExactCents(data.target_amount ?? 0);
    const currentCents = toExactCents(data.current_amount ?? 0);
    getDb().prepare(`
      INSERT INTO goals (id, name, type, target_amount, target_amount_cents, current_amount, current_amount_cents, target_date, account_id, description)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(id, data.name, data.type, fromCents(targetCents), targetCents, fromCents(currentCents), currentCents,
           data.target_date ?? null, data.account_id ?? null, data.description ?? null);
    return getDb().prepare('SELECT * FROM goals WHERE id = ?').get(id);
  });

  ipcMain.handle('goals:update', (_e, { id, ...data }: Partial<CreatePayload> & { id: string }) => {
    const targetCents = toExactCents(data.target_amount ?? 0);
    const currentCents = toExactCents(data.current_amount ?? 0);
    getDb().prepare(`
      UPDATE goals SET name=?, type=?, target_amount_cents=?, current_amount_cents=?,
        target_date=?, account_id=?, description=?, updated_at=datetime('now')
      WHERE id=?
    `).run(data.name, data.type, targetCents, currentCents,
           data.target_date ?? null, data.account_id ?? null, data.description ?? null, id);
    return getDb().prepare('SELECT * FROM goals WHERE id = ?').get(id);
  });

  ipcMain.handle('goals:delete', (_e, id: string) =>
    getDb().prepare('DELETE FROM goals WHERE id = ?').run(id)
  );

  // ── Contribuições por pessoa ──────────────────────────────────────────────
  // `goals.current_amount` continua sendo a fonte da verdade e continua
  // editável direto (fallback de quem não usa membros); registrar uma
  // contribuição aqui só soma o valor a current_amount.

  ipcMain.handle('goals:listContributions', (_e, goalId: string) =>
    getDb().prepare(`
      SELECT c.*, m.name AS member_name
      FROM goal_contributions c LEFT JOIN family_members m ON m.id = c.member_id
      WHERE c.goal_id = ? ORDER BY c.date DESC, c.rowid DESC
    `).all(goalId) as GoalContributionWithMember[]
  );

  ipcMain.handle('goals:addContribution', (_e, data: CreateContributionPayload) => {
    let amountCents: number;
    try { amountCents = toExactCents(data.amount); } catch { throw new Error('Informe um valor de aporte válido com no máximo 2 casas decimais.'); }
    if (amountCents <= 0) throw new Error('Informe um valor de aporte válido.');
    const db = getDb();
    const id = randomUUID();
    db.transaction(() => {
      db.prepare(`
        INSERT INTO goal_contributions (id, goal_id, member_id, amount, amount_cents, date, note) VALUES (?,?,?,?,?,?,?)
      `).run(id, data.goal_id, data.member_id ?? null, fromCents(amountCents), amountCents, data.date ?? new Date().toISOString().slice(0, 10), data.note ?? null);
      db.prepare(`UPDATE goals SET current_amount_cents = current_amount_cents + ?, updated_at = datetime('now') WHERE id = ?`)
        .run(amountCents, data.goal_id);
    })();
    return getDb().prepare('SELECT * FROM goal_contributions WHERE id = ?').get(id);
  });

  ipcMain.handle('goals:deleteContribution', (_e, id: string) => {
    const db = getDb();
    const contribution = db.prepare('SELECT amount_cents, goal_id FROM goal_contributions WHERE id = ?').get(id) as { amount_cents: number; goal_id: string } | undefined;
    if (!contribution) return;
    db.transaction(() => {
      db.prepare(`UPDATE goals SET current_amount_cents = current_amount_cents - ?, updated_at = datetime('now') WHERE id = ?`)
        .run(contribution.amount_cents, contribution.goal_id);
      db.prepare('DELETE FROM goal_contributions WHERE id = ?').run(id);
    })();
  });
}
