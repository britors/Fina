import { fromCents, toCents, toExactCents } from '../shared/money';
import { MONEY_COLUMNS } from './moneyMigrationAudit';

export type MoneyWireFormat = 'decimal-v1' | 'cents-v1';
export const CURRENT_MONEY_WIRE_FORMAT: MoneyWireFormat = 'cents-v1';
export type WireRow = Record<string, unknown>;

const columnsByTable = MONEY_COLUMNS.reduce<Map<string, string[]>>((result, item) => {
  const columns = result.get(item.table) ?? [];
  columns.push(item.column);
  result.set(item.table, columns);
  return result;
}, new Map());

function hasOwn(row: WireRow, column: string): boolean {
  return Object.prototype.hasOwnProperty.call(row, column);
}

export function resolveMoneyWireFormat(value: unknown): MoneyWireFormat {
  // Patches produzidos antes do versionamento sempre transportaram decimais.
  if (value == null) return 'decimal-v1';
  if (value === 'decimal-v1' || value === 'cents-v1') return value;
  throw new Error('money-wire-format-unsupported');
}

export function normalizeMoneyWireTables(
  source: Record<string, WireRow[]>,
  format: MoneyWireFormat,
): Record<string, WireRow[]> {
  const normalized: Record<string, WireRow[]> = {};
  for (const [table, rows] of Object.entries(source)) {
    const moneyColumns = columnsByTable.get(table) ?? [];
    normalized[table] = rows.map(sourceRow => {
      const row = { ...sourceRow };
      for (const column of moneyColumns) {
        const centsColumn = `${column}_cents`;
        const hasDecimal = hasOwn(row, column);
        const hasCents = hasOwn(row, centsColumn);
        if (hasDecimal && hasCents) throw new Error(`money-wire-units-ambiguous:${table}.${column}`);

        if (format === 'decimal-v1') {
          if (hasCents) throw new Error(`money-wire-cents-in-decimal:${table}.${centsColumn}`);
          continue;
        }

        if (hasDecimal) throw new Error(`money-wire-decimal-in-cents:${table}.${column}`);
        if (!hasCents) continue;
        const cents = row[centsColumn];
        if (cents === null) {
          row[column] = null;
          delete row[centsColumn];
          continue;
        }
        if (typeof cents !== 'number' || !Number.isSafeInteger(cents)) {
          throw new Error(`money-wire-cents-invalid:${table}.${centsColumn}`);
        }
        row[column] = fromCents(cents);
        delete row[centsColumn];
      }
      return row;
    });
  }
  return normalized;
}

export function encodeMoneyWireTables(
  source: Record<string, WireRow[]>,
  format: MoneyWireFormat,
): Record<string, WireRow[]> {
  const encoded: Record<string, WireRow[]> = {};
  for (const [table, rows] of Object.entries(source)) {
    const moneyColumns = columnsByTable.get(table) ?? [];
    encoded[table] = rows.map(sourceRow => {
      const row = { ...sourceRow };
      for (const column of moneyColumns) {
        const centsColumn = `${column}_cents`;
        const hasDecimal = hasOwn(row, column);
        const hasCents = hasOwn(row, centsColumn);
        if (!hasDecimal && !hasCents) continue;

        if (hasDecimal && hasCents) {
          const decimal = row[column];
          const cents = row[centsColumn];
          const consistent = decimal === null && cents === null
            || typeof decimal === 'number' && typeof cents === 'number'
              && Number.isSafeInteger(cents) && toCents(decimal) === cents;
          if (!consistent) throw new Error(`money-wire-units-diverged:${table}.${column}`);
        }

        if (format === 'decimal-v1') {
          if (!hasDecimal) throw new Error(`money-wire-decimal-missing:${table}.${column}`);
          delete row[centsColumn];
          continue;
        }

        if (hasCents) {
          delete row[column];
          continue;
        }

        const value = row[column];
        if (value === null) {
          row[centsColumn] = null;
          delete row[column];
          continue;
        }
        if (typeof value !== 'number') throw new Error(`money-wire-value-invalid:${table}.${column}`);
        row[centsColumn] = toExactCents(value);
        delete row[column];
      }
      return row;
    });
  }
  return encoded;
}
