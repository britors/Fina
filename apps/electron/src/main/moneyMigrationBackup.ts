import * as fs from 'node:fs';

interface VacuumStatement {
  run(...params: unknown[]): unknown;
}

export interface MoneyMigrationBackupDatabase {
  prepare(sql: string): VacuumStatement;
}

export function createMoneyMigrationSafetyBackup(
  database: MoneyMigrationBackupDatabase,
  databasePath: string,
): string {
  const target = `${databasePath}.pre-money-cents-v1.fin`;
  // Uma tentativa anterior pode ter criado a cópia e falhado durante a
  // transação de schema. Como o app fica fail-closed, essa cópia ainda é o
  // estado correto anterior à migration e não deve ser substituída.
  if (fs.existsSync(target) && fs.statSync(target).size > 0) return target;

  const temp = `${target}.tmp-${process.pid}-${Date.now()}`;
  try {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
    database.prepare('VACUUM INTO ?').run(temp);
    if (!fs.existsSync(temp) || fs.statSync(temp).size === 0) {
      throw new Error('money-migration-backup-empty');
    }
    fs.chmodSync(temp, 0o600);
    fs.renameSync(temp, target);
    return target;
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}
