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

function finalizePragmas(): void {
  const database = getDb();
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
}

function reopenConnection(): void {
  db?.close();
  openDatabase();
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
    database.exec(sql);
    database.prepare('INSERT INTO schema_migrations (filename) VALUES (?)').run(file);
    console.log(`Migration executada: ${file}`);
  }
}

export function closeDatabase(): void {
  db?.close();
  db = null;
}

export function dbPath(): string {
  return resolveDbPath();
}
