import { ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { getDb } from '../database';
import { getExchangeRate } from './market';
import { confirmedLedgerDelta, roundMoney } from '../accountBalances';
import type { Account, AccountCurrency } from '../../shared/types';

type CreatePayload = Omit<Account, 'id' | 'created_at' | 'updated_at' | 'balance'> & { balance?: number };
type UpdatePayload = { id: string } & Partial<CreatePayload>;

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
      'INSERT INTO accounts (id, name, type, bank_name, balance, credit_limit, color, currency, original_balance, opening_balance_brl, closing_day, due_day) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
    ).run(id, data.name, data.type, data.bank_name ?? null, balance, data.credit_limit ?? null, data.color ?? null, currency, original_balance, balance, data.closing_day ?? null, data.due_day ?? null);
    return getDb().prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  });

  ipcMain.handle('accounts:update', async (_e, { id, ...data }: UpdatePayload) => {
    const db = getDb();
    const current = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as Account | undefined;
    if (!current) throw new Error('Conta não encontrada.');

    const currency = data.currency ?? current.currency ?? 'BRL';
    const hasTransactions = !!db.prepare(`
      SELECT 1 FROM transactions t
      WHERE t.account_id = ? OR t.to_account_id = ?
         OR EXISTS (SELECT 1 FROM transaction_payments p WHERE p.transaction_id = t.id AND p.account_id = ?)
      LIMIT 1
    `).get(id, id, id);
    if (hasTransactions && data.type && data.type !== current.type) {
      throw new Error('Não altere o tipo de uma conta que já possui lançamentos. Crie uma nova conta para preservar o histórico.');
    }
    if (currency !== current.currency) {
      throw new Error('Não altere a moeda de uma conta existente. Crie uma nova conta para preservar o histórico.');
    }

    // O saldo de uma conta com histórico é um acumulado do livro-caixa. Não
    // o reescreva ao editar nome, banco ou limite; ajustes devem ser feitos por
    // um lançamento explícito para continuarem auditáveis.
    const { balance, original_balance } = { balance: current.balance, original_balance: current.original_balance };
    const name = data.name ?? current.name;
    const type = data.type ?? current.type;
    getDb().prepare(
      `UPDATE accounts SET name=?, type=?, bank_name=?, balance=?, credit_limit=?, color=?, currency=?, original_balance=?, opening_balance_brl=?, remote_balance=?, closing_day=?, due_day=?, updated_at=datetime('now') WHERE id=?`
    ).run(name, type, data.bank_name !== undefined ? data.bank_name : current.bank_name, balance,
      data.credit_limit !== undefined ? data.credit_limit : current.credit_limit,
      data.color !== undefined ? data.color : current.color, currency, original_balance, current.opening_balance_brl, current.remote_balance,
      data.closing_day !== undefined ? data.closing_day : current.closing_day,
      data.due_day !== undefined ? data.due_day : current.due_day, id);
    return db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  });

  ipcMain.handle('accounts:delete', (_e, id: string) => {
    getDb().prepare('DELETE FROM accounts WHERE id = ?').run(id);
  });

  // Rebusca a cotação vigente e recalcula o saldo inicial convertido, somando
  // novamente os lançamentos confirmados. Assim, a cotação não apaga o
  // movimento acumulado do livro-caixa.
  ipcMain.handle('accounts:refreshExchangeRates', async () => {
    const db = getDb();
    const foreign = db.prepare(`SELECT * FROM accounts WHERE currency != 'BRL'`).all() as Account[];
    for (const account of foreign) {
      if (account.original_balance == null) continue;
      const rate = await getExchangeRate(account.currency as 'USD' | 'EUR');
      if (rate == null) continue;
      const openingBalance = roundMoney(account.original_balance * rate);
      const ledgerDelta = confirmedLedgerDelta(account.id, account.type);
      db.prepare(`UPDATE accounts SET opening_balance_brl=?, balance=?, updated_at=datetime('now') WHERE id=?`)
        .run(openingBalance, roundMoney(openingBalance + ledgerDelta), account.id);
    }
    return db.prepare('SELECT * FROM accounts ORDER BY name').all();
  });
}
