import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeRequiredSchema } from '../src/main/startup';

describe('startup schema gate', () => {
  test('libera a inicialização quando todas as migrações concluem', () => {
    const result = initializeRequiredSchema(() => {});
    assert.deepEqual(result, { ok: true });
  });

  test('retorna fail-closed e preserva o erro da migração', () => {
    const failure = new Error('migration-failed');
    const result = initializeRequiredSchema(() => { throw failure; });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, failure);
  });
});
