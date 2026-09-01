import { fromCents, toCents } from '../shared/money';

export interface MoneyColumn {
  table: string;
  column: string;
}

export const MONEY_COLUMNS: readonly MoneyColumn[] = [
  { table: 'accounts', column: 'balance' },
  { table: 'accounts', column: 'credit_limit' },
  { table: 'accounts', column: 'original_balance' },
  { table: 'accounts', column: 'opening_balance_brl' },
  { table: 'accounts', column: 'remote_balance' },
  { table: 'transactions', column: 'amount' },
  { table: 'budgets', column: 'limit_amount' },
  { table: 'bills', column: 'amount' },
  { table: 'assets', column: 'acquisition_value' },
  { table: 'assets', column: 'current_value' },
  { table: 'investments', column: 'applied_amount' },
  { table: 'investments', column: 'current_value' },
  { table: 'goals', column: 'target_amount' },
  { table: 'goals', column: 'current_amount' },
  { table: 'debts', column: 'original_amount' },
  { table: 'debts', column: 'outstanding_balance' },
  { table: 'debts', column: 'installment_amount' },
  { table: 'transaction_payments', column: 'amount' },
  { table: 'bill_payments', column: 'amount' },
  { table: 'bill_price_history', column: 'amount' },
  { table: 'account_balance_snapshots', column: 'balance' },
  { table: 'pix_payments', column: 'amount' },
  { table: 'credit_card_invoices', column: 'amount' },
  { table: 'receivables', column: 'amount' },
  { table: 'receivable_payments', column: 'amount' },
  { table: 'receivable_price_history', column: 'amount' },
  { table: 'transaction_categories', column: 'amount' },
  { table: 'bill_categories', column: 'amount' },
  { table: 'receivable_categories', column: 'amount' },
  { table: 'transaction_member_splits', column: 'share_amount' },
  { table: 'goal_contributions', column: 'amount' },
  { table: 'investment_operations', column: 'fees' },
  { table: 'mei_das_payments', column: 'amount' },
] as const;

interface AuditStatement {
  all(): unknown[];
}

export interface MoneyAuditDatabase {
  prepare(sql: string): AuditStatement;
}

export type MoneyViolationReason = 'storage-type' | 'not-finite' | 'out-of-range' | 'sub-cent';

export interface MoneyViolation extends MoneyColumn {
  rowId: number;
  value: unknown;
  reason: MoneyViolationReason;
}

export interface MoneyColumnSummary extends MoneyColumn {
  rows: number;
  centsTotal: bigint;
}

export interface MoneyAuditResult {
  ok: boolean;
  columns: MoneyColumnSummary[];
  violations: MoneyViolation[];
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function auditMoneyMigration(
  db: MoneyAuditDatabase,
  columns: readonly MoneyColumn[] = MONEY_COLUMNS,
): MoneyAuditResult {
  const violations: MoneyViolation[] = [];
  const summaries: MoneyColumnSummary[] = [];

  for (const spec of columns) {
    const table = quoteIdentifier(spec.table);
    const column = quoteIdentifier(spec.column);
    const rows = db.prepare(
      `SELECT rowid AS row_id, ${column} AS monetary_value, typeof(${column}) AS storage_type FROM ${table} WHERE ${column} IS NOT NULL`,
    ).all() as { row_id: number; monetary_value: unknown; storage_type: string }[];
    let centsTotal = 0n;

    for (const row of rows) {
      const base = { ...spec, rowId: row.row_id, value: row.monetary_value };
      if (!['real', 'integer'].includes(row.storage_type) || typeof row.monetary_value !== 'number') {
        violations.push({ ...base, reason: 'storage-type' });
        continue;
      }
      if (!Number.isFinite(row.monetary_value)) {
        violations.push({ ...base, reason: 'not-finite' });
        continue;
      }
      let cents: number;
      try {
        cents = toCents(row.monetary_value);
      } catch {
        violations.push({ ...base, reason: 'out-of-range' });
        continue;
      }
      if (fromCents(cents) !== row.monetary_value) {
        violations.push({ ...base, reason: 'sub-cent' });
        continue;
      }
      centsTotal += BigInt(cents);
    }
    summaries.push({ ...spec, rows: rows.length, centsTotal });
  }

  return { ok: violations.length === 0, columns: summaries, violations };
}

export function assertMoneyMigrationReady(
  db: MoneyAuditDatabase,
  columns: readonly MoneyColumn[] = MONEY_COLUMNS,
): MoneyAuditResult {
  const result = auditMoneyMigration(db, columns);
  if (!result.ok) {
    const sample = result.violations.slice(0, 10)
      .map(item => `${item.table}.${item.column}[rowid=${item.rowId}]:${item.reason}`)
      .join(', ');
    throw new Error(`money-migration-audit-failed (${result.violations.length}): ${sample}`);
  }
  return result;
}
