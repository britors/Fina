import { ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { getDb } from '../database';
import { getExchangeRate } from './market';
import type { Account, AccountCurrency } from '../../shared/types';

type CreatePayload = Omit<Account, 'id' | 'created_at' | 'updated_at' | 'balance'> & { balance?: number };
type UpdatePayload = { id: string } & Partial<CreatePayload>;

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

// Converte o saldo na moeda original para BRL usando a cotação vigente do
// painel de Mercado. Contas em BRL não precisam de conversão.
async function resolveBalance(currency: AccountCurrency, originalBalance: number | null | undefined, fallbackBalance: number | undefined): Promise<{ balance: number; original_balance: number | null }> {
  if (currency === 'BRL') {
    return { balance: fallbackBalance ?? 0, original_balance: null };
  }
  if (originalBalance == null) throw new Error('Informe o saldo na moeda da conta.');
  const rate = await getExchangeRate(currency);
  if (rate == null) throw new Error('Não foi possível obter a cotação. Verifique sua conexão e tente novamente.');
  return { balance: roundMoney(originalBalance * rate), original_balance: originalBalance };
}

export function registerAccountHandlers(): void {
  ipcMain.handle('accounts:list', () =>
    getDb().prepare('SELECT * FROM accounts ORDER BY name').all()
  );

  ipcMain.handle('accounts:get', (_e, id: string) =>
    getDb().prepare('SELECT * FROM accounts WHERE id = ?').get(id) ?? null
  );

  ipcMain.handle('accounts:create', async (_e, data: CreatePayload) => {
    const currency = data.currency ?? 'BRL';
    const { balance, original_balance } = await resolveBalance(currency, data.original_balance, data.balance);
    const id = randomUUID();
    getDb().prepare(
      'INSERT INTO accounts (id, name, type, bank_name, balance, credit_limit, color, currency, original_balance) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run(id, data.name, data.type, data.bank_name ?? null, balance, data.credit_limit ?? null, data.color ?? null, currency, original_balance);
    return getDb().prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  });

  ipcMain.handle('accounts:update', async (_e, { id, ...data }: UpdatePayload) => {
    const currency = data.currency ?? 'BRL';
    const { balance, original_balance } = await resolveBalance(currency, data.original_balance, data.balance);
    getDb().prepare(
      `UPDATE accounts SET name=?, type=?, bank_name=?, balance=?, credit_limit=?, color=?, currency=?, original_balance=?, updated_at=datetime('now') WHERE id=?`
    ).run(data.name, data.type, data.bank_name ?? null, balance, data.credit_limit ?? null, data.color ?? null, currency, original_balance, id);
    return getDb().prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  });

  ipcMain.handle('accounts:delete', (_e, id: string) => {
    getDb().prepare('DELETE FROM accounts WHERE id = ?').run(id);
  });

  // Rebusca a cotação vigente e recalcula o saldo em BRL de todas as contas
  // em moeda estrangeira (o saldo na moeda original nunca muda sozinho).
  ipcMain.handle('accounts:refreshExchangeRates', async () => {
    const db = getDb();
    const foreign = db.prepare(`SELECT * FROM accounts WHERE currency != 'BRL'`).all() as Account[];
    for (const account of foreign) {
      if (account.original_balance == null) continue;
      const rate = await getExchangeRate(account.currency as 'USD' | 'EUR');
      if (rate == null) continue;
      db.prepare(`UPDATE accounts SET balance=?, updated_at=datetime('now') WHERE id=?`)
        .run(roundMoney(account.original_balance * rate), account.id);
    }
    return db.prepare('SELECT * FROM accounts ORDER BY name').all();
  });
}
