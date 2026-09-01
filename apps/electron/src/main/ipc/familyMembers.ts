import { ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { getDb } from '../database';
import { simplifyDebts } from '../../shared/utils';
import type { FamilyMember, FamilySettlement } from '../../shared/types';
import { roundMoney } from '../../shared/money';

// Backfill preguiçoso: se a tabela nova ainda está vazia e existe a lista em
// texto livre legada (`app_settings.family_members`, CSV), popula a tabela a
// partir dela. Não apaga/mexe na setting legada — o combo "Responsável" em
// Lançamentos continua funcionando exatamente como antes.
function backfillFromLegacySetting(): void {
  const db = getDb();
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM family_members').get() as { n: number };
  if (n > 0) return;

  const setting = db.prepare(`SELECT value FROM app_settings WHERE key = 'family_members'`).get() as { value: string } | undefined;
  const names = (setting?.value ?? '').split(',').map(v => v.trim()).filter(Boolean);
  if (names.length === 0) return;

  const insert = db.prepare("INSERT INTO family_members (id, name, updated_at) VALUES (?, ?, datetime('now'))");
  db.transaction(() => {
    for (const name of names) insert.run(randomUUID(), name);
  })();
}

function round2(n: number): number {
  return roundMoney(n);
}

function computeSettlement(dateFrom?: string, dateTo?: string): FamilySettlement {
  const db = getDb();
  const members = db.prepare('SELECT * FROM family_members ORDER BY name').all() as FamilyMember[];

  const conds = [`t.paid_by_member_id IS NOT NULL`, `t.status = 'confirmed'`];
  const params: string[] = [];
  if (dateFrom) { conds.push('t.date >= ?'); params.push(dateFrom); }
  if (dateTo) { conds.push('t.date <= ?'); params.push(dateTo); }

  const rows = db.prepare(`
    SELECT t.paid_by_member_id, s.member_id, s.share_amount
    FROM transactions t JOIN transaction_member_splits s ON s.transaction_id = t.id
    WHERE ${conds.join(' AND ')}
  `).all(...params) as { paid_by_member_id: string; member_id: string; share_amount: number }[];

  const net = new Map<string, number>(members.map(m => [m.id, 0]));
  for (const row of rows) {
    if (row.member_id === row.paid_by_member_id) continue; // parte do próprio pagador não gera dívida
    net.set(row.paid_by_member_id, (net.get(row.paid_by_member_id) ?? 0) + row.share_amount);
    net.set(row.member_id, (net.get(row.member_id) ?? 0) - row.share_amount);
  }

  const balances = members.map(m => ({ member_id: m.id, member_name: m.name, net: round2(net.get(m.id) ?? 0) }));
  return { balances, transfers: simplifyDebts(balances) };
}

export function registerFamilyMemberHandlers(): void {
  ipcMain.handle('familyMembers:list', (): FamilyMember[] => {
    backfillFromLegacySetting();
    return getDb().prepare('SELECT * FROM family_members ORDER BY name').all() as FamilyMember[];
  });

  ipcMain.handle('familyMembers:create', (_e, data: { name: string }) => {
    const name = data.name.trim();
    if (!name) throw new Error('Informe o nome do membro.');
    const id = randomUUID();
    getDb().prepare("INSERT INTO family_members (id, name, updated_at) VALUES (?, ?, datetime('now'))").run(id, name);
    return getDb().prepare('SELECT * FROM family_members WHERE id = ?').get(id);
  });

  ipcMain.handle('familyMembers:update', (_e, { id, name }: { id: string; name: string }) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Informe o nome do membro.');
    getDb().prepare("UPDATE family_members SET name = ?, updated_at = datetime('now') WHERE id = ?").run(trimmed, id);
    return getDb().prepare('SELECT * FROM family_members WHERE id = ?').get(id);
  });

  ipcMain.handle('familyMembers:delete', (_e, id: string) =>
    getDb().prepare('DELETE FROM family_members WHERE id = ?').run(id)
  );

  ipcMain.handle('family:getSettlement', (_e, filters: { dateFrom?: string; dateTo?: string } = {}): FamilySettlement =>
    computeSettlement(filters.dateFrom, filters.dateTo)
  );
}
