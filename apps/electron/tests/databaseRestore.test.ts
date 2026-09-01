import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  replaceDatabaseFile, validateRestoredDatabase, type DatabaseRestoreLifecycle,
} from '../src/main/databaseRestore';

function withFiles(run: (paths: { dir: string; source: string; target: string; safety: string }) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'fina-restore-'));
  const paths = {
    dir,
    source: join(dir, 'incoming.fin'),
    target: join(dir, 'fina.db'),
    safety: join(dir, 'fina.db.bak'),
  };
  writeFileSync(paths.source, 'restored');
  writeFileSync(paths.target, 'current');
  writeFileSync(paths.safety, 'current');
  writeFileSync(paths.target + '-wal', 'pending wal');
  writeFileSync(paths.target + '-shm', 'pending shm');
  try {
    run(paths);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('database file restore', () => {
  test('instala e valida o backup, remove sidecars e elimina a cópia temporária', () => {
    withFiles(paths => {
      const calls: string[] = [];
      const lifecycle: DatabaseRestoreLifecycle = {
        closeDatabase: () => { calls.push('close'); },
        openRestoredDatabase: () => {
          calls.push('validate');
          assert.equal(readFileSync(paths.target, 'utf8'), 'restored');
        },
        reopenPreviousDatabase: () => { calls.push('reopen'); },
      };

      replaceDatabaseFile(paths.source, paths.target, paths.safety, lifecycle);

      assert.equal(readFileSync(paths.target, 'utf8'), 'restored');
      assert.equal(existsSync(paths.target + '-wal'), false);
      assert.equal(existsSync(paths.target + '-shm'), false);
      assert.equal(existsSync(paths.safety), false);
      assert.deepEqual(calls, ['close', 'validate']);
    });
  });

  test('restaura o banco anterior quando a abertura do backup falha', () => {
    withFiles(paths => {
      const calls: string[] = [];
      const lifecycle: DatabaseRestoreLifecycle = {
        closeDatabase: () => { calls.push('close'); },
        openRestoredDatabase: () => {
          calls.push('validate');
          throw new Error('invalid-restored-database');
        },
        reopenPreviousDatabase: () => {
          calls.push('reopen');
          assert.equal(readFileSync(paths.target, 'utf8'), 'current');
        },
      };

      assert.throws(
        () => replaceDatabaseFile(paths.source, paths.target, paths.safety, lifecycle),
        /invalid-restored-database/,
      );
      assert.equal(readFileSync(paths.target, 'utf8'), 'current');
      assert.equal(existsSync(paths.safety), true);
      assert.deepEqual(calls, ['close', 'validate', 'close', 'reopen']);
    });
  });

  test('preserva o erro original e reporta uma falha adicional de rollback', () => {
    withFiles(paths => {
      const rollbackErrors: unknown[] = [];
      const lifecycle: DatabaseRestoreLifecycle = {
        closeDatabase: () => undefined,
        openRestoredDatabase: () => { throw new Error('restore-failed'); },
        reopenPreviousDatabase: () => { throw new Error('rollback-failed'); },
        reportRollbackError: error => { rollbackErrors.push(error); },
      };

      assert.throws(
        () => replaceDatabaseFile(paths.source, paths.target, paths.safety, lifecycle),
        /restore-failed/,
      );
      assert.equal(rollbackErrors.length, 1);
      assert.match(String(rollbackErrors[0]), /rollback-failed/);
    });
  });
});

describe('restored database validation', () => {
  test('backup plaintext executa migrações sem usar validação cifrada', () => {
    let migrations = 0;
    let encryptedValidations = 0;
    validateRestoredDatabase(true, {
      runMigrations: () => { migrations += 1; },
      validateEncryptedDatabase: () => { encryptedValidations += 1; return false; },
    });
    assert.equal(migrations, 1);
    assert.equal(encryptedValidations, 0);
  });

  test('backup criptografado aceito exige validação positiva da sessão', () => {
    let migrations = 0;
    validateRestoredDatabase(false, {
      runMigrations: () => { migrations += 1; },
      validateEncryptedDatabase: () => true,
    });
    assert.equal(migrations, 0);
  });

  test('backup criptografado inválido ou sem credencial é recusado', () => {
    for (const result of [false, null]) {
      assert.throws(
        () => validateRestoredDatabase(false, {
          runMigrations: () => undefined,
          validateEncryptedDatabase: () => result,
        }),
        /validar o backup criptografado/,
      );
    }
  });
});
