import Database from 'better-sqlite3-multiple-ciphers';
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

let db: Database.Database | null = null;

// Ativa apenas durante a sessão atual (nunca persistida em disco): indica se
// o banco está com criptografia ligada, para a tela de Configurações exibir
// o estado sem precisar reabrir o arquivo.
let encryptionActive = false;

// Senha atual mantida em memória apenas durante a sessão (nunca gravada em
// disco), usada para restaurar a conexão caso uma tentativa de troca/remoção
// de senha falhe no meio do caminho (a biblioteca exige destravar de novo
// imediatamente antes de qualquer rekey, mesmo com a conexão já destravada).
let currentPassword = '';

export function getDb(): Database.Database {
  if (!db) throw new Error('Banco de dados não inicializado.');
  return db;
}

// Valida um arquivo candidato sem alterar a conexão principal. Retorna null
// quando ele está criptografado e esta sessão não possui a senha; nesse caso
// o arquivo não pode ser validado com segurança e deve ser recusado pelo
// fluxo de restore.
export function validateDatabaseFile(filePath: string): boolean | null {
  let candidate: Database.Database | null = null;
  try {
    candidate = new Database(filePath, { readonly: true, fileMustExist: true });
    if (currentPassword) candidate.key(Buffer.from(currentPassword, 'utf8'));
    const result = candidate.prepare(
      `SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'`
    ).get();
    return !!result;
  } catch {
    return currentPassword ? false : null;
  } finally {
    candidate?.close();
  }
}

function resolveDbPath(): string {
  return process.env.FINA_DB_PATH ?? path.join(app.getPath('userData'), 'fina.db');
}

export function openDatabase(): void {
  const path_ = resolveDbPath();
  db = new Database(path_);
  console.log(`SQLite aberto em: ${path_}`);
}

function canReadPlaintext(): boolean {
  try {
    getDb().prepare('SELECT count(*) FROM sqlite_master').get();
    return true;
  } catch {
    return false;
  }
}

export function finalizePragmas(): void {
  const database = getDb();
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
}

function reopenConnection(): void {
  db?.close();
  openDatabase();
}

// Usado apenas no rollback de operações que fecharam a conexão no meio do
// caminho. Reaplica a senha que já estava em memória na sessão para que uma
// falha de restore/rekey não deixe o app com uma conexão inutilizável.
export function reopenWithCurrentCredentials(): void {
  openDatabase();
  if (currentPassword) getDb().key(Buffer.from(currentPassword, 'utf8'));
  if (!canReadPlaintext()) throw new Error('Não foi possível reabrir o banco restaurado.');
  finalizePragmas();
}

// true se o arquivo não puder ser lido sem antes informar uma senha (banco
// criptografado). Chamado uma vez, logo após abrir a conexão.
export function needsUnlock(): boolean {
  return !canReadPlaintext();
}

// Tenta destravar o banco com a senha informada (vazio = sem senha). Em caso
// de falha, reabre a conexão do zero para permitir uma nova tentativa.
export function unlockDatabase(password: string): boolean {
  if (password) {
    try {
      getDb().key(Buffer.from(password, 'utf8'));
    } catch {
      reopenConnection();
      return false;
    }
  }

  if (!canReadPlaintext()) {
    reopenConnection();
    return false;
  }

  finalizePragmas();
  encryptionActive = !!password;
  currentPassword = password;
  return true;
}

export function isEncryptionActive(): boolean {
  return encryptionActive;
}

// Confere se `password` destrava o banco agora mesmo; se não destravar,
// restaura a conexão para o estado (destravado) em que já estava antes,
// usando a senha da sessão atual guardada em memória.
function verifyPassword(password: string): boolean {
  try {
    if (password) getDb().key(Buffer.from(password, 'utf8'));
    if (canReadPlaintext()) return true;
  } catch {
    // segue para o rollback abaixo
  }
  reopenConnection();
  if (currentPassword) getDb().key(Buffer.from(currentPassword, 'utf8'));
  finalizePragmas();
  return false;
}

// Criptografa um banco até então sem senha.
export function enableEncryption(password: string): void {
  if (!password) throw new Error('Informe uma senha.');
  getDb().rekey(Buffer.from(password, 'utf8'));
  encryptionActive = true;
  currentPassword = password;
}

// rekey() em um banco já criptografado exige journal_mode fora de WAL
// (reescreve o arquivo inteiro página a página); volta para WAL depois.
function withRekeySafeJournalMode(fn: () => void): void {
  const database = getDb();
  database.pragma('journal_mode = DELETE');
  try {
    fn();
  } finally {
    database.pragma('journal_mode = WAL');
  }
}

// Troca a senha de um banco já criptografado. A biblioteca exige destravar
// com a senha atual imediatamente antes do rekey, mesmo que a sessão já
// esteja destravada desde a abertura do banco.
export function changeEncryptionPassword(oldPassword: string, newPassword: string): void {
  if (!newPassword) throw new Error('Informe a nova senha.');
  if (!verifyPassword(oldPassword)) throw new Error('Senha atual incorreta.');
  withRekeySafeJournalMode(() => getDb().rekey(Buffer.from(newPassword, 'utf8')));
  currentPassword = newPassword;
}

// Remove a criptografia, voltando o banco a texto plano.
export function disableEncryption(currentPasswordInput: string): void {
  if (!verifyPassword(currentPasswordInput)) throw new Error('Senha incorreta.');
  withRekeySafeJournalMode(() => getDb().rekey(Buffer.alloc(0)));
  encryptionActive = false;
  currentPassword = '';
}

export function runMigrations(): void {
  const database = getDb();

  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      executed_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const migsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migsDir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    const already = database.prepare('SELECT 1 FROM schema_migrations WHERE filename = ?').get(file);
    if (already) continue;

    const sql = fs.readFileSync(path.join(migsDir, file), 'utf-8');
    applyMigrationAtomically(database, file, sql);
    console.log(`Migration executada: ${file}`);
  }
}

interface MigrationDatabase {
  exec(sql: string): unknown;
}

// O schema e o marcador precisam ser confirmados juntos. Sem isso, uma queda
// entre `ALTER TABLE` e o INSERT em schema_migrations deixa a coluna criada,
// mas faz a próxima inicialização repetir o ALTER e falhar para sempre.
// Algumas migrações antigas já trazem BEGIN/COMMIT porque precisam desligar
// foreign_keys antes de recriar tabelas; nesses casos o marcador é injetado
// imediatamente antes do COMMIT existente.
export function applyMigrationAtomically(database: MigrationDatabase, filename: string, sql: string): void {
  const marker = `INSERT INTO schema_migrations (filename) VALUES ('${filename.replace(/'/g, "''")}');`;
  const explicitCommit = /\bCOMMIT\s*;/gi;
  const commits = [...sql.matchAll(explicitCommit)];
  const hasExplicitBegin = /\bBEGIN(?:\s+TRANSACTION)?\s*;/i.test(sql);

  try {
    if (hasExplicitBegin && commits.length) {
      const last = commits[commits.length - 1];
      const offset = last.index!;
      database.exec(`${sql.slice(0, offset)}${marker}\n${sql.slice(offset)}`);
    } else {
      database.exec(`BEGIN IMMEDIATE;\n${sql}\n${marker}\nCOMMIT;`);
    }
  } catch (error) {
    try { database.exec('ROLLBACK;'); } catch { /* a própria migração pode já ter revertido */ }
    throw error;
  } finally {
    // 006 desliga FKs fora da transação. Se ela falhar antes do PRAGMA final,
    // não deixe a conexão inteira seguir desprotegida.
    try { database.exec('PRAGMA foreign_keys = ON;'); } catch { /* preserva o erro original */ }
  }
}

export function closeDatabase(): void {
  db?.close();
  db = null;
}

export function dbPath(): string {
  return resolveDbPath();
}
