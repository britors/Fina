import { app, ipcMain, safeStorage } from 'electron';
import { randomUUID, createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getDb } from '../database';
import type {
  AccountType,
  BalanceAlertSettings,
  BalanceDropAlert,
  CashFlowFactor,
  CashFlowForecast,
  CashFlowWeek,
  ConsolidatedBalance,
  OpenFinanceConnectionInstitution,
  OpenFinanceConnectionStatus,
  OpenFinanceLinkedAccount,
  OpenFinanceOverview,
  OpenFinanceProviderOverview,
  TransactionType,
} from '../../shared/types';

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

interface SyncOptions {
  accountId?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface ConnectionRow {
  provider: OpenFinanceProvider;
  connection_id: string;
  institution_name: string | null;
  status: OpenFinanceConnectionStatus;
  products: string | null;
  last_sync_at: string | null;
  last_error: string | null;
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
const PROVIDER_NAMES: Record<OpenFinanceProvider, string> = {
  pluggy: 'Pluggy',
  belvo: 'Belvo',
  klavi: 'Klavi',
};

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

function maskConnectionId(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length <= 8) return trimmed;
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

function providerHasCredentials(provider: OpenFinanceProvider, providerSettings: ProviderSettings): boolean {
  if (provider === 'klavi') return providerSettings.hasApiKey;
  return providerSettings.hasClientId && providerSettings.hasClientSecret;
}

function providerStatus(
  provider: OpenFinanceProvider,
  providerSettings: ProviderSettings,
  hasCredentials: boolean,
  linkedAccounts: OpenFinanceLinkedAccount[],
  connection: ConnectionRow | undefined,
): { status: OpenFinanceConnectionStatus; label: string } {
  if (!providerSettings.enabled) return { status: 'disabled', label: 'Inativo' };
  if (provider !== 'pluggy') return { status: 'unsupported', label: 'Credenciais preparadas' };
  if (!hasCredentials || !providerSettings.connectionId.trim()) return { status: 'incomplete', label: 'Configuração incompleta' };
  if (connection?.last_error) return { status: 'incomplete', label: 'Erro na última sincronização' };
  if (linkedAccounts.length === 0) return { status: 'pending', label: 'Pendente de sincronização' };
  return { status: 'active', label: 'Ativo' };
}

function listConnectionRows(): ConnectionRow[] {
  return getDb().prepare(`
    SELECT provider, connection_id, institution_name, status, products, last_sync_at, last_error
    FROM openfinance_connections
    ORDER BY updated_at DESC
  `).all() as ConnectionRow[];
}

function connectionFor(
  connections: ConnectionRow[],
  provider: OpenFinanceProvider,
  connectionId: string,
): ConnectionRow | undefined {
  const trimmed = connectionId.trim();
  if (!trimmed) return connections.find(connection => connection.provider === provider);
  return connections.find(connection => connection.provider === provider && connection.connection_id === trimmed);
}

function upsertConnection(data: {
  provider: OpenFinanceProvider;
  connectionId: string;
  institutionName?: string | null;
  status: OpenFinanceConnectionStatus;
  products?: string[] | null;
  lastSyncAt?: string | null;
  lastError?: string | null;
}): void {
  const connectionId = data.connectionId.trim();
  if (!connectionId) return;
  getDb().prepare(`
    INSERT INTO openfinance_connections (
      id, provider, connection_id, institution_name, status, products, last_sync_at, last_error
    ) VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(provider, connection_id) DO UPDATE SET
      institution_name=COALESCE(excluded.institution_name, openfinance_connections.institution_name),
      status=excluded.status,
      products=COALESCE(excluded.products, openfinance_connections.products),
      last_sync_at=COALESCE(excluded.last_sync_at, openfinance_connections.last_sync_at),
      last_error=excluded.last_error,
      updated_at=datetime('now')
  `).run(
    randomUUID(),
    data.provider,
    connectionId,
    data.institutionName ?? null,
    data.status,
    data.products ? JSON.stringify(data.products) : null,
    data.lastSyncAt ?? null,
    data.lastError ?? null,
  );
}

function groupInstitutions(accounts: OpenFinanceLinkedAccount[]): OpenFinanceConnectionInstitution[] {
  const groups = new Map<string, OpenFinanceConnectionInstitution>();
  for (const account of accounts) {
    const name = account.bank_name ?? 'Outras conexões';
    if (!groups.has(name)) groups.set(name, { name, totalBalance: 0, accounts: [] });
    const group = groups.get(name)!;
    group.totalBalance += account.balance;
    group.accounts.push(account);
  }

  return [...groups.values()]
    .map(group => ({
      ...group,
      totalBalance: Math.round(group.totalBalance * 100) / 100,
      accounts: group.accounts.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getOverview(): OpenFinanceOverview {
  const s = settings();
  const connections = listConnectionRows();
  const rows = getDb().prepare(`
    SELECT id, name, type, bank_name, balance, credit_limit, openfinance_provider, openfinance_id
    FROM accounts
    WHERE openfinance_provider IS NOT NULL
    ORDER BY openfinance_provider, bank_name, name
  `).all() as OpenFinanceLinkedAccount[];

  const providers: OpenFinanceProviderOverview[] = PROVIDERS.map(provider => {
    const providerSettings = s.providers[provider];
    const accounts = rows.filter(account => account.openfinance_provider === provider);
    const hasCredentials = providerHasCredentials(provider, providerSettings);
    const connection = connectionFor(connections, provider, providerSettings.connectionId);
    const { status, label } = providerStatus(provider, providerSettings, hasCredentials, accounts, connection);
    const institutions = groupInstitutions(accounts);
    const totalBalance = Math.round(accounts.reduce((sum, account) => sum + account.balance, 0) * 100) / 100;

    return {
      provider,
      name: PROVIDER_NAMES[provider],
      enabled: providerSettings.enabled,
      supportedSync: provider === 'pluggy',
      hasCredentials,
      hasConnectionId: !!providerSettings.connectionId.trim(),
      status,
      statusLabel: label,
      connectionIdMasked: maskConnectionId(providerSettings.connectionId),
      lastSyncAt: connection?.last_sync_at ?? null,
      lastError: connection?.last_error ?? null,
      institutions,
      totalBalance,
      accountCount: accounts.length,
    };
  });

  return {
    providers,
    totalBalance: Math.round(rows.reduce((sum, account) => sum + account.balance, 0) * 100) / 100,
    accountCount: rows.length,
  };
}

function assertProvider(provider: string): asserts provider is OpenFinanceProvider {
  if (!PROVIDERS.includes(provider as OpenFinanceProvider)) {
    throw new Error('Provedor de Open Finance inválido.');
  }
}

function getConsolidatedBalance(): ConsolidatedBalance {
  const db = getDb();
  const accounts = db.prepare(`
    SELECT id, name, type, bank_name, balance
    FROM accounts
    WHERE openfinance_provider IS NOT NULL
    ORDER BY bank_name, name
  `).all() as { id: string; name: string; type: string; bank_name: string | null; balance: number }[];

  const groups = new Map<string, { bankName: string; total: number; accounts: { id: string; name: string; type: string; balance: number }[] }>();
  for (const acc of accounts) {
    const key = acc.bank_name ?? 'Outras conexões';
    if (!groups.has(key)) groups.set(key, { bankName: key, total: 0, accounts: [] });
    const group = groups.get(key)!;
    group.total += acc.balance;
    group.accounts.push({ id: acc.id, name: acc.name, type: acc.type, balance: acc.balance });
  }

  return {
    total: accounts.reduce((sum, a) => sum + a.balance, 0),
    byInstitution: [...groups.values()],
  };
}

// Fluxo de caixa consolidado, escopado apenas às contas conectadas via Open
// Finance (diferente da previsão geral do Dashboard, que soma todas as
// contas). Agrupa por semana e reaproveita o mesmo cruzamento de
// transações/contas a pagar futuras já usado no restante do app.
function getCashFlowForecast(weeksAhead = 8): CashFlowForecast {
  const db = getDb();
  const linkedIds = (db.prepare(`SELECT id FROM accounts WHERE openfinance_provider IS NOT NULL`).all() as { id: string }[]).map(r => r.id);
  if (linkedIds.length === 0) return { weeks: [], factors: [] };

  const placeholders = linkedIds.map(() => '?').join(',');
  const { total } = db.prepare(`SELECT COALESCE(SUM(balance),0) as total FROM accounts WHERE id IN (${placeholders})`)
    .get(...linkedIds) as { total: number };

  const horizonDays = weeksAhead * 7;
  const futureTxs = db.prepare(`
    SELECT date, type, description, amount
    FROM transactions
    WHERE status = 'confirmed' AND date > date('now') AND date <= date('now', '+' || ? || ' days')
      AND account_id IN (${placeholders})
  `).all(horizonDays, ...linkedIds) as { date: string; type: string; description: string; amount: number }[];

  const futureBills = db.prepare(`
    SELECT due_date as date, description, amount, recurring
    FROM bills
    WHERE status != 'paid' AND due_date >= date('now') AND due_date <= date('now', '+' || ? || ' days')
      AND account_id IN (${placeholders})
  `).all(horizonDays, ...linkedIds) as { date: string; description: string; amount: number; recurring: number }[];

  const flow = new Map<string, number>();
  const factors: CashFlowFactor[] = [];

  for (const tx of futureTxs) {
    const delta = tx.type === 'income' ? tx.amount : -tx.amount;
    flow.set(tx.date, (flow.get(tx.date) ?? 0) + delta);
    factors.push({ label: tx.description, date: tx.date, amount: delta, type: delta >= 0 ? 'income' : 'expense', recurring: false });
  }
  for (const bill of futureBills) {
    flow.set(bill.date, (flow.get(bill.date) ?? 0) - bill.amount);
    factors.push({ label: bill.description, date: bill.date, amount: -bill.amount, type: 'expense', recurring: !!bill.recurring });
  }

  const weeks: CashFlowWeek[] = [];
  let running = total;
  const now = new Date();
  for (let w = 0; w < weeksAhead; w++) {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() + w * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    let income = 0;
    let expense = 0;
    for (let d = 0; d < 7; d++) {
      const day = new Date(weekStart);
      day.setDate(day.getDate() + d);
      const delta = flow.get(day.toISOString().slice(0, 10)) ?? 0;
      if (delta > 0) income += delta; else expense += -delta;
      running += delta;
    }

    weeks.push({
      weekStart: weekStart.toISOString().slice(0, 10),
      weekEnd: weekEnd.toISOString().slice(0, 10),
      income: Math.round(income * 100) / 100,
      expense: Math.round(expense * 100) / 100,
      balance: Math.round(running * 100) / 100,
    });
  }

  const topFactors = factors
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 6);

  return { weeks, factors: topFactors };
}

export function registerOpenFinanceHandlers(): void {
  ipcMain.handle('openFinance:getSettings', () => settings());

  ipcMain.handle('openFinance:getOverview', () => getOverview());

  ipcMain.handle('openFinance:getBalanceAlertSettings', () => getBalanceAlertSettings());

  ipcMain.handle('openFinance:saveBalanceAlertSettings', (_e, data: BalanceAlertSettings) => saveBalanceAlertSettings(data));

  ipcMain.handle('openFinance:getBalanceDropAlerts', () => detectBalanceDrops());

  ipcMain.handle('openFinance:getConsolidatedBalance', () => getConsolidatedBalance());

  ipcMain.handle('openFinance:getCashFlowForecast', (_e, weeksAhead?: number) => getCashFlowForecast(weeksAhead));

  ipcMain.handle('openFinance:saveProvider', (_e, data: SaveProviderPayload) => {
    assertProvider(data.provider);
    const connectionId = data.connectionId?.trim() ?? '';
    setSettings({
      [settingKey(data.provider, 'enabled')]: data.enabled ? 'true' : 'false',
      [settingKey(data.provider, 'sandbox')]: data.sandbox ? 'true' : 'false',
    });
  saveSecret(data.provider, 'clientId', data.clientId);
  saveSecret(data.provider, 'clientSecret', data.clientSecret);
  saveSecret(data.provider, 'apiKey', data.apiKey);
    setSettings({ [settingKey(data.provider, 'connection_id')]: connectionId });
    if (data.enabled && connectionId) {
      upsertConnection({
        provider: data.provider,
        connectionId,
        status: data.provider === 'pluggy' ? 'pending' : 'unsupported',
        products: data.provider === 'pluggy' ? ['accounts', 'transactions'] : null,
      });
    }
    return settings();
  });

  ipcMain.handle('openFinance:clearProviderSecrets', (_e, provider: string) => {
    assertProvider(provider);
    clearProviderSecrets(provider);
    return settings();
  });

  ipcMain.handle('openFinance:disableProvider', (_e, provider: string) => {
    assertProvider(provider);
    const connectionId = providerConnectionId(provider);
    clearProviderSecrets(provider);
    setSettings({
      [settingKey(provider, 'enabled')]: 'false',
      [settingKey(provider, 'connection_id')]: '',
    });
    if (connectionId) {
      upsertConnection({ provider, connectionId, status: 'disabled' });
    }
    return getOverview();
  });

  ipcMain.handle('openFinance:testProvider', async (_e, provider: string) => {
    assertProvider(provider);
    if (provider !== 'pluggy') {
      throw new Error('Teste automático disponível nesta versão apenas para Pluggy.');
    }
    const apiKey = await pluggyApiKey();
    return { ok: !!apiKey };
  });

  ipcMain.handle('openFinance:syncProvider', async (_e, payload: { provider: string } & SyncOptions): Promise<SyncResult> => {
    const { provider, ...options } = payload;
    assertProvider(provider);
    if (provider !== 'pluggy') {
      throw new Error('Sincronização automática disponível nesta versão apenas para Pluggy.');
    }
    return syncPluggy(options);
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

async function loadPluggyTransactions(apiKey: string, account: RemoteAccount, dateFrom?: string, dateTo?: string): Promise<RemoteTransaction[]> {
  const transactions: RemoteTransaction[] = [];
  let cursor = '';
  for (let page = 0; page < 20; page++) {
    const qs = new URLSearchParams({ accountId: account.id });
    if (dateFrom) qs.set('from', dateFrom);
    if (dateTo) qs.set('to', dateTo);
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

function recordBalanceSnapshot(accountId: string, balance: number): void {
  getDb().prepare(`INSERT INTO account_balance_snapshots (id, account_id, balance) VALUES (?,?,?)`)
    .run(randomUUID(), accountId, balance);
}

function getBalanceAlertSettings(): BalanceAlertSettings {
  return {
    enabled: getSetting('openfinance_balance_alert_enabled', 'true') === 'true',
    thresholdPct: parseFloat(getSetting('openfinance_balance_alert_threshold_pct', '20')) || 20,
    days: parseInt(getSetting('openfinance_balance_alert_days', '7'), 10) || 7,
  };
}

function saveBalanceAlertSettings(data: BalanceAlertSettings): BalanceAlertSettings {
  setSettings({
    openfinance_balance_alert_enabled: data.enabled ? 'true' : 'false',
    openfinance_balance_alert_threshold_pct: String(data.thresholdPct),
    openfinance_balance_alert_days: String(data.days),
  });
  return getBalanceAlertSettings();
}

// Compara o saldo atual de cada conta conectada com o snapshot mais antigo
// disponível a partir de N dias atrás; sem histórico suficiente (poucos
// syncs até agora), a conta simplesmente não gera alerta ainda.
function detectBalanceDrops(): BalanceDropAlert[] {
  const settings = getBalanceAlertSettings();
  if (!settings.enabled) return [];

  const db = getDb();
  const accounts = db.prepare(`
    SELECT id, name, bank_name, balance FROM accounts WHERE openfinance_provider IS NOT NULL
  `).all() as { id: string; name: string; bank_name: string | null; balance: number }[];

  const alerts: BalanceDropAlert[] = [];
  for (const acc of accounts) {
    const snapshot = db.prepare(`
      SELECT balance FROM account_balance_snapshots
      WHERE account_id = ? AND recorded_at <= datetime('now', '-' || ? || ' days')
      ORDER BY recorded_at DESC LIMIT 1
    `).get(acc.id, settings.days) as { balance: number } | undefined;
    if (!snapshot || snapshot.balance <= 0) continue;

    const dropPct = ((snapshot.balance - acc.balance) / snapshot.balance) * 100;
    if (dropPct < settings.thresholdPct) continue;

    alerts.push({
      accountId: acc.id,
      accountName: acc.name,
      bankName: acc.bank_name ?? 'Open Finance',
      currentBalance: acc.balance,
      previousBalance: snapshot.balance,
      dropPct: Math.round(dropPct * 10) / 10,
      days: settings.days,
    });
  }
  return alerts;
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

async function syncPluggy(options: SyncOptions = {}): Promise<SyncResult> {
  if (!providerEnabled('pluggy')) throw new Error('Ative a integração Pluggy antes de sincronizar.');
  const itemId = providerConnectionId('pluggy');
  if (!itemId) throw new Error('Informe o Item ID da Pluggy antes de sincronizar.');

  try {
    const apiKey = await pluggyApiKey();
    const remoteAccounts = await loadPluggyAccounts(apiKey, itemId);
    const accountMap = new Map<string, string>();
    let accountsCreated = 0;
    let accountsUpdated = 0;
    let transactionsImported = 0;
    let transactionsSkipped = 0;

    // Atualiza saldos e descobre contas novas sempre, independente do filtro
    // de conta abaixo — é uma chamada única e leve, e mantém os saldos em dia.
    // Também registra um snapshot do saldo a cada sync, para permitir detectar
    // quedas bruscas mais tarde (accounts.balance só guarda o valor atual).
    const db = getDb();
    db.transaction(() => {
      for (const remote of remoteAccounts) {
        const local = upsertAccount(remote);
        accountMap.set(remote.id, local.id);
        if (local.created) accountsCreated++;
        else accountsUpdated++;
        recordBalanceSnapshot(local.id, remote.balance);
      }
    })();

    for (const remote of remoteAccounts) {
      const localAccountId = accountMap.get(remote.id);
      if (!localAccountId) continue;
      if (options.accountId && options.accountId !== localAccountId) continue;

      const transactions = await loadPluggyTransactions(apiKey, remote, options.dateFrom, options.dateTo);
      db.transaction(() => {
        for (const tx of transactions) {
          if (importTransaction(tx, localAccountId)) transactionsImported++;
          else transactionsSkipped++;
        }
      })();
    }

    upsertConnection({
      provider: 'pluggy',
      connectionId: itemId,
      institutionName: remoteAccounts.find(account => account.bankName)?.bankName ?? null,
      status: 'active',
      products: ['accounts', 'transactions'],
      lastSyncAt: new Date().toISOString(),
      lastError: null,
    });

    return { provider: 'pluggy', accountsCreated, accountsUpdated, transactionsImported, transactionsSkipped };
  } catch (err) {
    upsertConnection({
      provider: 'pluggy',
      connectionId: itemId,
      status: 'incomplete',
      lastError: err instanceof Error ? err.message : 'Erro desconhecido na sincronização.',
    });
    throw err;
  }
}
