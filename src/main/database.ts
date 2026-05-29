import Database from 'better-sqlite3';
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) throw new Error('Banco de dados não inicializado.');
  return db;
}

export function openDatabase(): void {
  const dbPath = process.env.FINA_DB_PATH ?? path.join(app.getPath('userData'), 'fina.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  console.log(`SQLite aberto em: ${dbPath}`);
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
  return process.env.FINA_DB_PATH ?? path.join(app.getPath('userData'), 'fina.db');
}
