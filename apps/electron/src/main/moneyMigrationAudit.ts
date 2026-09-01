import { fromCents, toCents } from '../shared/money';

const LEGACY_FLOAT_NOISE_TOLERANCE = 1e-7;

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
  allocationViolations: MoneyAllocationViolation[];
}

export type MoneyShadowViolationReason = 'null-mismatch' | 'value-mismatch' | 'cents-storage-type' | 'legacy-invalid';

export interface MoneyShadowViolation extends MoneyColumn {
  rowId: number;
  legacyValue: unknown;
  centsValue: unknown;
  expectedCents: number | null;
  reason: MoneyShadowViolationReason;
}

export interface MoneyShadowAuditResult {
  ok: boolean;
  checkedColumns: number;
  checkedRows: number;
  divergentRows: number;
  violations: MoneyShadowViolation[];
  truncated: boolean;
}

interface MoneyAllocation {
  parentTable: string;
  childTable: string;
  foreignKey: string;
  parentColumn: string;
  childColumn: string;
}

const MONEY_ALLOCATIONS: readonly MoneyAllocation[] = [
  { parentTable: 'transactions', childTable: 'transaction_payments', foreignKey: 'transaction_id', parentColumn: 'amount', childColumn: 'amount' },
  { parentTable: 'transactions', childTable: 'transaction_categories', foreignKey: 'transaction_id', parentColumn: 'amount', childColumn: 'amount' },
  { parentTable: 'transactions', childTable: 'transaction_member_splits', foreignKey: 'transaction_id', parentColumn: 'amount', childColumn: 'share_amount' },
  { parentTable: 'bills', childTable: 'bill_payments', foreignKey: 'bill_id', parentColumn: 'amount', childColumn: 'amount' },
  { parentTable: 'bills', childTable: 'bill_categories', foreignKey: 'bill_id', parentColumn: 'amount', childColumn: 'amount' },
  { parentTable: 'receivables', childTable: 'receivable_payments', foreignKey: 'receivable_id', parentColumn: 'amount', childColumn: 'amount' },
  { parentTable: 'receivables', childTable: 'receivable_categories', foreignKey: 'receivable_id', parentColumn: 'amount', childColumn: 'amount' },
] as const;

export interface MoneyAllocationViolation {
  parentTable: string;
  childTable: string;
  parentRowId: number;
  expectedCents: number;
  actualCents: number;
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function auditMoneyShadowConsistency(
  db: MoneyAuditDatabase,
  columns: readonly MoneyColumn[] = MONEY_COLUMNS,
  sampleLimit = 50,
): MoneyShadowAuditResult {
  if (!Number.isInteger(sampleLimit) || sampleLimit < 1 || sampleLimit > 1000) {
    throw new Error('money-shadow-sample-limit-invalid');
  }
  let checkedRows = 0;
  let divergentRows = 0;
  const violations: MoneyShadowViolation[] = [];

  for (const spec of columns) {
    const table = quoteIdentifier(spec.table);
    const legacy = quoteIdentifier(spec.column);
    const cents = quoteIdentifier(`${spec.column}_cents`);
    const mismatch = `CAST(ROUND(${legacy} * 100) AS INTEGER) IS NOT ${cents}
      OR (${cents} IS NOT NULL AND typeof(${cents}) != 'integer')`;
    const summary = db.prepare(`
      SELECT COUNT(*) AS checked_rows,
        COUNT(*) FILTER (WHERE ${mismatch}) AS divergent_rows
      FROM ${table}
    `).all()[0] as { checked_rows: number; divergent_rows: number };
    checkedRows += summary.checked_rows;
    divergentRows += summary.divergent_rows;

    const remaining = sampleLimit - violations.length;
    if (remaining <= 0 || summary.divergent_rows === 0) continue;
    const rows = db.prepare(`
      SELECT rowid AS row_id, ${legacy} AS legacy_value, ${cents} AS cents_value,
        typeof(${cents}) AS cents_storage_type
      FROM ${table}
      WHERE ${mismatch}
      ORDER BY rowid
      LIMIT ${remaining}
    `).all() as { row_id: number; legacy_value: unknown; cents_value: unknown; cents_storage_type: string }[];
    for (const row of rows) {
      let expectedCents: number | null = null;
      let reason: MoneyShadowViolationReason;
      if (row.cents_value != null && row.cents_storage_type !== 'integer') {
        reason = 'cents-storage-type';
      } else if ((row.legacy_value == null) !== (row.cents_value == null)) {
        reason = 'null-mismatch';
      } else {
        try {
          expectedCents = row.legacy_value == null ? null : toCents(row.legacy_value as number);
          reason = 'value-mismatch';
        } catch {
          reason = 'legacy-invalid';
        }
      }
      violations.push({
        ...spec, rowId: row.row_id, legacyValue: row.legacy_value,
        centsValue: row.cents_value, expectedCents, reason,
      });
    }
  }

  return {
    ok: divergentRows === 0,
    checkedColumns: columns.length,
    checkedRows,
    divergentRows,
    violations,
    truncated: divergentRows > violations.length,
  };
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
      // Bancos legados acumularam `number` em REAL e podem conter artefatos
      // como 0.1 + 0.2 = 0.30000000000000004. Aceite somente ruído muito
      // abaixo de meio centavo; precisão material (ex.: 1.005) continua
      // bloqueando a migração.
      if (Math.abs(fromCents(cents) - row.monetary_value) > LEGACY_FLOAT_NOISE_TOLERANCE) {
        violations.push({ ...base, reason: 'sub-cent' });
        continue;
      }
      centsTotal += BigInt(cents);
    }
    summaries.push({ ...spec, rows: rows.length, centsTotal });
  }

  const auditedKeys = new Set(columns.map(item => `${item.table}.${item.column}`));
  const allocationViolations: MoneyAllocationViolation[] = [];
  for (const allocation of MONEY_ALLOCATIONS) {
    if (!auditedKeys.has(`${allocation.parentTable}.${allocation.parentColumn}`)
      || !auditedKeys.has(`${allocation.childTable}.${allocation.childColumn}`)) continue;
    const rows = db.prepare(`
      SELECT parent.rowid AS parent_row_id,
        CAST(ROUND(parent.${quoteIdentifier(allocation.parentColumn)} * 100) AS INTEGER) AS expected_cents,
        CAST(SUM(ROUND(child.${quoteIdentifier(allocation.childColumn)} * 100)) AS INTEGER) AS actual_cents
      FROM ${quoteIdentifier(allocation.parentTable)} parent
      JOIN ${quoteIdentifier(allocation.childTable)} child
        ON child.${quoteIdentifier(allocation.foreignKey)} = parent.id
      GROUP BY parent.rowid
      HAVING expected_cents != actual_cents
    `).all() as { parent_row_id: number; expected_cents: number; actual_cents: number }[];
    allocationViolations.push(...rows.map(row => ({
      parentTable: allocation.parentTable,
      childTable: allocation.childTable,
      parentRowId: row.parent_row_id,
      expectedCents: row.expected_cents,
      actualCents: row.actual_cents,
    })));
  }

  return {
    ok: violations.length === 0 && allocationViolations.length === 0,
    columns: summaries,
    violations,
    allocationViolations,
  };
}

export function assertMoneyMigrationReady(
  db: MoneyAuditDatabase,
  columns: readonly MoneyColumn[] = MONEY_COLUMNS,
): MoneyAuditResult {
  const result = auditMoneyMigration(db, columns);
  if (!result.ok) {
    const columnSample = result.violations.slice(0, 10)
      .map(item => `${item.table}.${item.column}[rowid=${item.rowId}]:${item.reason}`)
      .join(', ');
    const allocationSample = result.allocationViolations.slice(0, 10)
      .map(item => `${item.parentTable}->${item.childTable}[rowid=${item.parentRowId}]:${item.actualCents}/${item.expectedCents}`)
      .join(', ');
    const sample = [columnSample, allocationSample].filter(Boolean).join(', ');
    const count = result.violations.length + result.allocationViolations.length;
    throw new Error(`money-migration-audit-failed (${count}): ${sample}`);
  }
  return result;
}
