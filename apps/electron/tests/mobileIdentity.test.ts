import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { exportPrivateKey, exportPublicKey, generateX25519KeyPair } from '../src/main/mobileCrypto';
import {
  loadOrCreateMobileIdentity, MOBILE_IDENTITY_PRIVATE_LEGACY_SETTING,
  MOBILE_IDENTITY_PRIVATE_SECRET, MOBILE_IDENTITY_PUBLIC_SETTING, type MobileIdentityStorage,
} from '../src/main/mobileIdentity';

function memoryStorage(initialSettings: Record<string, string> = {}, initialSecrets: Record<string, string> = {}) {
  const settings = new Map(Object.entries(initialSettings));
  const secrets = new Map(Object.entries(initialSecrets));
  const storage: MobileIdentityStorage = {
    getSetting: key => settings.get(key) ?? null,
    setSetting: (key, value) => { settings.set(key, value); },
    deleteSetting: key => { settings.delete(key); },
    getSecret: key => secrets.get(key) ?? null,
    setSecret: (key, value) => { secrets.set(key, value); },
  };
  return { storage, settings, secrets };
}

describe('mobile identity storage migration', () => {
  test('migra o legado validado e preserva a mesma identidade', () => {
    const original = generateX25519KeyPair();
    const publicValue = exportPublicKey(original.publicKey);
    const privateValue = exportPrivateKey(original.privateKey);
    const memory = memoryStorage({
      [MOBILE_IDENTITY_PUBLIC_SETTING]: publicValue,
      [MOBILE_IDENTITY_PRIVATE_LEGACY_SETTING]: privateValue,
    });

    const migrated = loadOrCreateMobileIdentity(memory.storage);
    assert.equal(exportPublicKey(migrated.publicKey), publicValue);
    assert.equal(memory.secrets.get(MOBILE_IDENTITY_PRIVATE_SECRET), privateValue);
    assert.equal(memory.settings.has(MOBILE_IDENTITY_PRIVATE_LEGACY_SETTING), false);
  });

  test('falha do cofre mantém o legado recuperável', () => {
    const original = generateX25519KeyPair();
    const privateValue = exportPrivateKey(original.privateKey);
    const memory = memoryStorage({
      [MOBILE_IDENTITY_PUBLIC_SETTING]: exportPublicKey(original.publicKey),
      [MOBILE_IDENTITY_PRIVATE_LEGACY_SETTING]: privateValue,
    });
    memory.storage.setSecret = () => { throw new Error('vault-unavailable'); };

    assert.throws(() => loadOrCreateMobileIdentity(memory.storage), /vault-unavailable/);
    assert.equal(memory.settings.get(MOBILE_IDENTITY_PRIVATE_LEGACY_SETTING), privateValue);
  });

  test('não apaga nem substitui identidade com par incompatível', () => {
    const first = generateX25519KeyPair();
    const second = generateX25519KeyPair();
    const legacy = exportPrivateKey(second.privateKey);
    const memory = memoryStorage({
      [MOBILE_IDENTITY_PUBLIC_SETTING]: exportPublicKey(first.publicKey),
      [MOBILE_IDENTITY_PRIVATE_LEGACY_SETTING]: legacy,
    });

    assert.throws(() => loadOrCreateMobileIdentity(memory.storage), /mobile-identity-key-mismatch/);
    assert.equal(memory.settings.get(MOBILE_IDENTITY_PRIVATE_LEGACY_SETTING), legacy);
    assert.equal(memory.secrets.size, 0);
  });

  test('recupera gravação parcial derivando a chave pública do segredo', () => {
    const original = generateX25519KeyPair();
    const memory = memoryStorage({}, {
      [MOBILE_IDENTITY_PRIVATE_SECRET]: exportPrivateKey(original.privateKey),
    });

    const recovered = loadOrCreateMobileIdentity(memory.storage);
    assert.equal(exportPublicKey(recovered.publicKey), exportPublicKey(original.publicKey));
    assert.equal(memory.settings.get(MOBILE_IDENTITY_PUBLIC_SETTING), exportPublicKey(original.publicKey));
  });

  test('nova identidade nunca grava a chave privada em app_settings', () => {
    const memory = memoryStorage();
    const created = loadOrCreateMobileIdentity(memory.storage);
    assert.equal(memory.settings.get(MOBILE_IDENTITY_PUBLIC_SETTING), exportPublicKey(created.publicKey));
    assert.equal(memory.settings.has(MOBILE_IDENTITY_PRIVATE_LEGACY_SETTING), false);
    assert.equal(memory.secrets.has(MOBILE_IDENTITY_PRIVATE_SECRET), true);
  });
});
