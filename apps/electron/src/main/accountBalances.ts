import { getDb } from './database';
import { roundMoney } from '../shared/money';

export { roundMoney } from '../shared/money';

// Valores de transações são lançados em BRL no app, inclusive quando o meio
// de pagamento é uma conta em USD/EUR. O saldo inicial convertido fica em
// opening_balance_brl; aqui calculamos apenas o movimento acumulado.
export function confirmedLedgerDelta(accountId: string, accountType: string): number {
  const db = getDb();
  const regular = db.prepare(`
    SELECT COALESCE(SUM(
      (CASE WHEN t.type = 'income' THEN p.amount ELSE -p.amount END)
      * CASE WHEN ? = 'credit_card' THEN -1 ELSE 1 END
    ), 0) AS delta
    FROM transactions t
    JOIN transaction_payments p ON p.transaction_id = t.id
    WHERE t.status = 'confirmed' AND t.type != 'transfer' AND p.account_id = ?
  `).get(accountType, accountId) as { delta: number };
  const legacy = db.prepare(`
    SELECT COALESCE(SUM(
      (CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END)
      * CASE WHEN ? = 'credit_card' THEN -1 ELSE 1 END
    ), 0) AS delta
    FROM transactions t
    WHERE t.status = 'confirmed' AND t.type != 'transfer'
      AND t.account_id = ?
      AND NOT EXISTS (SELECT 1 FROM transaction_payments p WHERE p.transaction_id = t.id)
  `).get(accountType, accountId) as { delta: number };
  const transfers = db.prepare(`
    SELECT COALESCE(SUM(CASE
      WHEN account_id = ? THEN -amount
      WHEN to_account_id = ? THEN amount
      ELSE 0
    END), 0) AS delta
    FROM transactions
    WHERE status = 'confirmed' AND type = 'transfer'
      AND (account_id = ? OR to_account_id = ?)
  `).get(accountId, accountId, accountId, accountId) as { delta: number };
  const recurringBills = db.prepare(`
    SELECT COALESCE(SUM(-p.amount * CASE WHEN ? = 'credit_card' THEN -1 ELSE 1 END), 0) AS delta
    FROM bills b
    JOIN bill_payments p ON p.bill_id = b.id
    WHERE b.status = 'paid' AND b.recurring = 1 AND p.account_id = ?
  `).get(accountType, accountId) as { delta: number };
  const recurringReceivables = db.prepare(`
    SELECT COALESCE(SUM(p.amount * CASE WHEN ? = 'credit_card' THEN -1 ELSE 1 END), 0) AS delta
    FROM receivables r
    JOIN receivable_payments p ON p.receivable_id = r.id
    WHERE r.status = 'received' AND r.recurring = 1 AND p.account_id = ?
  `).get(accountType, accountId) as { delta: number };

  return roundMoney(
    regular.delta + legacy.delta + transfers.delta
      + recurringBills.delta + recurringReceivables.delta
  );
}

export function recomputeAccountBalance(accountId: string): void {
  const db = getDb();
  const account = db.prepare('SELECT id, type, balance, opening_balance_brl, openfinance_provider FROM accounts WHERE id = ?')
    .get(accountId) as { id: string; type: string; balance: number; opening_balance_brl: number | null; openfinance_provider: string | null } | undefined;
  if (!account || account.openfinance_provider) return;
  const delta = confirmedLedgerDelta(account.id, account.type);
  const opening = account.opening_balance_brl ?? roundMoney(account.balance - delta);
  db.prepare('UPDATE accounts SET opening_balance_brl=?, balance=?, updated_at=datetime(\'now\') WHERE id=?')
    .run(opening, roundMoney(opening + delta), account.id);
}

export function recomputeAllAccountBalances(): void {
  const accounts = getDb().prepare('SELECT id FROM accounts WHERE openfinance_provider IS NULL').all() as { id: string }[];
  for (const account of accounts) recomputeAccountBalance(account.id);
}
