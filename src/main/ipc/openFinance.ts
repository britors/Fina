import { app, ipcMain, safeStorage } from 'electron';
import { randomUUID, createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getDb } from '../database';
import type { AccountType, TransactionType } from '../../shared/types';

type OpenFinanceProvider = 'pluggy' | 'belvo' | 'klavi';

interface ProviderSettings {
  enabled: boolean;
  hasClientId: boolean;
  hasClientSecret: boolean;
  hasApiKey: boolean;
  sandbox: boolean;
  connectionId: string;
}

interface OpenFinanceSettings {
  encryptionAvailable: boolean;
  providers: Record<OpenFinanceProvider, ProviderSettings>;
}

interface SaveProviderPayload {
  provider: OpenFinanceProvider;
  enabled: boolean;
  sandbox: boolean;
  clientId?: string;
  clientSecret?: string;
  apiKey?: string;
  connectionId?: string;
}

interface SyncResult {
  provider: OpenFinanceProvider;
  accountsCreated: number;
  accountsUpdated: number;
  transactionsImported: number;
  transactionsSkipped: number;
}

type RemoteAccount = {
  id: string;
  name: string;
  type: AccountType;
  bankName: string | null;
  balance: number;
  creditLimit: number | null;
};

type RemoteTransaction = {
  id: string;
  accountId: string;
  description: string;
  amount: number;
  type: TransactionType;
  date: string;
};

const PROVIDERS: OpenFinanceProvider[] = ['pluggy', 'belvo', 'klavi'];

function secretsPath(): string {
  return path.join(app.getPath('userData'), 'open-finance-secrets.json');
}

function settingKey(provider: OpenFinanceProvider, key: string): string {
  return `openfinance_${provider}_${key}`;
}

function getSetting(key: string, fallback = ''): string {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? fallback;
}

function setSettings(entries: Record<string, string>): void {
  const stmt = getDb().prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?,?)');
  const tx = getDb().transaction((kvs: [string, string][]) => {
    for (const [key, value] of kvs) stmt.run(key, value);
  });
  tx(Object.entries(entries));
}

function readSecrets(): Record<string, string> {
  try {
    const raw = fs.readFileSync(secretsPath(), 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeSecrets(secrets: Record<string, string>): void {
  const file = secretsPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(secrets, null, 2), { mode: 0o600 });
  try { fs.chmodSync(file, 0o600); } catch { /* noop */ }
}

function secretKey(provider: OpenFinanceProvider, field: string): string {
  return `${provider}_${field}`;
}

function saveSecret(provider: OpenFinanceProvider, field: string, value: string | undefined): void {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return;
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Criptografia segura indisponível neste sistema. As credenciais de Open Finance não foram salvas.');
  }
  const secrets = readSecrets();
  secrets[secretKey(provider, field)] = safeStorage.encryptString(trimmed).toString('base64');
  writeSecrets(secrets);
}

function hasSecret(provider: OpenFinanceProvider, field: string): boolean {
  const enc = readSecrets()[secretKey(provider, field)];
  if (!enc || !safeStorage.isEncryptionAvailable()) return false;
  try {
    safeStorage.decryptString(Buffer.from(enc, 'base64'));
    return true;
  } catch {
    return false;
  }
}

function clearProviderSecrets(provider: OpenFinanceProvider): void {
  const secrets = readSecrets();
  delete secrets[secretKey(provider, 'clientId')];
  delete secrets[secretKey(provider, 'clientSecret')];
  delete secrets[secretKey(provider, 'apiKey')];
  writeSecrets(secrets);
}

function settings(): OpenFinanceSettings {
  const providers = Object.fromEntries(PROVIDERS.map(provider => [provider, {
    enabled: getSetting(settingKey(provider, 'enabled'), 'false') === 'true',
    sandbox: getSetting(settingKey(provider, 'sandbox'), 'true') === 'true',
    connectionId: getSetting(settingKey(provider, 'connection_id'), ''),
    hasClientId: hasSecret(provider, 'clientId'),
    hasClientSecret: hasSecret(provider, 'clientSecret'),
    hasApiKey: hasSecret(provider, 'apiKey'),
  }])) as Record<OpenFinanceProvider, ProviderSettings>;

  return {
    encryptionAvailable: safeStorage.isEncryptionAvailable(),
    providers,
  };
}

function assertProvider(provider: string): asserts provider is OpenFinanceProvider {
  if (!PROVIDERS.includes(provider as OpenFinanceProvider)) {
    throw new Error('Provedor de Open Finance inválido.');
  }
}

export function registerOpenFinanceHandlers(): void {
  ipcMain.handle('openFinance:getSettings', () => settings());

  ipcMain.handle('openFinance:saveProvider', (_e, data: SaveProviderPayload) => {
    assertProvider(data.provider);
    setSettings({
      [settingKey(data.provider, 'enabled')]: data.enabled ? 'true' : 'false',
      [settingKey(data.provider, 'sandbox')]: data.sandbox ? 'true' : 'false',
    });
  saveSecret(data.provider, 'clientId', data.clientId);
  saveSecret(data.provider, 'clientSecret', data.clientSecret);
  saveSecret(data.provider, 'apiKey', data.apiKey);
    setSettings({ [settingKey(data.provider, 'connection_id')]: data.connectionId?.trim() ?? '' });
    return settings();
  });

  ipcMain.handle('openFinance:clearProviderSecrets', (_e, provider: string) => {
    assertProvider(provider);
    clearProviderSecrets(provider);
    return settings();
  });

  ipcMain.handle('openFinance:testProvider', async (_e, provider: string) => {
    assertProvider(provider);
    if (provider !== 'pluggy') {
      throw new Error('Teste automático disponível nesta versão apenas para Pluggy.');
    }
    const apiKey = await pluggyApiKey();
    return { ok: !!apiKey };
  });

  ipcMain.handle('openFinance:syncProvider', async (_e, provider: string): Promise<SyncResult> => {
    assertProvider(provider);
    if (provider !== 'pluggy') {
      throw new Error('Sincronização automática disponível nesta versão apenas para Pluggy.');
    }
    return syncPluggy();
  });
}

function getSecret(provider: OpenFinanceProvider, field: string): string | null {
  const enc = readSecrets()[secretKey(provider, field)];
  if (!enc || !safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'));
  } catch {
    return null;
  }
}

function providerEnabled(provider: OpenFinanceProvider): boolean {
  return getSetting(settingKey(provider, 'enabled'), 'false') === 'true';
}

function providerConnectionId(provider: OpenFinanceProvider): string {
  return getSetting(settingKey(provider, 'connection_id'), '').trim();
}

function pluggyBaseUrl(): string {
  return 'https://api.pluggy.ai';
}

async function httpJson<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  const body = text ? JSON.parse(text) as T : {} as T;
  if (!res.ok) {
    const message = typeof body === 'object' && body && 'message' in body ? String((body as { message: unknown }).message) : res.statusText;
    throw new Error(message || `HTTP ${res.status}`);
  }
  return body;
}

async function pluggyApiKey(): Promise<string> {
  const clientId = getSecret('pluggy', 'clientId');
  const clientSecret = getSecret('pluggy', 'clientSecret');
  if (!clientId || !clientSecret) throw new Error('Informe Client ID e Client Secret da Pluggy.');

  const auth = await httpJson<{ apiKey: string }>(`${pluggyBaseUrl()}/auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret }),
  });
  if (!auth.apiKey) throw new Error('A Pluggy não retornou uma API key.');
  return auth.apiKey;
}

async function pluggyGet<T>(path_: string, apiKey: string): Promise<T> {
  return httpJson<T>(`${pluggyBaseUrl()}${path_}`, {
    method: 'GET',
    headers: { 'x-api-key': apiKey },
  });
}

function mapPluggyAccountType(type: string, subtype?: string): AccountType {
  const normalized = `${type} ${subtype ?? ''}`.toLowerCase();
  if (normalized.includes('credit')) return 'credit_card';
  if (normalized.includes('saving')) return 'savings';
  if (normalized.includes('wallet')) return 'wallet';
  return 'checking';
}

function normalizeMoney(value: unknown): number {
  const num = typeof value === 'number' ? value : parseFloat(String(value ?? '0'));
  return Number.isFinite(num) ? Math.round(num * 100) / 100 : 0;
}

function normalizeDate(value: unknown): string {
  const raw = String(value ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : new Date().toISOString().slice(0, 10);
}

function txHash(date: string, amount: number, description: string): string {
  return createHash('md5').update(`${date}|${amount}|${description}`).digest('hex');
}

function defaultCategory(type: TransactionType): string {
  const db = getDb();
  const category = db.prepare('SELECT id FROM categories WHERE type = ? ORDER BY created_at, id LIMIT 1')
    .get(type === 'income' ? 'income' : 'expense') as { id: string } | undefined;
  if (!category) throw new Error(`Cadastre ao menos uma categoria de ${type === 'income' ? 'receita' : 'despesa'} antes de sincronizar.`);
  return category.id;
}

function findCategory(description: string, type: TransactionType): string {
  const db = getDb();
  const categories = db.prepare('SELECT id, name FROM categories WHERE type = ?').all(type === 'income' ? 'income' : 'expense') as { id: string; name: string }[];
  const normalized = description.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const direct = categories.find(c => normalized.includes(c.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()));
  return direct?.id ?? defaultCategory(type);
}

function parsePluggyAccounts(payload: unknown): RemoteAccount[] {
  const results = Array.isArray((payload as { results?: unknown[] }).results) ? (payload as { results: unknown[] }).results : [];
  return results.map(row => {
    const account = row as Record<string, unknown>;
    const item = account.item as Record<string, unknown> | undefined;
    const balance = account.balance as number | Record<string, unknown> | undefined;
    const amount = typeof balance === 'object' && balance ? balance.amount : balance;
    return {
      id: String(account.id),
      name: String(account.name ?? account.marketingName ?? 'Conta Open Finance'),
      type: mapPluggyAccountType(String(account.type ?? ''), String(account.subtype ?? '')),
      bankName: item?.connector ? String((item.connector as Record<string, unknown>).name ?? '') : null,
      balance: normalizeMoney(amount ?? account.balance),
      creditLimit: account.creditLimit != null ? normalizeMoney(account.creditLimit) : null,
    };
  }).filter(account => account.id);
}

function parsePluggyTransactions(payload: unknown, accountId: string): RemoteTransaction[] {
  const results = Array.isArray((payload as { results?: unknown[] }).results) ? (payload as { results: unknown[] }).results : [];
  return results.map(row => {
    const tx = row as Record<string, unknown>;
    const rawAmount = normalizeMoney(tx.amount);
    const type: TransactionType = rawAmount >= 0 ? 'income' : 'expense';
    return {
      id: String(tx.id),
      accountId,
      description: String(tx.description ?? tx.descriptionRaw ?? tx.merchantName ?? 'Lançamento Open Finance'),
      amount: Math.abs(rawAmount),
      type,
      date: normalizeDate(tx.date),
    };
  }).filter(tx => tx.id && tx.amount > 0);
}

async function loadPluggyAccounts(apiKey: string, itemId: string): Promise<RemoteAccount[]> {
  const payload = await pluggyGet<unknown>(`/accounts?itemId=${encodeURIComponent(itemId)}`, apiKey);
  return parsePluggyAccounts(payload);
}

async function loadPluggyTransactions(apiKey: string, account: RemoteAccount): Promise<RemoteTransaction[]> {
  const transactions: RemoteTransaction[] = [];
  let cursor = '';
  for (let page = 0; page < 20; page++) {
    const qs = new URLSearchParams({ accountId: account.id });
    if (cursor) qs.set('cursor', cursor);
    const payload = await pluggyGet<unknown>(`/v2/transactions?${qs.toString()}`, apiKey);
    transactions.push(...parsePluggyTransactions(payload, account.id));
    const next = (payload as { next?: unknown; nextCursor?: unknown; cursor?: unknown }).nextCursor
      ?? (payload as { next?: unknown; nextCursor?: unknown; cursor?: unknown }).next
      ?? '';
    cursor = typeof next === 'string' ? next : '';
    if (!cursor) break;
  }
  return transactions;
}

function upsertAccount(account: RemoteAccount): { id: string; created: boolean } {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM accounts WHERE openfinance_provider = ? AND openfinance_id = ?')
    .get('pluggy', account.id) as { id: string } | undefined;
  if (existing) {
    db.prepare(`
      UPDATE accounts
      SET name=?, type=?, bank_name=?, balance=?, credit_limit=?, updated_at=datetime('now')
      WHERE id=?
    `).run(account.name, account.type, account.bankName, account.balance, account.creditLimit, existing.id);
    return { id: existing.id, created: false };
  }

  const id = randomUUID();
  db.prepare(`
    INSERT INTO accounts (id, name, type, bank_name, balance, credit_limit, color, currency, original_balance, openfinance_provider, openfinance_id)
    VALUES (?,?,?,?,?,?,NULL,'BRL',NULL,?,?)
  `).run(id, account.name, account.type, account.bankName, account.balance, account.creditLimit, 'pluggy', account.id);
  return { id, created: true };
}

function importTransaction(tx: RemoteTransaction, accountId: string): boolean {
  const db = getDb();
  const existing = db.prepare('SELECT 1 FROM transactions WHERE openfinance_provider = ? AND openfinance_id = ?')
    .get('pluggy', tx.id);
  if (existing) return false;

  const id = randomUUID();
  const categoryId = findCategory(tx.description, tx.type);
  const hash = txHash(tx.date, tx.amount, tx.description);
  const notes = `OPEN_FINANCE:pluggy|REMOTE_ID:${tx.id}|HASH:${hash}`;

  db.prepare(`
    INSERT INTO transactions (id, account_id, category_id, description, amount, type, date, status, notes, recurring, openfinance_provider, openfinance_id)
    VALUES (?,?,?,?,?,?,?,'confirmed',?,0,?,?)
  `).run(id, accountId, categoryId, tx.description, tx.amount, tx.type, tx.date, notes, 'pluggy', tx.id);
  db.prepare(`
    INSERT INTO transaction_payments (id, transaction_id, account_id, amount)
    VALUES (?,?,?,?)
  `).run(randomUUID(), id, accountId, tx.amount);
  return true;
}

async function syncPluggy(): Promise<SyncResult> {
  if (!providerEnabled('pluggy')) throw new Error('Ative a integração Pluggy antes de sincronizar.');
  const itemId = providerConnectionId('pluggy');
  if (!itemId) throw new Error('Informe o Item ID da Pluggy antes de sincronizar.');

  const apiKey = await pluggyApiKey();
  const remoteAccounts = await loadPluggyAccounts(apiKey, itemId);
  const accountMap = new Map<string, string>();
  let accountsCreated = 0;
  let accountsUpdated = 0;
  let transactionsImported = 0;
  let transactionsSkipped = 0;

  const db = getDb();
  db.transaction(() => {
    for (const remote of remoteAccounts) {
      const local = upsertAccount(remote);
      accountMap.set(remote.id, local.id);
      if (local.created) accountsCreated++;
      else accountsUpdated++;
    }
  })();

  for (const remote of remoteAccounts) {
    const localAccountId = accountMap.get(remote.id);
    if (!localAccountId) continue;
    const transactions = await loadPluggyTransactions(apiKey, remote);
    db.transaction(() => {
      for (const tx of transactions) {
        if (importTransaction(tx, localAccountId)) transactionsImported++;
        else transactionsSkipped++;
      }
    })();
  }

  return { provider: 'pluggy', accountsCreated, accountsUpdated, transactionsImported, transactionsSkipped };
}
