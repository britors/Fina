import type { TransactionStatus, TransactionType } from '../shared/types';

export interface ExpenseAnalyticsFilters {
  dateFrom: string;
  dateTo: string;
  rootCategoryId?: string;
  subcategoryId?: string;
  account_id?: string;
  owner?: string;
  status?: TransactionStatus;
}

export function categoryOrChildPredicate(categoryColumn: string): string {
  return `(${categoryColumn} = ? OR EXISTS (
    SELECT 1 FROM categories child
    WHERE child.id = ${categoryColumn} AND child.parent_id = ?
  ))`;
}

export function buildExpenseAnalyticsWhere(
  filters: ExpenseAnalyticsFilters,
  includeCategory = true,
  type: TransactionType = 'expense',
): { sql: string; params: string[] } {
  const clauses = [`t.type = '${type}'`, 't.date >= ?', 't.date <= ?'];
  const params: string[] = [filters.dateFrom, filters.dateTo];
  if (filters.account_id) {
    clauses.push('(t.account_id = ? OR EXISTS (SELECT 1 FROM transaction_payments filter_payment WHERE filter_payment.transaction_id = t.id AND filter_payment.account_id = ?))');
    params.push(filters.account_id, filters.account_id);
  }
  if (filters.owner) { clauses.push('t.owner = ?'); params.push(filters.owner); }
  if (filters.status) { clauses.push('t.status = ?'); params.push(filters.status); }
  if (includeCategory && filters.subcategoryId) {
    clauses.push('t.category_id = ?');
    params.push(filters.subcategoryId);
  } else if (includeCategory && filters.rootCategoryId) {
    clauses.push(categoryOrChildPredicate('t.category_id'));
    params.push(filters.rootCategoryId, filters.rootCategoryId);
  }
  return { sql: clauses.join(' AND '), params };
}

export const EXPENSES_BY_ROOT_MONTH_SQL = `
  SELECT root.id, root.name, root.color, SUM(t.amount) as total
  FROM transactions t
  JOIN categories c ON c.id = t.category_id
  JOIN categories root ON root.id = COALESCE(c.parent_id, c.id)
  WHERE t.type = 'expense'
    AND CAST(strftime('%m', t.date) AS INTEGER) = ?
    AND CAST(strftime('%Y', t.date) AS INTEGER) = ?
  GROUP BY root.id, root.name, root.color
  ORDER BY total DESC
`;

export const EXPENSES_BY_ROOT_RANGE_SQL = `
  SELECT root.id, root.name, root.color, SUM(t.amount) as total
  FROM transactions t
  JOIN categories c ON c.id = t.category_id
  JOIN categories root ON root.id = COALESCE(c.parent_id, c.id)
  WHERE t.type = 'expense' AND t.date >= ? AND t.date <= ?
  GROUP BY root.id, root.name, root.color
  ORDER BY total DESC
`;

export const CATEGORY_SPENT_MONTH_SQL = `
  SELECT COALESCE(SUM(amount), 0) as spent
  FROM transactions t
  WHERE ${categoryOrChildPredicate('t.category_id')}
    AND type = 'expense'
    AND CAST(strftime('%m', date) AS INTEGER) = ?
    AND CAST(strftime('%Y', date) AS INTEGER) = ?
`;

export const EXPENSE_SUBCATEGORY_BREAKDOWN_SQL = `
  SELECT
    CASE WHEN c.id = ? THEN NULL ELSE c.id END AS id,
    CASE WHEN c.id = ? THEN 'Sem subcategoria' ELSE c.name END AS name,
    c.color,
    SUM(t.amount) AS total
  FROM transactions t
  JOIN categories c ON c.id = t.category_id
  WHERE t.type = 'expense'
    AND (c.id = ? OR c.parent_id = ?)
    AND t.date >= ? AND t.date <= ?
  GROUP BY c.id, c.name, c.color
  ORDER BY total DESC
`;

export const EXPENSE_CATEGORY_DETAILS_SQL = `
  SELECT root.id, root.name, root.color,
    SUM(t.amount) AS total,
    COUNT(*) AS transaction_count,
    AVG(t.amount) AS average_amount,
    MAX(t.amount) AS largest_amount
  FROM transactions t
  JOIN categories c ON c.id = t.category_id
  JOIN categories root ON root.id = COALESCE(c.parent_id, c.id)
  WHERE t.type = 'expense' AND t.date >= ? AND t.date <= ?
  GROUP BY root.id, root.name, root.color
  ORDER BY total DESC
`;

export const EXPENSE_MONTHLY_ROOT_SERIES_SQL = `
  SELECT strftime('%Y-%m', t.date) AS month,
    root.id, root.name, root.color, SUM(t.amount) AS total
  FROM transactions t
  JOIN categories c ON c.id = t.category_id
  JOIN categories root ON root.id = COALESCE(c.parent_id, c.id)
  WHERE t.type = 'expense' AND t.date >= ? AND t.date <= ?
  GROUP BY month, root.id, root.name, root.color
  ORDER BY month, total DESC
`;

export const EXPENSE_MONTHLY_SUBCATEGORY_SERIES_SQL = `
  SELECT strftime('%Y-%m', t.date) AS month,
    CASE WHEN c.id = ? THEN NULL ELSE c.id END AS id,
    CASE WHEN c.id = ? THEN 'Sem subcategoria' ELSE c.name END AS name,
    c.color, SUM(t.amount) AS total
  FROM transactions t
  JOIN categories c ON c.id = t.category_id
  WHERE t.type = 'expense'
    AND (c.id = ? OR c.parent_id = ?)
    AND t.date >= ? AND t.date <= ?
  GROUP BY month, c.id, c.name, c.color
  ORDER BY month, total DESC
`;
