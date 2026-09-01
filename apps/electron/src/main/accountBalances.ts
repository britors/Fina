import { getDb } from './database';
import { addCents, asCents, fromCents, type Cents } from '../shared/money';

export { roundMoney } from '../shared/money';

// Valores de transações são lançados em BRL no app, inclusive quando o meio
// de pagamento é uma conta em USD/EUR. O saldo inicial convertido fica em
// opening_balance_brl; aqui calculamos apenas o movimento acumulado.
export function confirmedLedgerDeltaCents(accountId: string, accountType: string): Cents {
  const db = getDb();
  const regular = db.prepare(`
    SELECT COALESCE(SUM(
      (CASE WHEN t.type = 'income' THEN p.amount_cents ELSE -p.amount_cents END)
      * CASE WHEN ? = 'credit_card' THEN -1 ELSE 1 END
    ), 0) AS delta
    FROM transactions t
    JOIN transaction_payments p ON p.transaction_id = t.id
    WHERE t.status = 'confirmed' AND t.type != 'transfer' AND p.account_id = ?
  `).get(accountType, accountId) as { delta: number };
  const legacy = db.prepare(`
    SELECT COALESCE(SUM(
      (CASE WHEN t.type = 'income' THEN t.amount_cents ELSE -t.amount_cents END)
      * CASE WHEN ? = 'credit_card' THEN -1 ELSE 1 END
    ), 0) AS delta
    FROM transactions t
    WHERE t.status = 'confirmed' AND t.type != 'transfer'
      AND t.account_id = ?
      AND NOT EXISTS (SELECT 1 FROM transaction_payments p WHERE p.transaction_id = t.id)
  `).get(accountType, accountId) as { delta: number };
  const transfers = db.prepare(`
    SELECT COALESCE(SUM(CASE
      WHEN account_id = ? THEN -amount_cents
      WHEN to_account_id = ? THEN amount_cents
      ELSE 0
    END), 0) AS delta
    FROM transactions
    WHERE status = 'confirmed' AND type = 'transfer'
      AND (account_id = ? OR to_account_id = ?)
  `).get(accountId, accountId, accountId, accountId) as { delta: number };
  const recurringBills = db.prepare(`
    SELECT COALESCE(SUM(-p.amount_cents * CASE WHEN ? = 'credit_card' THEN -1 ELSE 1 END), 0) AS delta
    FROM bills b
    JOIN bill_payments p ON p.bill_id = b.id
    WHERE b.status = 'paid' AND b.recurring = 1 AND p.account_id = ?
  `).get(accountType, accountId) as { delta: number };
  const recurringReceivables = db.prepare(`
    SELECT COALESCE(SUM(p.amount_cents * CASE WHEN ? = 'credit_card' THEN -1 ELSE 1 END), 0) AS delta
    FROM receivables r
    JOIN receivable_payments p ON p.receivable_id = r.id
    WHERE r.status = 'received' AND r.recurring = 1 AND p.account_id = ?
  `).get(accountType, accountId) as { delta: number };

  return addCents(
    asCents(regular.delta), asCents(legacy.delta), asCents(transfers.delta),
    asCents(recurringBills.delta), asCents(recurringReceivables.delta),
  );
}

export function confirmedLedgerDelta(accountId: string, accountType: string): number {
  return fromCents(confirmedLedgerDeltaCents(accountId, accountType));
}

export function recomputeAccountBalance(accountId: string): void {
  const db = getDb();
  const account = db.prepare('SELECT id, type, balance_cents, opening_balance_brl_cents, openfinance_provider FROM accounts WHERE id = ?')
    .get(accountId) as { id: string; type: string; balance_cents: number; opening_balance_brl_cents: number | null; openfinance_provider: string | null } | undefined;
  if (!account || account.openfinance_provider) return;
  const delta = confirmedLedgerDeltaCents(account.id, account.type);
  const opening = account.opening_balance_brl_cents == null
    ? addCents(asCents(account.balance_cents), -delta)
    : asCents(account.opening_balance_brl_cents);
  db.prepare('UPDATE accounts SET opening_balance_brl_cents=?, balance_cents=?, updated_at=datetime(\'now\') WHERE id=?')
    .run(opening, addCents(opening, delta), account.id);
}

export function recomputeAllAccountBalances(): void {
  const accounts = getDb().prepare('SELECT id FROM accounts WHERE openfinance_provider IS NULL').all() as { id: string }[];
  for (const account of accounts) recomputeAccountBalance(account.id);
}
