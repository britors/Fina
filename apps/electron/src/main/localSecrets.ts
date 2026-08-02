import { app, safeStorage } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';

type SecretMap = Record<string, string>;

function secretsPath(): string {
  return path.join(app.getPath('userData'), 'local-secrets.json');
}

function readSecrets(): SecretMap {
  try {
    const parsed = JSON.parse(fs.readFileSync(secretsPath(), 'utf-8'));
    return parsed && typeof parsed === 'object' ? parsed as SecretMap : {};
  } catch {
    return {};
  }
}

function writeSecrets(secrets: SecretMap): void {
  const file = secretsPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(secrets, null, 2), { mode: 0o600 });
  try { fs.chmodSync(file, 0o600); } catch { /* noop */ }
}

export function getLocalSecret(key: string): string | null {
  const encrypted = readSecrets()[key];
  if (!encrypted || !safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
  } catch {
    return null;
  }
}

export function setLocalSecret(key: string, value: string): void {
  const trimmed = value.trim();
  if (!trimmed) return;
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Criptografia segura indisponível neste sistema. O segredo não foi salvo.');
  }
  const secrets = readSecrets();
  secrets[key] = safeStorage.encryptString(trimmed).toString('base64');
  writeSecrets(secrets);
}

export function deleteLocalSecret(key: string): void {
  const secrets = readSecrets();
  delete secrets[key];
  writeSecrets(secrets);
}
