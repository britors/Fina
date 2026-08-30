import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileMutationJournal, type StagedDocument } from '../src/main/incrementalBackup';

test('rollback restaura anexo sobrescrito', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fina-file-journal-'));
  try {
    const targetPath = join(dir, 'document.pdf');
    const tempPath = join(dir, 'incoming.tmp');
    writeFileSync(targetPath, 'original');
    writeFileSync(tempPath, 'novo');
    const staged: StagedDocument = { targetPath, tempPath };
    const journal = new FileMutationJournal();

    journal.install(staged);
    assert.equal(readFileSync(targetPath, 'utf8'), 'novo');
    journal.rollback([staged]);
    assert.equal(readFileSync(targetPath, 'utf8'), 'original');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('commit preserva anexo novo e elimina cópia de rollback', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fina-file-journal-'));
  try {
    const targetPath = join(dir, 'document.pdf');
    const tempPath = join(dir, 'incoming.tmp');
    writeFileSync(targetPath, 'original');
    writeFileSync(tempPath, 'novo');
    const staged: StagedDocument = { targetPath, tempPath };
    const journal = new FileMutationJournal();

    journal.install(staged);
    journal.commit([staged]);
    assert.equal(readFileSync(targetPath, 'utf8'), 'novo');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
