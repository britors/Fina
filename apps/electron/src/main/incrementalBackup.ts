import * as fs from 'node:fs';
import { getDb } from './database';
import type { IncrementalBackupResult } from '../shared/types';

// Backup incremental complementa (não substitui) o backup completo: grava só
// as linhas alteradas desde a última exportação incremental, num arquivo
// `.finpatch` (JSON) bem menor que um `.fin` completo. Limitações conhecidas,
// mostradas na tela de Configurações:
//   - Não captura exclusões (uma linha apagada no aparelho de origem não é
//     removida ao importar o patch) — por isso o autobackup completo
//     continua rodando periodicamente para reconciliar o estado real.
//   - `categories` e `family_members` não têm coluna `updated_at`: edições
//     (renomear/recolorir uma categoria, por exemplo) não entram no patch,
//     só registros novos.
interface SimpleTableConfig {
  table: string;
  timestampColumn: 'updated_at' | 'created_at';
}

const SIMPLE_TABLES: SimpleTableConfig[] = [
  { table: 'accounts', timestampColumn: 'updated_at' },
  { table: 'categories', timestampColumn: 'created_at' },
  { table: 'budgets', timestampColumn: 'updated_at' },
  { table: 'bills', timestampColumn: 'updated_at' },
  { table: 'receivables', timestampColumn: 'updated_at' },
  { table: 'assets', timestampColumn: 'updated_at' },
  { table: 'asset_reminders', timestampColumn: 'updated_at' },
  { table: 'debts', timestampColumn: 'updated_at' },
  { table: 'credit_card_invoices', timestampColumn: 'updated_at' },
  { table: 'mei_das_payments', timestampColumn: 'updated_at' },
  { table: 'family_members', timestampColumn: 'created_at' },
];

// Tabelas "filhas" são sempre reescritas por inteiro (delete+insert) sempre
// que a linha "pai" é tocada (mesmo padrão de replaceTransactionPayments/
// replaceTransactionCategories/replaceTransactionMemberSplits já usado no
// app) — por isso é seguro ressincronizar todas as filhas de um pai incluído
// no patch, sem precisar de coluna de data própria nas filhas.
interface ParentChildConfig {
  parentTable: string;
  parentKey: string;
  children: string[];
}

const PARENT_CHILD_TABLES: ParentChildConfig[] = [
  { parentTable: 'transactions', parentKey: 'transaction_id', children: ['transaction_payments', 'transaction_categories', 'transaction_member_splits'] },
  { parentTable: 'investments', parentKey: 'investment_id', children: ['investment_operations'] },
  { parentTable: 'goals', parentKey: 'goal_id', children: ['goal_contributions'] },
];

type Row = Record<string, unknown>;

interface IncrementalPatch {
  since: string;
  generated_at: string;
  tables: Record<string, Row[]>;
}

// Mesmo formato de texto usado por `datetime('now')` em todas as colunas
// created_at/updated_at — evita comparação lexicográfica incorreta contra um
// timestamp gerado em outro formato (ex.: ISO 8601 do JS).
function sqliteNow(): string {
  return (getDb().prepare(`SELECT datetime('now') AS now`).get() as { now: string }).now;
}

export function exportIncrementalBackup(sinceIso: string, filePath: string): IncrementalBackupResult {
  const db = getDb();
  const tables: Record<string, Row[]> = {};
  const tableCounts: Record<string, number> = {};

  for (const cfg of SIMPLE_TABLES) {
    const rows = db.prepare(`SELECT * FROM ${cfg.table} WHERE ${cfg.timestampColumn} > ?`).all(sinceIso) as Row[];
    if (rows.length) {
      tables[cfg.table] = rows;
      tableCounts[cfg.table] = rows.length;
    }
  }

  for (const cfg of PARENT_CHILD_TABLES) {
    const parents = db.prepare(`SELECT * FROM ${cfg.parentTable} WHERE updated_at > ?`).all(sinceIso) as Row[];
    if (!parents.length) continue;
    tables[cfg.parentTable] = parents;
    tableCounts[cfg.parentTable] = parents.length;

    const ids = parents.map(p => p.id as string);
    const placeholders = ids.map(() => '?').join(',');
    for (const child of cfg.children) {
      const rows = db.prepare(`SELECT * FROM ${child} WHERE ${cfg.parentKey} IN (${placeholders})`).all(...ids) as Row[];
      tables[child] = rows;
      if (rows.length) tableCounts[child] = rows.length;
    }
  }

  const patch: IncrementalPatch = { since: sinceIso, generated_at: sqliteNow(), tables };
  fs.writeFileSync(filePath, JSON.stringify(patch), 'utf-8');
  return { file_path: filePath, since: sinceIso, table_counts: tableCounts };
}

function upsertRows(table: string, rows: Row[], forceInsert: boolean): void {
  if (!rows.length) return;
  const db = getDb();
  const columns = Object.keys(rows[0]);
  const placeholders = columns.map(() => '?').join(',');
  const sql = forceInsert
    ? `INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`
    : `INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})
       ON CONFLICT(id) DO UPDATE SET ${columns.filter(c => c !== 'id').map(c => `${c}=excluded.${c}`).join(',')}`;
  const stmt = db.prepare(sql);
  for (const row of rows) stmt.run(...columns.map(c => row[c]));
}

export function importIncrementalPatch(filePath: string): void {
  const patch = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as IncrementalPatch;
  const db = getDb();

  db.transaction(() => {
    for (const cfg of SIMPLE_TABLES) {
      const rows = patch.tables[cfg.table];
      if (rows?.length) upsertRows(cfg.table, rows, false);
    }

    for (const cfg of PARENT_CHILD_TABLES) {
      const parents = patch.tables[cfg.parentTable];
      if (!parents?.length) continue;
      upsertRows(cfg.parentTable, parents, false);

      const ids = parents.map(p => p.id as string);
      const placeholders = ids.map(() => '?').join(',');
      for (const child of cfg.children) {
        db.prepare(`DELETE FROM ${child} WHERE ${cfg.parentKey} IN (${placeholders})`).run(...ids);
        upsertRows(child, patch.tables[child] ?? [], true);
      }
    }
  })();
}

export function incrementalBackupFileName(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `incremental-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}.finpatch`;
}

export function getLastIncrementalBackupAt(): string {
  const row = getDb().prepare(`SELECT value FROM app_settings WHERE key = 'last_incremental_backup_at'`).get() as { value: string } | undefined;
  return row?.value ?? '1970-01-01 00:00:00';
}

export function setLastIncrementalBackupAt(value: string): void {
  getDb().prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('last_incremental_backup_at', ?)`).run(value);
}

export { sqliteNow };
