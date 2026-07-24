import { ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { getDb } from '../database';
import type { PixKeyType, PixKeyValidation, PixPayment, PixPaymentFilters, PixPaymentStatus, PixRecipient } from '../../shared/types';

const STATUSES: PixPaymentStatus[] = ['draft', 'pending', 'sent', 'confirmed', 'failed', 'cancelled'];
const PROVIDERS = ['pluggy', 'belvo', 'klavi'] as const;

interface CreatePixAuditPayload {
  provider: 'pluggy' | 'belvo' | 'klavi';
  source_account_id?: string | null;
  amount: number;
  pix_key: string;
  recipient_name?: string | null;
  recipient_bank?: string | null;
  description?: string | null;
  status?: PixPaymentStatus;
  external_id?: string | null;
  error_message?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface UpdatePixStatusPayload {
  id: string;
  status: PixPaymentStatus;
  external_id?: string | null;
  error_message?: string | null;
  transaction_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface SimulatePixPaymentPayload {
  provider: 'pluggy' | 'belvo' | 'klavi';
  source_account_id: string;
  amount: number;
  pix_key: string;
  recipient_name?: string | null;
  recipient_bank?: string | null;
  description?: string | null;
}

interface SaveRecipientPayload {
  id?: string;
  name: string;
  pix_key: string;
  institution?: string | null;
  notes?: string | null;
}

function maskPixKey(value: string): string {
  const key = value.trim();
  if (!key) throw new Error('Informe uma chave Pix.');
  if (key.includes('@')) {
    const [name, domain] = key.split('@');
    return `${name.slice(0, 2)}***@${domain ?? ''}`;
  }
  const digits = key.replace(/\D/g, '');
  if (digits.length >= 10) return `***${digits.slice(-4)}`;
  if (key.length <= 8) return `${key.slice(0, 2)}***`;
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function validateCpf(digits: string): boolean {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1+$/.test(digits)) return false;
  const calc = (slice: number, factor: number): number => {
    let sum = 0;
    for (let i = 0; i < slice; i++) sum += parseInt(digits[i], 10) * (factor - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9, 10) === parseInt(digits[9], 10) && calc(10, 11) === parseInt(digits[10], 10);
}

function validateCnpj(digits: string): boolean {
  if (!/^\d{14}$/.test(digits) || /^(\d)\1+$/.test(digits)) return false;
  const calc = (length: number): number => {
    const weights = length === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2];
    const sum = weights.reduce((acc, weight, index) => acc + parseInt(digits[index], 10) * weight, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return calc(12) === parseInt(digits[12], 10) && calc(13) === parseInt(digits[13], 10);
}

function validatePixKey(value: string): PixKeyValidation {
  const raw = value.trim();
  const digits = onlyDigits(raw);
  if (!raw) return { valid: false, keyType: null, normalizedKey: '', message: 'Informe uma chave Pix.' };
  if (raw.includes('@')) {
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
    return { valid, keyType: 'email', normalizedKey: raw.toLowerCase(), message: valid ? 'E-mail válido para chave Pix.' : 'E-mail inválido.' };
  }
  if (validateCpf(digits)) return { valid: true, keyType: 'cpf', normalizedKey: digits, message: 'CPF válido para chave Pix.' };
  if (validateCnpj(digits)) return { valid: true, keyType: 'cnpj', normalizedKey: digits, message: 'CNPJ válido para chave Pix.' };
  if (/^\+?\d{10,15}$/.test(raw.replace(/[\s()-]/g, ''))) {
    const normalized = raw.startsWith('+') ? `+${digits}` : digits;
    return { valid: true, keyType: 'phone', normalizedKey: normalized, message: 'Telefone válido para chave Pix.' };
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)) {
    return { valid: true, keyType: 'random', normalizedKey: raw.toLowerCase(), message: 'Chave aleatória válida.' };
  }
  return { valid: false, keyType: null, normalizedKey: raw, message: 'Formato de chave Pix inválido.' };
}

function assertStatus(status: string): asserts status is PixPaymentStatus {
  if (!STATUSES.includes(status as PixPaymentStatus)) throw new Error('Status Pix inválido.');
}

function assertProvider(provider: string): asserts provider is CreatePixAuditPayload['provider'] {
  if (!PROVIDERS.includes(provider as CreatePixAuditPayload['provider'])) throw new Error('Provedor Pix inválido.');
}

function rowSelect(): string {
  return `
    SELECT p.*, a.name as source_account_name
    FROM pix_payments p
    LEFT JOIN accounts a ON a.id = p.source_account_id
  `;
}

function listPayments(filters: PixPaymentFilters = {}): PixPayment[] {
  const conds: string[] = ['1=1'];
  const params: unknown[] = [];
  if (filters.status) {
    assertStatus(filters.status);
    conds.push('p.status = ?');
    params.push(filters.status);
  }
  if (filters.dateFrom) {
    conds.push('date(p.created_at) >= date(?)');
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    conds.push('date(p.created_at) <= date(?)');
    params.push(filters.dateTo);
  }
  return getDb().prepare(`
    ${rowSelect()}
    WHERE ${conds.join(' AND ')}
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT 300
  `).all(...params) as PixPayment[];
}

function getPayment(id: string): PixPayment | null {
  return getDb().prepare(`${rowSelect()} WHERE p.id = ?`).get(id) as PixPayment | undefined ?? null;
}

function listRecipients(): PixRecipient[] {
  return getDb().prepare('SELECT * FROM pix_recipients ORDER BY name').all() as PixRecipient[];
}

function ensureProviderCanPix(provider: CreatePixAuditPayload['provider']): void {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(`openfinance_${provider}_enabled`) as { value: string } | undefined;
  if (row?.value !== 'true') throw new Error('Ative e configure o provedor em Open Finance antes de iniciar um Pix.');
}

function metadataJson(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!metadata) return null;
  return JSON.stringify(metadata);
}

export function registerPixHandlers(): void {
  ipcMain.handle('pix:listPayments', (_e, filters?: PixPaymentFilters) => listPayments(filters));

  ipcMain.handle('pix:getPayment', (_e, id: string) => getPayment(id));

  ipcMain.handle('pix:validateKey', (_e, value: string) => validatePixKey(value));

  ipcMain.handle('pix:listRecipients', () => listRecipients());

  ipcMain.handle('pix:saveRecipient', (_e, data: SaveRecipientPayload) => {
    const name = data.name.trim();
    if (!name) throw new Error('Informe o nome do favorecido.');
    const validation = validatePixKey(data.pix_key);
    if (!validation.valid || !validation.keyType) throw new Error(validation.message);
    if (data.id) {
      getDb().prepare(`
        UPDATE pix_recipients SET name=?, pix_key=?, key_type=?, institution=?, notes=?, updated_at=datetime('now') WHERE id=?
      `).run(name, validation.normalizedKey, validation.keyType, data.institution?.trim() || null, data.notes?.trim() || null, data.id);
      return getDb().prepare('SELECT * FROM pix_recipients WHERE id = ?').get(data.id);
    }
    const id = randomUUID();
    getDb().prepare(`
      INSERT INTO pix_recipients (id, name, pix_key, key_type, institution, notes) VALUES (?,?,?,?,?,?)
    `).run(id, name, validation.normalizedKey, validation.keyType, data.institution?.trim() || null, data.notes?.trim() || null);
    return getDb().prepare('SELECT * FROM pix_recipients WHERE id = ?').get(id);
  });

  ipcMain.handle('pix:deleteRecipient', (_e, id: string) => {
    getDb().prepare('DELETE FROM pix_recipients WHERE id = ?').run(id);
    return true;
  });

  ipcMain.handle('pix:createAuditPayment', (_e, data: CreatePixAuditPayload) => {
    assertProvider(data.provider);
    const status = data.status ?? 'draft';
    assertStatus(status);
    if (!Number.isFinite(data.amount) || data.amount <= 0) throw new Error('Informe um valor Pix válido.');

    const id = randomUUID();
    getDb().prepare(`
      INSERT INTO pix_payments (
        id, provider, source_account_id, amount, pix_key_masked, recipient_name, recipient_bank,
        description, status, external_id, error_message, metadata
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      id,
      data.provider,
      data.source_account_id ?? null,
      Math.round(data.amount * 100) / 100,
      maskPixKey(data.pix_key),
      data.recipient_name?.trim() || null,
      data.recipient_bank?.trim() || null,
      data.description?.trim() || null,
      status,
      data.external_id?.trim() || null,
      data.error_message?.trim() || null,
      metadataJson(data.metadata),
    );
    return getPayment(id);
  });

  ipcMain.handle('pix:updatePaymentStatus', (_e, data: UpdatePixStatusPayload) => {
    assertStatus(data.status);
    getDb().prepare(`
      UPDATE pix_payments
      SET status=?, external_id=COALESCE(?, external_id), error_message=?, transaction_id=COALESCE(?, transaction_id),
          metadata=COALESCE(?, metadata), updated_at=datetime('now')
      WHERE id=?
    `).run(
      data.status,
      data.external_id?.trim() || null,
      data.error_message?.trim() || null,
      data.transaction_id?.trim() || null,
      metadataJson(data.metadata),
      data.id,
    );
    return getPayment(data.id);
  });

  ipcMain.handle('pix:simulatePayment', (_e, data: SimulatePixPaymentPayload) => {
    assertProvider(data.provider);
    ensureProviderCanPix(data.provider);
    const validation = validatePixKey(data.pix_key);
    if (!validation.valid) throw new Error(validation.message);
    if (!data.source_account_id) throw new Error('Selecione a conta de origem.');
    if (!Number.isFinite(data.amount) || data.amount <= 0) throw new Error('Informe um valor Pix válido.');

    const account = getDb().prepare('SELECT id FROM accounts WHERE id = ? AND openfinance_provider IS NOT NULL').get(data.source_account_id);
    if (!account) throw new Error('Selecione uma conta conectada via Open Finance.');

    const id = randomUUID();
    getDb().prepare(`
      INSERT INTO pix_payments (
        id, provider, source_account_id, amount, pix_key_masked, recipient_name, recipient_bank,
        description, status, external_id, metadata
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      id,
      data.provider,
      data.source_account_id,
      Math.round(data.amount * 100) / 100,
      maskPixKey(validation.normalizedKey),
      data.recipient_name?.trim() || null,
      data.recipient_bank?.trim() || null,
      data.description?.trim() || null,
      'sent',
      `sandbox-${id}`,
      metadataJson({ mode: 'sandbox', keyType: validation.keyType, validation: validation.message }),
    );
    return getPayment(id);
  });
}
