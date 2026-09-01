import { createPublicKey } from 'node:crypto';
import {
  exportPrivateKey, exportPublicKey, generateX25519KeyPair, importPrivateKey, importPublicKey,
} from './mobileCrypto';
import type { KeyPair } from './mobileCrypto';

export const MOBILE_IDENTITY_PUBLIC_SETTING = 'mobile_sync_identity_public';
export const MOBILE_IDENTITY_PRIVATE_LEGACY_SETTING = 'mobile_sync_identity_private';
export const MOBILE_IDENTITY_PRIVATE_SECRET = 'mobile_sync_identity_private';

export interface MobileIdentityStorage {
  getSetting(key: string): string | null;
  setSetting(key: string, value: string): void;
  deleteSetting(key: string): void;
  getSecret(key: string): string | null;
  setSecret(key: string, value: string): void;
}

function validatedPair(publicKey: string | null, privateKey: string): KeyPair {
  const importedPrivate = importPrivateKey(privateKey);
  const derivedPublic = createPublicKey(importedPrivate);
  if (publicKey && exportPublicKey(derivedPublic) !== publicKey) throw new Error('mobile-identity-key-mismatch');
  return {
    publicKey: publicKey ? importPublicKey(publicKey) : derivedPublic,
    privateKey: importedPrivate,
  };
}

// Migração fail-safe e idempotente da identidade estática. O legado só é
// apagado depois de validar o par e confirmar a gravação no cofre.
export function loadOrCreateMobileIdentity(storage: MobileIdentityStorage): KeyPair {
  const publicValue = storage.getSetting(MOBILE_IDENTITY_PUBLIC_SETTING);
  const secretValue = storage.getSecret(MOBILE_IDENTITY_PRIVATE_SECRET);
  const legacyValue = storage.getSetting(MOBILE_IDENTITY_PRIVATE_LEGACY_SETTING);

  if (secretValue) {
    try {
      const pair = validatedPair(publicValue, secretValue);
      if (!publicValue) storage.setSetting(MOBILE_IDENTITY_PUBLIC_SETTING, exportPublicKey(pair.publicKey));
      storage.deleteSetting(MOBILE_IDENTITY_PRIVATE_LEGACY_SETTING);
      return pair;
    } catch (secretError) {
      // Uma migração interrompida pode ter deixado o segredo incompleto e o
      // legado ainda intacto. Só use o fallback se ele formar um par válido.
      if (!legacyValue) throw secretError;
    }
  }

  if (legacyValue) {
    const pair = validatedPair(publicValue, legacyValue);
    storage.setSecret(MOBILE_IDENTITY_PRIVATE_SECRET, exportPrivateKey(pair.privateKey));
    if (!publicValue) storage.setSetting(MOBILE_IDENTITY_PUBLIC_SETTING, exportPublicKey(pair.publicKey));
    storage.deleteSetting(MOBILE_IDENTITY_PRIVATE_LEGACY_SETTING);
    return pair;
  }

  if (publicValue) throw new Error('mobile-identity-private-key-missing');

  const generated = generateX25519KeyPair();
  // Grave o segredo primeiro. Se a escrita pública falhar, a próxima chamada
  // deriva novamente a chave pública do segredo e completa a operação.
  storage.setSecret(MOBILE_IDENTITY_PRIVATE_SECRET, exportPrivateKey(generated.privateKey));
  storage.setSetting(MOBILE_IDENTITY_PUBLIC_SETTING, exportPublicKey(generated.publicKey));
  storage.deleteSetting(MOBILE_IDENTITY_PRIVATE_LEGACY_SETTING);
  return generated;
}
