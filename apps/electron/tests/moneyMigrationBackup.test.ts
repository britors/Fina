import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createMoneyMigrationSafetyBackup, type MoneyMigrationBackupDatabase,
} from '../src/main/moneyMigrationBackup';

test('backup pré-migração é consistente, protegido e idempotente', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fina-money-migration-'));
  const databasePath = join(dir, 'fina.db');
  const db = new DatabaseSync(databasePath);
  try {
    db.exec("CREATE TABLE ledger (value INTEGER); INSERT INTO ledger VALUES (123);");
    const backupPath = createMoneyMigrationSafetyBackup(
      db as unknown as MoneyMigrationBackupDatabase,
      databasePath,
    );
    const backupStat = statSync(backupPath);
    assert.ok(backupStat.size > 0);
    // Windows expõe ACLs NTFS, não bits POSIX; `chmod(0600)` é aceito, mas
    // `stat().mode` continua reportando 0666. O isolamento por 0600 é
    // verificável somente nas plataformas POSIX.
    if (process.platform !== 'win32') assert.equal(backupStat.mode & 0o777, 0o600);

    const backup = new DatabaseSync(backupPath, { readOnly: true });
    try {
      assert.equal(backup.prepare('SELECT value FROM ledger').get()!.value, 123);
    } finally {
      backup.close();
    }

    db.exec('UPDATE ledger SET value = 456;');
    assert.equal(
      createMoneyMigrationSafetyBackup(db as unknown as MoneyMigrationBackupDatabase, databasePath),
      backupPath,
    );
    const preserved = new DatabaseSync(backupPath, { readOnly: true });
    try {
      assert.equal(preserved.prepare('SELECT value FROM ledger').get()!.value, 123);
    } finally {
      preserved.close();
    }
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
