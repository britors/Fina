import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { assertSafeIpcArguments, optionalNullableString, requireRecord, requireString } from '../src/main/ipcValidation';

describe('IPC payload validation', () => {
  test('rejeita objetos, strings e caminhos malformados', () => {
    assert.throws(() => requireRecord(null), /payload-invalid/);
    assert.throws(() => requireRecord([]), /payload-invalid/);
    assert.throws(() => requireString('  '), /string-empty/);
    assert.throws(() => requireString('a\0b'), /string-invalid/);
    assert.throws(() => requireString('123', { pattern: /^\d{6}$/ }), /string-invalid/);
  });

  test('aceita limites e nullable explícitos', () => {
    assert.equal(requireString('123456', { maxLength: 6, pattern: /^\d{6}$/ }), '123456');
    assert.equal(optionalNullableString(null), null);
    assert.equal(optionalNullableString(''), '');
  });

  test('barreira global rejeita números não finitos, ciclos e profundidade excessiva', () => {
    assert.doesNotThrow(() => assertSafeIpcArguments([{ id: 'abc', values: [1, 2, 3] }]));
    assert.throws(() => assertSafeIpcArguments([{ amount: Number.NaN }]), /ipc-payload-invalid/);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    assert.throws(() => assertSafeIpcArguments([cyclic]), /ipc-payload-invalid/);
    let deep: Record<string, unknown> = {};
    const root = deep;
    for (let i = 0; i < 22; i++) {
      deep.next = {};
      deep = deep.next as Record<string, unknown>;
    }
    assert.throws(() => assertSafeIpcArguments([root]), /ipc-payload-too-complex/);
  });
});
