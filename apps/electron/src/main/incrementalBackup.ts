import * as fs from 'node:fs';
import * as path from 'node:path';
import { app, safeStorage } from 'electron';
import { createHash } from 'node:crypto';
import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { getDb } from './database';
import { recomputeAllAccountBalances } from './accountBalances';
import type { IncrementalBackupResult } from '../shared/types';
import { roundMoney } from '../shared/money';

// Backup incremental complementa (não substitui) o backup completo: grava as
// linhas alteradas e tombstones desde a última exportação incremental, num
// arquivo `.finpatch` menor que um `.fin` completo. O modo manual usa senha
// portátil; o modo automático usa safeStorage local porque não há interação
// para pedir uma senha ao usuário em segundo plano.
interface SimpleTableConfig {
  table: string;
  timestampColumn: 'updated_at' | 'created_at' | 'sent_date';
}

const SIMPLE_TABLES: SimpleTableConfig[] = [
  { table: 'categories', timestampColumn: 'updated_at' },
  { table: 'budgets', timestampColumn: 'updated_at' },
  { table: 'bills', timestampColumn: 'updated_at' },
  { table: 'receivables', timestampColumn: 'updated_at' },
  { table: 'assets', timestampColumn: 'updated_at' },
  { table: 'asset_reminders', timestampColumn: 'updated_at' },
  { table: 'debts', timestampColumn: 'updated_at' },
  { table: 'credit_card_invoices', timestampColumn: 'updated_at' },
  { table: 'mei_das_payments', timestampColumn: 'updated_at' },
  { table: 'family_members', timestampColumn: 'updated_at' },
  { table: 'openfinance_connections', timestampColumn: 'updated_at' },
  { table: 'pix_payments', timestampColumn: 'updated_at' },
  { table: 'pix_recipients', timestampColumn: 'updated_at' },
  { table: 'financial_documents', timestampColumn: 'created_at' },
  { table: 'ai_conversations', timestampColumn: 'created_at' },
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
  { parentTable: 'accounts', parentKey: 'account_id', children: ['account_balance_snapshots'] },
  { parentTable: 'transactions', parentKey: 'transaction_id', children: ['transaction_payments', 'transaction_categories', 'transaction_member_splits'] },
  { parentTable: 'investments', parentKey: 'investment_id', children: ['investment_operations'] },
  { parentTable: 'goals', parentKey: 'goal_id', children: ['goal_contributions'] },
  { parentTable: 'bills', parentKey: 'bill_id', children: ['bill_payments', 'bill_categories', 'bill_price_history'] },
  { parentTable: 'receivables', parentKey: 'receivable_id', children: ['receivable_payments', 'receivable_categories', 'receivable_price_history'] },
];

type Row = Record<string, unknown>;

interface IncrementalPatch {
  since: string;
  generated_at: string;
  tables: Record<string, Row[]>;
  deleted: Record<string, { id: string; deleted_at: string }[]>;
  document_files: Record<string, string>;
}

interface EncryptedIncrementalPatch {
  format: 'fina-incremental-v2';
  encrypted: true;
  salt: string;
  iv: string;
  auth_tag: string;
  payload: string;
  iterations: number;
}

interface LocalEncryptedIncrementalPatch {
  format: 'fina-incremental-local-v1' | 'fina-incremental-v1';
  encrypted: true;
  payload: string;
}

const MAX_PATCH_ROWS = 100_000;
const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
const MAX_DOCUMENT_TOTAL_BYTES = 100 * 1024 * 1024;

function configuredTables(): Set<string> {
  return new Set([
    ...SIMPLE_TABLES.map(config => config.table),
    ...PARENT_CHILD_TABLES.flatMap(config => [config.parentTable, ...config.children]),
  ]);
}

function tableColumns(table: string): Set<string> {
  const rows = getDb().prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return new Set(rows.map(row => row.name));
}

function validateRows(table: string, rows: unknown): asserts rows is Row[] {
  if (!Array.isArray(rows)) throw new Error(`Patch incremental inválido: tabela ${table} não contém uma lista.`);
  const columns = tableColumns(table);
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`Patch incremental inválido: registro inválido na tabela ${table}.`);
    }
    const keys = Object.keys(row);
    if (keys.length < 2 || !keys.includes('id') || keys.some(key => !columns.has(key))) {
      throw new Error(`Patch incremental inválido: colunas desconhecidas na tabela ${table}.`);
    }
  }
}

function validatePatch(value: unknown): IncrementalPatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Patch incremental inválido.');
  }
  const patch = value as Partial<IncrementalPatch>;
  if (typeof patch.since !== 'string' || typeof patch.generated_at !== 'string' || !patch.tables || typeof patch.tables !== 'object' || Array.isArray(patch.tables)) {
    throw new Error('Patch incremental inválido: metadados ausentes.');
  }

  const knownTables = configuredTables();
  let totalRows = 0;
  for (const [table, rows] of Object.entries(patch.tables)) {
    if (!knownTables.has(table)) throw new Error(`Patch incremental inválido: tabela não autorizada (${table}).`);
    validateRows(table, rows);
    totalRows += rows.length;
    if (totalRows > MAX_PATCH_ROWS) throw new Error('Patch incremental excede o limite de registros.');
  }
  const deleted = patch.deleted ?? {};
  if (typeof deleted !== 'object' || Array.isArray(deleted)) throw new Error('Patch incremental inválido: exclusões inválidas.');
  let deletedRows = 0;
  for (const [table, rows] of Object.entries(deleted)) {
    if (!knownTables.has(table) || !Array.isArray(rows)) throw new Error(`Patch incremental inválido: exclusões não autorizadas (${table}).`);
    deletedRows += rows.length;
    if (totalRows + deletedRows > MAX_PATCH_ROWS) throw new Error('Patch incremental excede o limite de registros.');
    for (const row of rows) {
      if (!row || typeof row !== 'object' || typeof row.id !== 'string' || typeof row.deleted_at !== 'string') {
        throw new Error(`Patch incremental inválido: tombstone inválido na tabela ${table}.`);
      }
    }
  }
  const documentFiles = patch.document_files ?? {};
  if (typeof documentFiles !== 'object' || Array.isArray(documentFiles)) throw new Error('Patch incremental inválido: anexos inválidos.');
  let documentBytes = 0;
  for (const [id, data] of Object.entries(documentFiles)) {
    if (!id || typeof data !== 'string') throw new Error('Patch incremental inválido: anexo inválido.');
    documentBytes += Math.floor(data.length * 0.75);
    if (documentBytes > MAX_DOCUMENT_TOTAL_BYTES) throw new Error('Patch incremental excede o limite de anexos.');
  }
  const deletedDocumentIds = new Set((deleted.financial_documents ?? []).map(row => row.id));
  if ((patch.tables.financial_documents ?? []).some(row => deletedDocumentIds.has(String(row.id)))) {
    throw new Error('Patch incremental inválido.');
  }
  return { ...(patch as IncrementalPatch), deleted, document_files: documentFiles };
}

const PORTABLE_ITERATIONS = 310_000;

function assertPortablePassword(password: string): void {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('A senha do patch incremental deve ter pelo menos 8 caracteres.');
  }
}

function encodePortablePatch(patch: IncrementalPatch, password: string): string {
  assertPortablePassword(password);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = pbkdf2Sync(password, salt, PORTABLE_ITERATIONS, 32, 'sha256');
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const payload = Buffer.concat([cipher.update(JSON.stringify(patch), 'utf8'), cipher.final()]);
  const envelope: EncryptedIncrementalPatch = {
    format: 'fina-incremental-v2',
    encrypted: true,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    auth_tag: cipher.getAuthTag().toString('base64'),
    payload: payload.toString('base64'),
    iterations: PORTABLE_ITERATIONS,
  };
  return JSON.stringify(envelope);
}

function encodeLocalPatch(patch: IncrementalPatch): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Criptografia segura indisponível. O patch incremental não foi salvo.');
  }
  const payload = safeStorage.encryptString(JSON.stringify(patch)).toString('base64');
  const envelope: LocalEncryptedIncrementalPatch = { format: 'fina-incremental-local-v1', encrypted: true, payload };
  return JSON.stringify(envelope);
}

function decodePatch(raw: string, password?: string): IncrementalPatch {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || (parsed as { encrypted?: unknown }).encrypted !== true) {
    throw new Error('Patch incremental antigo ou sem criptografia não é aceito. Exporte um novo patch protegido por senha.');
  }

  const envelope = parsed as {
    format?: string;
    payload?: string;
    salt?: string;
    iv?: string;
    auth_tag?: string;
    iterations?: number;
  };
  if (envelope.format === 'fina-incremental-v2') {
    if (typeof password !== 'string') throw new Error('Informe a senha usada para exportar o patch incremental.');
    assertPortablePassword(password);
    if (typeof envelope.payload !== 'string' || typeof envelope.salt !== 'string' || typeof envelope.iv !== 'string'
      || typeof envelope.auth_tag !== 'string' || envelope.iterations !== PORTABLE_ITERATIONS) {
      throw new Error('Patch incremental inválido.');
    }
    try {
      const key = pbkdf2Sync(password, Buffer.from(envelope.salt, 'base64'), envelope.iterations, 32, 'sha256');
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(envelope.auth_tag, 'base64'));
      const decrypted = Buffer.concat([decipher.update(Buffer.from(envelope.payload, 'base64')), decipher.final()]).toString('utf8');
      return validatePatch(JSON.parse(decrypted));
    } catch {
      throw new Error('Senha incorreta ou patch incremental corrompido.');
    }
  }

  if ((envelope.format === 'fina-incremental-local-v1' || envelope.format === 'fina-incremental-v1')
    && typeof envelope.payload === 'string' && safeStorage.isEncryptionAvailable()) {
    try {
      const decrypted = safeStorage.decryptString(Buffer.from(envelope.payload, 'base64'));
      return validatePatch(JSON.parse(decrypted));
    } catch {
      throw new Error('Não foi possível descriptografar o patch incremental neste dispositivo.');
    }
  }

  throw new Error('Formato de patch incremental não suportado neste dispositivo.');
}

function tableTimestamp(table: string): 'updated_at' | 'created_at' | 'sent_date' | null {
  const columns = tableColumns(table);
  if (columns.has('updated_at')) return 'updated_at';
  if (columns.has('created_at')) return 'created_at';
  if (columns.has('sent_date')) return 'sent_date';
  return null;
}

function isRowNewerLocally(table: string, row: Row, generatedAt: string): boolean {
  const timestampColumn = tableTimestamp(table);
  if (!timestampColumn || typeof row.id !== 'string') return false;
  const local = getDb().prepare(`SELECT ${timestampColumn} AS timestamp FROM ${table} WHERE id = ?`).get(row.id) as { timestamp?: string } | undefined;
  return !!local?.timestamp && local.timestamp > generatedAt;
}

function filterFreshRows(table: string, rows: Row[], generatedAt: string): Row[] {
  return rows.filter(row => !isRowNewerLocally(table, row, generatedAt));
}

function upsertAccountRows(rows: Row[], generatedAt: string): void {
  for (const row of filterFreshRows('accounts', rows, generatedAt)) {
    const db = getDb();
    const local = db.prepare('SELECT * FROM accounts WHERE id = ?').get(row.id) as Row | undefined;
    if (!local) {
      upsertRows('accounts', [row], true, generatedAt);
      continue;
    }

    const sourceIsOpenFinance = typeof row.openfinance_provider === 'string' && !!row.openfinance_provider;
    const localIsOpenFinance = typeof local.openfinance_provider === 'string' && !!local.openfinance_provider;
    const preserved = new Set(['id', 'balance', 'opening_balance_brl', 'remote_balance', 'original_balance', 'currency']);
    const columns = Object.keys(row).filter(column => !preserved.has(column));
    const assignments = columns.map(column => `${column}=?`);
    const values = columns.map(column => row[column]);

    if (localIsOpenFinance || sourceIsOpenFinance) {
      const previousRemote = Number(local.remote_balance ?? local.balance ?? 0);
      const localDelta = Number(local.balance ?? 0) - previousRemote;
      const sourceRemote = Number(row.remote_balance ?? row.balance ?? 0);
      assignments.push('balance=?', 'remote_balance=?');
      values.push(roundMoney(sourceRemote + localDelta), sourceRemote);
    }

    if (!assignments.length) continue;
    db.prepare(`UPDATE accounts SET ${assignments.join(',')} WHERE id=?`).run(...values, row.id);
  }
}

export interface StagedDocument {
  tempPath: string;
  targetPath: string;
  previousPath?: string;
}

export class FileMutationJournal {
  private readonly backups: { original: string; backup: string }[] = [];
  private readonly installed: string[] = [];

  remove(filePath: string): void {
    if (!fs.existsSync(filePath) || this.backups.some(item => item.original === filePath)) return;
    const backup = `${filePath}.rollback-${process.pid}-${randomBytes(8).toString('hex')}`;
    fs.renameSync(filePath, backup);
    this.backups.push({ original: filePath, backup });
  }

  install(staged: StagedDocument): void {
    if (staged.previousPath && staged.previousPath !== staged.targetPath) this.remove(staged.previousPath);
    this.remove(staged.targetPath);
    fs.renameSync(staged.tempPath, staged.targetPath);
    this.installed.push(staged.targetPath);
  }

  rollback(staged: StagedDocument[]): void {
    for (const target of this.installed.reverse()) {
      try { fs.rmSync(target, { force: true }); } catch { /* continua restaurando os demais */ }
    }
    for (const item of this.backups.reverse()) {
      try { if (fs.existsSync(item.backup)) fs.renameSync(item.backup, item.original); } catch { /* melhor esforço */ }
    }
    for (const item of staged) {
      try { fs.rmSync(item.tempPath, { force: true }); } catch { /* melhor esforço */ }
    }
  }

  commit(staged: StagedDocument[]): void {
    for (const item of this.backups) {
      try { fs.rmSync(item.backup, { force: true }); } catch { /* limpeza posterior é segura */ }
    }
    for (const item of staged) {
      try { fs.rmSync(item.tempPath, { force: true }); } catch { /* limpeza posterior é segura */ }
    }
  }
}

function prepareDocumentRows(patch: IncrementalPatch, generatedAt: string): { rows: Row[]; staged: StagedDocument[] } {
  const sourceRows = patch.tables.financial_documents ?? [];
  const rows: Row[] = [];
  const staged: StagedDocument[] = [];
  const documentsDir = path.join(app.getPath('userData'), 'documents');
  fs.mkdirSync(documentsDir, { recursive: true });

  try {
    for (const row of filterFreshRows('financial_documents', sourceRows, generatedAt)) {
      const id = String(row.id);
      const data = patch.document_files[id];
      if (typeof data !== 'string') throw new Error(`O patch não contém o arquivo do documento ${row.filename ?? id}.`);
      const bytes = Buffer.from(data, 'base64');
      if (bytes.length > MAX_DOCUMENT_BYTES) throw new Error('O anexo do patch excede o limite permitido.');
      const hash = createHash('sha256').update(bytes).digest('hex');
      if (row.sha256 && row.sha256 !== hash) throw new Error(`O anexo do documento ${row.filename ?? id} está corrompido.`);
      const filename = String(row.filename ?? 'documento').replace(/[\\/]/g, '_');
      const targetPath = path.join(documentsDir, `${id}-${filename}`);
      const existing = getDb().prepare('SELECT stored_path FROM financial_documents WHERE id = ?').get(id) as { stored_path?: string } | undefined;
      if (!fs.existsSync(targetPath) || createHash('sha256').update(fs.readFileSync(targetPath)).digest('hex') !== hash) {
        const tempPath = path.join(documentsDir, `.import-${id}-${randomBytes(8).toString('hex')}.tmp`);
        fs.writeFileSync(tempPath, bytes, { mode: 0o600, flag: 'wx' });
        staged.push({ tempPath, targetPath, previousPath: existing?.stored_path });
      }
      rows.push({ ...row, stored_path: targetPath });
    }
  } catch (error) {
    for (const item of staged) fs.rmSync(item.tempPath, { force: true });
    throw error;
  }
  return { rows, staged };
}

function collectDeletedRows(sinceIso: string): Record<string, { id: string; deleted_at: string }[]> {
  const rows = getDb().prepare(`
    SELECT table_name, row_id, deleted_at
    FROM incremental_tombstones
    WHERE deleted_at > ?
  `).all(sinceIso) as { table_name: string; row_id: string; deleted_at: string }[];
  return rows.reduce<Record<string, { id: string; deleted_at: string }[]>>((result, row) => {
    (result[row.table_name] ??= []).push({ id: row.row_id, deleted_at: row.deleted_at });
    return result;
  }, {});
}

function deleteRowsFromPatch(table: string, rows: { id: string; deleted_at: string }[], files: FileMutationJournal): void {
  const timestampColumn = tableTimestamp(table);
  const statement = getDb().prepare(`SELECT ${timestampColumn ?? 'NULL'} AS timestamp FROM ${table} WHERE id = ?`);
  const deleteStatement = getDb().prepare(`DELETE FROM ${table} WHERE id = ?`);
  for (const row of rows) {
    const local = statement.get(row.id) as { timestamp?: string } | undefined;
    if (local?.timestamp && local.timestamp > row.deleted_at) continue;
    if (table === 'financial_documents') {
      const document = getDb().prepare('SELECT stored_path FROM financial_documents WHERE id = ?').get(row.id) as { stored_path?: string } | undefined;
      if (document?.stored_path) files.remove(document.stored_path);
    }
    deleteStatement.run(row.id);
  }
}

function writeProtectedFile(filePath: string, content: string): void {
  const temp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(temp, content, { encoding: 'utf-8', mode: 0o600 });
    fs.chmodSync(temp, 0o600);
    try {
      fs.renameSync(temp, filePath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (process.platform !== 'win32' || !['EEXIST', 'EPERM', 'ENOTEMPTY'].includes(code ?? '')) throw err;
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      fs.renameSync(temp, filePath);
    }
    fs.chmodSync(filePath, 0o600);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

// Mesmo formato de texto usado por `datetime('now')` em todas as colunas
// created_at/updated_at — evita comparação lexicográfica incorreta contra um
// timestamp gerado em outro formato (ex.: ISO 8601 do JS).
function sqliteNow(): string {
  return (getDb().prepare(`SELECT datetime('now') AS now`).get() as { now: string }).now;
}

function collectDocumentFiles(rows: Row[]): Record<string, string> {
  const files: Record<string, string> = {};
  let totalBytes = 0;
  for (const row of rows) {
    const id = String(row.id ?? '');
    const storedPath = typeof row.stored_path === 'string' ? row.stored_path : '';
    if (!id || !storedPath || !fs.existsSync(storedPath)) {
      throw new Error(`O documento ${row.filename ?? id} não está disponível para o patch incremental.`);
    }
    const stat = fs.statSync(storedPath);
    if (!stat.isFile() || stat.size > MAX_DOCUMENT_BYTES || totalBytes + stat.size > MAX_DOCUMENT_TOTAL_BYTES) {
      throw new Error('Os anexos excedem o limite permitido para um patch incremental.');
    }
    const data = fs.readFileSync(storedPath);
    const hash = createHash('sha256').update(data).digest('hex');
    if (row.sha256 && row.sha256 !== hash) throw new Error(`O documento ${row.filename ?? id} foi alterado fora do Fina.`);
    files[id] = data.toString('base64');
    totalBytes += stat.size;
  }
  return files;
}

function buildPatch(sinceIso: string): { patch: IncrementalPatch; tableCounts: Record<string, number> } {
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

  const generatedAt = sqliteNow();
  const deleted = collectDeletedRows(sinceIso);
  const documentFiles = collectDocumentFiles(tables.financial_documents ?? []);
  const patch: IncrementalPatch = { since: sinceIso, generated_at: generatedAt, tables, deleted, document_files: documentFiles };
  return { patch, tableCounts };
}

export function exportIncrementalBackup(sinceIso: string, filePath: string): IncrementalBackupResult {
  const { patch, tableCounts } = buildPatch(sinceIso);
  // A exportação automática não tem como pedir senha. A UI manual passa uma
  // senha para gerar o formato portátil v2.
  writeProtectedFile(filePath, encodeLocalPatch(patch));
  return { file_path: filePath, since: sinceIso, table_counts: tableCounts };
}

export function exportPortableIncrementalBackup(sinceIso: string, filePath: string, password: string): IncrementalBackupResult {
  const { patch, tableCounts } = buildPatch(sinceIso);
  writeProtectedFile(filePath, encodePortablePatch(patch, password));
  return { file_path: filePath, since: sinceIso, table_counts: tableCounts };
}

function upsertRows(table: string, rows: Row[], forceInsert: boolean, generatedAt: string): Row[] {
  if (!rows.length) return [];
  validateRows(table, rows);
  const freshRows = forceInsert ? rows : filterFreshRows(table, rows, generatedAt);
  if (!freshRows.length) return freshRows;
  const db = getDb();
  const columns = Object.keys(freshRows[0]);
  const placeholders = columns.map(() => '?').join(',');
  const sql = forceInsert
    ? `INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`
    : `INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})
       ON CONFLICT(id) DO UPDATE SET ${columns.filter(c => c !== 'id').map(c => `${c}=excluded.${c}`).join(',')}`;
  const stmt = db.prepare(sql);
  for (const row of freshRows) stmt.run(...columns.map(c => row[c]));
  return freshRows;
}

export function importIncrementalPatch(filePath: string, password?: string): void {
  const patch = decodePatch(fs.readFileSync(filePath, 'utf-8'), password);
  const documentState = prepareDocumentRows(patch, patch.generated_at);
  const files = new FileMutationJournal();
  const db = getDb();

  try {
    db.transaction(() => {
      const accountRows = patch.tables.accounts;
      if (accountRows?.length) upsertAccountRows(accountRows, patch.generated_at);

      for (const cfg of SIMPLE_TABLES) {
        const rows = cfg.table === 'financial_documents'
          ? documentState.rows
          : patch.tables[cfg.table];
        if (rows?.length) upsertRows(cfg.table, rows, false, patch.generated_at);
      }

      for (const cfg of PARENT_CHILD_TABLES) {
        // accounts.balance is um snapshot; a conta já foi mesclada acima e
        // será recalculada pelo ledger ao fim da transação.
        if (cfg.parentTable === 'accounts') {
          const parents = patch.tables.accounts;
          if (!parents?.length) continue;
          const freshParents = filterFreshRows('accounts', parents, patch.generated_at);
          const ids = freshParents.map(parent => String(parent.id));
          if (!ids.length) continue;
          const placeholders = ids.map(() => '?').join(',');
          for (const child of cfg.children) {
            db.prepare(`DELETE FROM ${child} WHERE ${cfg.parentKey} IN (${placeholders})`).run(...ids);
            const childRows = (patch.tables[child] ?? []).filter(row => ids.includes(String(row[cfg.parentKey])));
            upsertRows(child, childRows, true, patch.generated_at);
          }
          continue;
        }

        const parents = patch.tables[cfg.parentTable];
        if (!parents?.length) continue;
        const freshParents = upsertRows(cfg.parentTable, parents, false, patch.generated_at);
        if (!freshParents.length) continue;

        const ids = freshParents.map(p => p.id as string);
        const placeholders = ids.map(() => '?').join(',');
        for (const child of cfg.children) {
          db.prepare(`DELETE FROM ${child} WHERE ${cfg.parentKey} IN (${placeholders})`).run(...ids);
          const childRows = (patch.tables[child] ?? []).filter(row => ids.includes(String(row[cfg.parentKey])));
          upsertRows(child, childRows, true, patch.generated_at);
        }
      }

      for (const [table, rows] of Object.entries(patch.deleted)) {
        deleteRowsFromPatch(table, rows, files);
      }

      // Recalcula somente contas locais. Contas Open Finance usam a base
      // remota mais o delta manual, preservado no merge acima.
      recomputeAllAccountBalances();

      // Só troca os arquivos finais quando todo o trabalho SQL já passou. Se
      // qualquer rename falhar, a transação ainda está aberta e o catch
      // restaura tanto o banco quanto os arquivos anteriores.
      for (const staged of documentState.staged) files.install(staged);
    })();
    files.commit(documentState.staged);
  } catch (error) {
    files.rollback(documentState.staged);
    throw error;
  }
}

export function incrementalBackupFileName(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `incremental-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}.finpatch`;
}

type IncrementalCursor = 'automatic' | 'portable';

const CURSOR_KEYS: Record<IncrementalCursor, string> = {
  automatic: 'last_incremental_backup_at_auto',
  portable: 'last_incremental_backup_at_portable',
};

export function getLastIncrementalBackupAt(kind: IncrementalCursor = 'portable'): string {
  const db = getDb();
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(CURSOR_KEYS[kind]) as { value: string } | undefined;
  if (row?.value) return row.value;
  // Migração compatível: o marcador antigo só pode alimentar o auto-backup;
  // o primeiro patch portátil começa do início para não perder alterações.
  if (kind === 'automatic') {
    const legacy = db.prepare(`SELECT value FROM app_settings WHERE key = 'last_incremental_backup_at'`).get() as { value: string } | undefined;
    if (legacy?.value) return legacy.value;
  }
  return '1970-01-01 00:00:00';
}

export function setLastIncrementalBackupAt(value: string, kind: IncrementalCursor = 'portable'): void {
  getDb().prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(CURSOR_KEYS[kind], value);
}

export function incrementalCursorNow(): string {
  // As colunas históricas usam precisão de segundos. Um segundo de overlap
  // torna o cursor inclusivo na prática; upserts/tombstones são idempotentes.
  return (getDb().prepare(`SELECT datetime('now', '-1 second') AS now`).get() as { now: string }).now;
}

export { sqliteNow };
