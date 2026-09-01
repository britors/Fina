import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { assertPublicSettingKey, filterPublicSettings, validatePublicSettingEntries } from '../src/main/settingsPolicy';

describe('settings IPC policy', () => {
  test('não expõe identidade privada nem estado interno', () => {
    const result = filterPublicSettings([
      { key: 'theme', value: 'dark' },
      { key: 'mobile_sync_identity_public', value: 'public' },
      { key: 'mobile_sync_identity_private', value: 'private' },
      { key: 'last_incremental_backup_at', value: 'cursor' },
    ]);
    assert.deepEqual(result, { theme: 'dark' });
  });

  test('rejeita sobrescrita de chaves reservadas', () => {
    assert.doesNotThrow(() => assertPublicSettingKey('theme'));
    assert.throws(() => assertPublicSettingKey('mobile_sync_identity_private'), /setting-not-authorized/);
    assert.throws(() => assertPublicSettingKey('chave_inventada'), /setting-not-authorized/);
  });

  test('valida tipos, tamanho e bytes nulos antes de persistir', () => {
    assert.deepEqual(validatePublicSettingEntries({ theme: 'dark' }), { theme: 'dark' });
    assert.throws(() => validatePublicSettingEntries({ theme: 1 }), /setting-value-invalid/);
    assert.throws(() => validatePublicSettingEntries({ theme: 'dark\0hidden' }), /setting-value-invalid/);
    assert.throws(() => validatePublicSettingEntries(null), /settings-payload-invalid/);
  });
});
