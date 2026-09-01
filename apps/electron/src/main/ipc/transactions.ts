import { ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { getDb } from '../database';
import type { CategorySplit, CategorySplitWithCategory, PaymentSplit, PaymentSplitWithAccount, Transaction, TransactionFilters, TransactionMemberSplit, TransactionMemberSplitWithMember, TransactionType } from '../../shared/types';
import { isCreditLikeAccountType, isPixEligibleAccountType } from '../../shared/utils';
import { attachToInvoiceCents, adjustInvoiceAmountCents } from '../invoices';
import { buildExpenseAnalyticsWhere, categoryOrChildPredicate, transactionCategoryOrChildPredicate, EXPENSES_BY_ROOT_MONTH_SQL, EXPENSES_BY_ROOT_RANGE_SQL, EXPENSE_CATEGORY_DETAILS_SQL, EXPENSE_MONTHLY_ROOT_SERIES_SQL, EXPENSE_MONTHLY_SUBCATEGORY_SERIES_SQL, EXPENSE_SUBCATEGORY_BREAKDOWN_SQL } from '../categoryHierarchyQueries';
import type { ExpenseAnalyticsFilters } from '../categoryHierarchyQueries';
import { formatMainDate } from '../i18n';
import { fromCents, reconcileMoneyParts, splitCents, toCents, toExactCents, type Cents } from '../../shared/money';

const JOIN = `
  SELECT t.*, a.name as account_name,
    CASE WHEN parent.id IS NULL THEN c.name ELSE parent.name || ' › ' || c.name END as category_name,
    c.icon as category_icon, c.color as category_color
  FROM transactions t
  JOIN accounts a ON t.account_id = a.id
  JOIN categories c ON t.category_id = c.id
  LEFT JOIN categories parent ON parent.id = c.parent_id
`;

type TransactionInput = Omit<Transaction, 'id' | 'created_at' | 'updated_at'> & { payments?: PaymentSplit[]; categories?: CategorySplit[]; member_splits?: TransactionMemberSplit[] };
type TransactionUpdateInput = Partial<Transaction> & { id: string; payments?: PaymentSplit[]; categories?: CategorySplit[]; member_splits?: TransactionMemberSplit[] };
type InstallmentTransactionInput = TransactionInput & { installments: number };

export function balanceDelta(type: TransactionType, amount: number): number {
  return type === 'income' ? amount : -amount;
}

// Para cartões de crédito, "balance" representa a fatura (dívida), não caixa:
// uma despesa deve aumentar o valor devido, e não diminuí-lo como numa conta
// corrente. Vales usam o próprio saldo como valor disponível, então seguem o
// mesmo efeito de saldo das contas comuns.
// Retorna o delta já invertido (signedDelta), para que quem chamou possa
// aplicar o mesmo valor exato à fatura correspondente (attachToInvoice),
// sem duplicar/dessincronizar a lógica de sinal.
export function adjustBalance(accountId: string, delta: number): number {
  return fromCents(adjustBalanceCents(accountId, toExactCents(delta)));
}

export function adjustBalanceCents(accountId: string, delta: Cents): Cents {
  const db = getDb();
  const account = db.prepare('SELECT type FROM accounts WHERE id = ?').get(accountId) as { type: string } | undefined;
  const signedDelta = (account && isCreditLikeAccountType(account.type) ? -delta : delta) as Cents;
  db.prepare(`UPDATE accounts SET balance_cents = balance_cents + ?, updated_at = datetime('now') WHERE id = ?`)
    .run(signedDelta, accountId);
  return signedDelta;
}

// Transferências movem dinheiro entre duas contas: debita a origem e credita o
// destino, em vez de simplesmente desaparecer como uma despesa comum — não
// afetam fatura (liquidação, não gasto novo).
export function applyBalanceEffect(
  tx: {
    id?: string;
    account_id: string;
    to_account_id?: string | null;
    type: TransactionType;
    amount: number;
    date: string;
    payments?: (PaymentSplit & { invoice_id?: string | null })[];
  },
  sign: 1 | -1,
): void {
  if (tx.type === 'transfer' && tx.to_account_id) {
    const amount = toExactCents(tx.amount);
    adjustBalanceCents(tx.account_id, (-amount * sign) as Cents);
    adjustBalanceCents(tx.to_account_id, (amount * sign) as Cents);
    return;
  }

  const payments = tx.payments?.length ? tx.payments : tx.id ? getTransactionPayments(tx.id) : [{ account_id: tx.account_id, amount: tx.amount }];
  for (const payment of payments) {
    const amount = toExactCents(payment.amount);
    const delta = (tx.type === 'income' ? amount * sign : -amount * sign) as Cents;
    const signedDelta = adjustBalanceCents(payment.account_id, delta);
    if (sign === 1) {
      const invoiceId = attachToInvoiceCents(payment.account_id, tx.date, signedDelta);
      if (invoiceId && tx.id) {
        getDb().prepare('UPDATE transaction_payments SET invoice_id = ? WHERE transaction_id = ? AND account_id = ?')
          .run(invoiceId, tx.id, payment.account_id);
      }
    } else if (payment.invoice_id) {
      adjustInvoiceAmountCents(payment.invoice_id, signedDelta);
    }
  }
}

function normalizePayments(data: { type: TransactionType; account_id: string; amount: number; payments?: PaymentSplit[] }): PaymentSplit[] {
  if (data.type === 'transfer') return [];
  const payments = data.payments?.length ? data.payments : [{ account_id: data.account_id, amount: data.amount }];
  const seen = new Set<string>();
  for (const payment of payments) {
    if (!payment.account_id) throw new Error('Selecione todas as contas ou cartões.');
    if (!Number.isFinite(payment.amount) || payment.amount <= 0) throw new Error('Informe valores válidos para as contas ou cartões.');
    if (seen.has(payment.account_id)) throw new Error('Não repita a mesma conta ou cartão no lançamento.');
    seen.add(payment.account_id);
    assertPixEligible(payment);
  }

  let amounts: number[];
  try {
    amounts = reconcileMoneyParts(data.amount, payments.map(payment => payment.amount));
  } catch {
    throw new Error('A soma das contas ou cartões deve ser igual ao valor total.');
  }

  return payments.map((payment, index) => ({ account_id: payment.account_id, amount: amounts[index], is_pix: payment.is_pix ? 1 : 0 }));
}

function assertPixEligible(payment: PaymentSplit): void {
  if (!payment.is_pix) return;
  const account = getDb().prepare('SELECT type FROM accounts WHERE id = ?').get(payment.account_id) as { type: string } | undefined;
  if (!account || !isPixEligibleAccountType(account.type)) {
    throw new Error('Pix só está disponível para pagamentos em conta corrente ou cartão de crédito.');
  }
}

function normalizeCategories(data: { type: TransactionType; category_id: string; amount: number; categories?: CategorySplit[] }): CategorySplit[] {
  if (data.type === 'transfer') return [];
  const categories = data.categories?.length ? data.categories : [{ category_id: data.category_id, amount: data.amount }];
  if (categories.length === 0) throw new Error('Defina pelo menos uma categoria.');

  const seen = new Set<string>();
  for (const category of categories) {
    if (!category.category_id) throw new Error('Selecione todas as categorias.');
    if (!Number.isFinite(category.amount) || category.amount <= 0) throw new Error('Informe valores válidos para as categorias.');
    if (seen.has(category.category_id)) throw new Error('Não repita a mesma categoria.');
    seen.add(category.category_id);
    assertCategoryType(category.category_id, data.type);
  }

  let amounts: number[];
  try {
    amounts = reconcileMoneyParts(data.amount, categories.map(category => category.amount));
  } catch {
    throw new Error('A soma das categorias deve ser igual ao valor total.');
  }

  return categories.map((category, index) => ({ category_id: category.category_id, amount: amounts[index] }));
}

function assertCategoryType(categoryId: string, transactionType: TransactionType): void {
  const expectedType = transactionType === 'income' ? 'income' : 'expense';
  const category = getDb().prepare('SELECT type FROM categories WHERE id = ?').get(categoryId) as { type: string } | undefined;
  if (!category || category.type !== expectedType) {
    throw new Error('Selecione uma categoria válida para o tipo do lançamento.');
  }
}

// Rateio opcional por membro da família (quem deve quem). Ausente ou vazio
// não altera nada — é aditivo ao comportamento existente sem `owner`.
function normalizeMemberSplits(amount: number, splits?: TransactionMemberSplit[]): TransactionMemberSplit[] {
  if (!splits?.length) return [];
  const seen = new Set<string>();
  for (const split of splits) {
    if (!split.member_id) throw new Error('Selecione todos os membros do rateio.');
    if (!Number.isFinite(split.share_amount) || split.share_amount <= 0) throw new Error('Informe valores válidos para o rateio entre membros.');
    if (seen.has(split.member_id)) throw new Error('Não repita o mesmo membro no rateio.');
    seen.add(split.member_id);
  }
  let amounts: number[];
  try {
    amounts = reconcileMoneyParts(amount, splits.map(split => split.share_amount));
  } catch {
    throw new Error('A soma do rateio entre membros deve ser igual ao valor total.');
  }
  return splits.map((split, index) => ({ member_id: split.member_id, share_amount: amounts[index] }));
}

function replaceTransactionMemberSplits(transactionId: string, splits: TransactionMemberSplit[]): void {
  const db = getDb();
  db.prepare('DELETE FROM transaction_member_splits WHERE transaction_id = ?').run(transactionId);
  const stmt = db.prepare('INSERT INTO transaction_member_splits (id, transaction_id, member_id, share_amount, share_amount_cents) VALUES (?,?,?,?,?)');
  for (const split of splits) {
    const cents = toExactCents(split.share_amount);
    stmt.run(randomUUID(), transactionId, split.member_id, fromCents(cents), cents);
  }
}

function getTransactionMemberSplits(transactionId: string): TransactionMemberSplitWithMember[] {
  return getDb().prepare(`
    SELECT s.member_id, s.share_amount, m.name AS member_name
    FROM transaction_member_splits s JOIN family_members m ON m.id = s.member_id
    WHERE s.transaction_id = ?
  `).all(transactionId) as TransactionMemberSplitWithMember[];
}

function replaceTransactionPayments(transactionId: string, payments: PaymentSplit[]): void {
  const db = getDb();
  db.prepare('DELETE FROM transaction_payments WHERE transaction_id = ?').run(transactionId);
  const stmt = db.prepare('INSERT INTO transaction_payments (id, transaction_id, account_id, amount, amount_cents, is_pix) VALUES (?,?,?,?,?,?)');
  for (const payment of payments) {
    const cents = toExactCents(payment.amount);
    stmt.run(randomUUID(), transactionId, payment.account_id, fromCents(cents), cents, payment.is_pix ? 1 : 0);
  }
}

function replaceTransactionCategories(transactionId: string, categories: CategorySplit[]): void {
  const db = getDb();
  db.prepare('DELETE FROM transaction_categories WHERE transaction_id = ?').run(transactionId);
  const stmt = db.prepare('INSERT INTO transaction_categories (id, transaction_id, category_id, amount, amount_cents) VALUES (?,?,?,?,?)');
  for (const category of categories) {
    const cents = toExactCents(category.amount);
    stmt.run(randomUUID(), transactionId, category.category_id, fromCents(cents), cents);
  }
}

function getTransactionCategories(transactionId: string): CategorySplitWithCategory[] {
  return getDb().prepare(`
    SELECT tc.category_id, tc.amount, c.name as category_name, c.icon as category_icon, c.color as category_color
    FROM transaction_categories tc
    JOIN categories c ON c.id = tc.category_id
    WHERE tc.transaction_id = ?
    ORDER BY tc.created_at, tc.id
  `).all(transactionId) as CategorySplitWithCategory[];
}

function insertTransaction(
  data: TransactionInput, id: string, primaryAccountId: string, payments: PaymentSplit[], categories: CategorySplit[], memberSplits: TransactionMemberSplit[] = [],
): void {
  const primaryCategoryId = categories[0]?.category_id ?? data.category_id;
  const amountCents = toExactCents(data.amount);
  getDb().prepare(`
    INSERT INTO transactions (id, account_id, to_account_id, category_id, description, amount, amount_cents, type, date, status,
      notes, recurring, owner, is_mei_revenue, installment_group_id, installment_index, installment_total, paid_by_member_id,
      mobile_device_id, mobile_client_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(id, primaryAccountId, data.to_account_id ?? null, primaryCategoryId, data.description, fromCents(amountCents), amountCents, data.type, data.date, data.status,
         data.notes ?? null, data.recurring ? 1 : 0, data.owner ?? null, data.is_mei_revenue ? 1 : 0,
         data.installment_group_id ?? null, data.installment_index ?? null, data.installment_total ?? null, data.paid_by_member_id ?? null,
         data.mobile_device_id ?? null, data.mobile_client_id ?? null);
  replaceTransactionPayments(id, payments);
  replaceTransactionCategories(id, categories);
  if (memberSplits.length) replaceTransactionMemberSplits(id, memberSplits);
}

// Ponto único para integrações que criam lançamentos já confirmados. Mantém
// as tabelas auxiliares e o saldo da conta sincronizados com o fluxo normal da
// tela de Lançamentos.
export function insertConfirmedTransaction(input: {
  account_id: string;
  category_id: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  date: string;
  notes?: string | null;
  owner?: string | null;
  mobile_device_id?: string | null;
  mobile_client_id?: string | null;
}): string {
  const data: TransactionInput = {
    account_id: input.account_id,
    to_account_id: null,
    category_id: input.category_id,
    description: input.description,
    amount: input.amount,
    type: input.type,
    date: input.date,
    status: 'confirmed',
    notes: input.notes ?? null,
    recurring: 0,
    owner: input.owner ?? null,
    is_mei_revenue: 0,
    mobile_device_id: input.mobile_device_id ?? null,
    mobile_client_id: input.mobile_client_id ?? null,
  };
  const payments = normalizePayments(data);
  const categories = normalizeCategories(data);
  const id = randomUUID();
  getDb().transaction(() => {
    insertTransaction(data, id, input.account_id, payments, categories);
    applyBalanceEffect({ ...data, id, payments }, 1);
  })();
  return id;
}

function splitInstallmentAmounts(amount: number, installments: number): number[] {
  return splitCents(toCents(amount), installments).map(fromCents);
}

function addMonthsIso(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const target = new Date(year, month - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const safeDay = Math.min(day, lastDay);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

function assertCanInstall(data: InstallmentTransactionInput, payments: PaymentSplit[], categories: CategorySplit[]): void {
  if (!Number.isInteger(data.installments) || data.installments < 2 || data.installments > 60) {
    throw new Error('Informe uma quantidade de parcelas entre 2 e 60.');
  }
  if (data.type !== 'expense') {
    throw new Error('Parcelas estão disponíveis apenas para despesas.');
  }
  if (payments.length !== 1) {
    throw new Error('Parcelas estão disponíveis apenas para uma única conta ou cartão.');
  }
  if (categories.length !== 1) {
    throw new Error('Parcelas estão disponíveis apenas para uma única categoria.');
  }
  const account = getDb().prepare('SELECT type FROM accounts WHERE id = ?').get(payments[0].account_id) as { type: string } | undefined;
  if (account?.type !== 'credit_card') {
    throw new Error('Parcelas estão disponíveis apenas para cartão de crédito.');
  }
}

function getTransactionPayments(transactionId: string): PaymentSplitWithAccount[] {
  return getDb().prepare(`
    SELECT p.account_id, p.amount, p.invoice_id, p.is_pix, a.name as account_name
    FROM transaction_payments p
    JOIN accounts a ON a.id = p.account_id
    WHERE p.transaction_id = ?
    ORDER BY p.created_at, p.id
  `).all(transactionId) as PaymentSplitWithAccount[];
}

function enrichTransaction<T extends Transaction & { account_name: string }>(row: T | undefined | null): (T & { payments: PaymentSplitWithAccount[]; categories: CategorySplitWithCategory[]; member_splits: TransactionMemberSplitWithMember[] }) | null {
  if (!row) return null;
  const payments = getTransactionPayments(row.id);
  const categories = getTransactionCategories(row.id);
  const memberSplits = getTransactionMemberSplits(row.id);
  const accountName = payments.length > 1
    ? payments.map(p => p.account_name).join(' + ')
    : payments[0]?.account_name ?? row.account_name;
  return { ...row, account_name: accountName, payments, categories, member_splits: memberSplits };
}

function enrichTransactions<T extends Transaction & { account_name: string }>(rows: T[]): (T & { payments: PaymentSplitWithAccount[]; categories: CategorySplitWithCategory[]; member_splits: TransactionMemberSplitWithMember[] })[] {
  return rows.map(row => enrichTransaction(row)!);
}

function getExpenseAnalytics(filters: ExpenseAnalyticsFilters, type: TransactionType = 'expense'): object {
  const db = getDb();
  const filtered = buildExpenseAnalyticsWhere(filters, true, type);
  const withoutCategory = buildExpenseAnalyticsWhere(filters, false, type);
  const detailMode = !!filters.rootCategoryId && !filters.subcategoryId;
  const subcategoryMode = !!filters.subcategoryId;
  const dimension = detailMode
    ? `CASE WHEN c.id = ? THEN NULL ELSE c.id END AS id,
       CASE WHEN c.id = ? THEN 'Sem subcategoria' ELSE c.name END AS name,
       c.color`
    : subcategoryMode
      ? 'c.id AS id, c.name AS name, c.color'
    : 'root.id AS id, root.name AS name, root.color';
  const group = detailMode || subcategoryMode ? 'c.id, c.name, c.color' : 'root.id, root.name, root.color';
  // O CASE de `dimension` acima é interpolado em duas queries (categories e
  // monthlySeries); cada ocorrência tem 2 placeholders `?` que precisam vir
  // antes dos params do WHERE, na ordem em que aparecem no texto da query.
  const dimensionParams = detailMode ? [filters.rootCategoryId!, filters.rootCategoryId!] : [];

  const availableRoots = db.prepare(`
    SELECT root.id, root.name, root.color, SUM(tc.amount) AS total
    FROM transactions t
    JOIN transaction_categories tc ON tc.transaction_id=t.id
    JOIN categories c ON c.id=tc.category_id
    JOIN categories root ON root.id=COALESCE(c.parent_id,c.id)
    WHERE ${withoutCategory.sql}
    GROUP BY root.id, root.name, root.color ORDER BY total DESC
  `).all(...withoutCategory.params);

  const categories = db.prepare(`
    SELECT ${dimension}, SUM(tc.amount) AS total,
      COUNT(*) AS transaction_count, AVG(tc.amount) AS average_amount, MAX(tc.amount) AS largest_amount
    FROM transactions t
    JOIN transaction_categories tc ON tc.transaction_id=t.id
    JOIN categories c ON c.id=tc.category_id
    JOIN categories root ON root.id=COALESCE(c.parent_id,c.id)
    WHERE ${filtered.sql}
    GROUP BY ${group} ORDER BY total DESC
  `).all(...dimensionParams, ...filtered.params);

  const monthlySeries = db.prepare(`
    SELECT strftime('%Y-%m',t.date) AS month, ${dimension}, SUM(tc.amount) AS total
    FROM transactions t
    JOIN transaction_categories tc ON tc.transaction_id=t.id
    JOIN categories c ON c.id=tc.category_id
    JOIN categories root ON root.id=COALESCE(c.parent_id,c.id)
    WHERE ${filtered.sql}
    GROUP BY month, ${group} ORDER BY month, total DESC
  `).all(...dimensionParams, ...filtered.params);

  const topTransactions = db.prepare(`
    SELECT t.id, t.date, t.description, t.amount, a.name AS account_name,
      CASE WHEN parent.id IS NULL THEN c.name ELSE parent.name || ' › ' || c.name END AS category_name
    FROM transactions t
    JOIN accounts a ON a.id=t.account_id
    JOIN categories c ON c.id=t.category_id
    LEFT JOIN categories parent ON parent.id=c.parent_id
    WHERE ${filtered.sql}
    ORDER BY t.amount DESC, t.date DESC LIMIT 10
  `).all(...filtered.params);

  const kindBreakdown = db.prepare(`
    SELECT root.kind AS kind, SUM(tc.amount) AS total
    FROM transactions t
    JOIN transaction_categories tc ON tc.transaction_id=t.id
    JOIN categories c ON c.id=tc.category_id
    JOIN categories root ON root.id=COALESCE(c.parent_id,c.id)
    WHERE ${filtered.sql}
    GROUP BY root.kind ORDER BY total DESC
  `).all(...filtered.params);

  const weekdayBreakdown = db.prepare(`
    SELECT CAST(strftime('%w',t.date) AS INTEGER) AS weekday, SUM(t.amount) AS total, COUNT(*) AS transaction_count
    FROM transactions t
    WHERE ${filtered.sql}
    GROUP BY weekday ORDER BY weekday
  `).all(...filtered.params);

  const accountBreakdown = db.prepare(`
    SELECT a.id, a.name, SUM(p.amount) AS total
    FROM transactions t
    JOIN transaction_payments p ON p.transaction_id=t.id
    JOIN accounts a ON a.id=p.account_id
    WHERE ${filtered.sql}
    GROUP BY a.id,a.name ORDER BY total DESC
  `).all(...filtered.params);

  const paymentMethodBreakdown = db.prepare(`
    SELECT CASE WHEN p.is_pix THEN 'pix' ELSE 'outros' END AS method, SUM(p.amount) AS total, COUNT(*) AS transaction_count
    FROM transactions t
    JOIN transaction_payments p ON p.transaction_id=t.id
    WHERE ${filtered.sql}
    GROUP BY method ORDER BY total DESC
  `).all(...filtered.params);

  const ownerBreakdown = db.prepare(`
    SELECT COALESCE(NULLIF(TRIM(t.owner), ''), 'Sem responsável') AS owner,
      SUM(t.amount) AS total, COUNT(*) AS transaction_count
    FROM transactions t
    WHERE ${filtered.sql}
    GROUP BY owner ORDER BY total DESC
  `).all(...filtered.params);

  const destinationBreakdown = db.prepare(`
    SELECT LOWER(TRIM(t.description)) AS key, MIN(t.description) AS description,
      SUM(t.amount) AS total, COUNT(*) AS transaction_count, AVG(t.amount) AS average_amount
    FROM transactions t
    WHERE ${filtered.sql} AND TRIM(t.description) <> ''
    GROUP BY key ORDER BY total DESC LIMIT 15
  `).all(...filtered.params);

  return {
    availableRoots, categories, monthlySeries, topTransactions, kindBreakdown,
    weekdayBreakdown, accountBreakdown, paymentMethodBreakdown, ownerBreakdown, destinationBreakdown,
  };
}

function getFilteredMonthlyHistory(filters: ExpenseAnalyticsFilters): object[] {
  const clauses = ['t.date >= ?', 't.date <= ?'];
  const params: string[] = [filters.dateFrom, filters.dateTo];
  if (filters.account_id) {
    clauses.push('(t.account_id = ? OR EXISTS (SELECT 1 FROM transaction_payments filter_payment WHERE filter_payment.transaction_id=t.id AND filter_payment.account_id=?))');
    params.push(filters.account_id, filters.account_id);
  }
  if (filters.owner) { clauses.push('t.owner = ?'); params.push(filters.owner); }
  if (filters.status) { clauses.push('t.status = ?'); params.push(filters.status); }
  else clauses.push("t.status = 'confirmed'");
  if (filters.subcategoryId) {
    clauses.push("t.type='expense'", 't.category_id = ?'); params.push(filters.subcategoryId);
  } else if (filters.rootCategoryId) {
    clauses.push("t.type='expense'", categoryOrChildPredicate('t.category_id'));
    params.push(filters.rootCategoryId, filters.rootCategoryId);
  }

  const rows = getDb().prepare(`
    SELECT strftime('%Y-%m',t.date) AS month,
      SUM(CASE WHEN t.type='income' THEN t.amount ELSE 0 END) AS income,
      SUM(CASE WHEN t.type='expense' THEN t.amount ELSE 0 END) AS expense
    FROM transactions t WHERE ${clauses.join(' AND ')}
    GROUP BY month ORDER BY month
  `).all(...params) as { month: string; income: number; expense: number }[];
  const byMonth = new Map(rows.map(row => [row.month, row]));
  const start = new Date(`${filters.dateFrom}T12:00:00`);
  const end = new Date(`${filters.dateTo}T12:00:00`);
  const result: object[] = [];
  for (let cursor = new Date(start.getFullYear(), start.getMonth(), 1); cursor <= end; cursor.setMonth(cursor.getMonth() + 1)) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    const row = byMonth.get(key);
    result.push({
      month: key,
      label: formatMainDate(cursor, { month: 'short' }),
      income: row?.income ?? 0,
      expense: row?.expense ?? 0,
    });
  }
  return result;
}

export function registerTransactionHandlers(): void {
  ipcMain.handle('transactions:getExpenseAnalytics', (_e, filters: ExpenseAnalyticsFilters) => getExpenseAnalytics(filters));
  ipcMain.handle('transactions:getIncomeAnalytics', (_e, filters: ExpenseAnalyticsFilters) => getExpenseAnalytics(filters, 'income'));
  ipcMain.handle('transactions:getFilteredMonthlyHistory', (_e, filters: ExpenseAnalyticsFilters) => getFilteredMonthlyHistory(filters));
  ipcMain.handle('transactions:list', (_e, filters: TransactionFilters = {}) => {
    const conds: string[] = ['1=1'];
    const params: unknown[] = [];

    if (filters.dateFrom || filters.dateTo) {
      if (filters.dateFrom) { conds.push('t.date >= ?'); params.push(filters.dateFrom); }
      if (filters.dateTo)   { conds.push('t.date <= ?'); params.push(filters.dateTo); }
    } else {
      if (filters.month != null) {
        conds.push("CAST(strftime('%m', t.date) AS INTEGER) = ?");
        params.push(filters.month);
      }
      if (filters.year != null) {
        conds.push("CAST(strftime('%Y', t.date) AS INTEGER) = ?");
        params.push(filters.year);
      }
    }
    if (filters.account_id)  {
      conds.push('(t.account_id = ? OR EXISTS (SELECT 1 FROM transaction_payments p WHERE p.transaction_id = t.id AND p.account_id = ?))');
      params.push(filters.account_id, filters.account_id);
    }
    if (filters.category_id) {
      conds.push(transactionCategoryOrChildPredicate());
      params.push(filters.category_id, filters.category_id, filters.category_id, filters.category_id);
    }
    if (filters.type)        { conds.push('t.type = ?');        params.push(filters.type); }
    if (filters.status)      { conds.push('t.status = ?');      params.push(filters.status); }
    if (filters.owner)       { conds.push('t.owner = ?');       params.push(filters.owner); }

    const limit  = filters.limit  ?? 200;
    const offset = filters.offset ?? 0;

    const rows = getDb()
      .prepare(`${JOIN} WHERE ${conds.join(' AND ')} ORDER BY t.date DESC, t.created_at DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as (Transaction & { account_name: string })[];
    return enrichTransactions(rows);
  });

  ipcMain.handle('transactions:get', (_e, id: string) =>
    enrichTransaction(getDb().prepare(`${JOIN} WHERE t.id = ?`).get(id) as (Transaction & { account_name: string }) | undefined)
  );

  ipcMain.handle('transactions:create', (_e, data: TransactionInput) => {
    if (data.type === 'transfer' && (!data.to_account_id || data.to_account_id === data.account_id)) {
      throw new Error('Selecione uma conta ou cartão de destino diferente da conta ou cartão de origem para a transferência.');
    }
    const payments = normalizePayments(data);
    const categories = normalizeCategories(data);
    const memberSplits = normalizeMemberSplits(data.amount, data.member_splits);
    const primaryAccountId = data.type === 'transfer' ? data.account_id : payments[0]?.account_id ?? data.account_id;
    const id = randomUUID();
    const db = getDb();
    db.transaction(() => {
      insertTransaction(data, id, primaryAccountId, payments, categories, memberSplits);
      if (data.status === 'confirmed') {
        applyBalanceEffect({ ...data, id, account_id: primaryAccountId, payments }, 1);
      }
    })();
    return enrichTransaction(db.prepare(`${JOIN} WHERE t.id = ?`).get(id) as (Transaction & { account_name: string }) | undefined);
  });

  ipcMain.handle('transactions:createInstallments', (_e, data: InstallmentTransactionInput) => {
    const payments = normalizePayments(data);
    const categories = normalizeCategories(data);
    assertCanInstall(data, payments, categories);

    const ids = Array.from({ length: data.installments }, () => randomUUID());
    const amounts = splitInstallmentAmounts(data.amount, data.installments);
    const primaryAccountId = payments[0].account_id;
    const primaryCategoryId = categories[0].category_id;
    const groupId = randomUUID();
    const db = getDb();

    db.transaction(() => {
      amounts.forEach((amount, index) => {
        const installmentData: TransactionInput = {
          ...data,
          amount,
          account_id: primaryAccountId,
          category_id: primaryCategoryId,
          date: addMonthsIso(data.date, index),
          description: `${data.description} (${index + 1}/${data.installments})`,
          payments: [{ account_id: primaryAccountId, amount }],
          categories: [{ category_id: primaryCategoryId, amount }],
          installment_group_id: groupId,
          installment_index: index + 1,
          installment_total: data.installments,
        };
        const installmentPayments = [{ account_id: primaryAccountId, amount }];
        const installmentCategories = [{ category_id: primaryCategoryId, amount }];
        insertTransaction(installmentData, ids[index], primaryAccountId, installmentPayments, installmentCategories);
        if (data.status === 'confirmed') {
          applyBalanceEffect({ ...installmentData, id: ids[index], payments: installmentPayments }, 1);
        }
      });
    })();

    const placeholders = ids.map(() => '?').join(',');
    const rows = db.prepare(`${JOIN} WHERE t.id IN (${placeholders}) ORDER BY t.date ASC, t.created_at ASC`).all(...ids) as (Transaction & { account_name: string })[];
    return enrichTransactions(rows);
  });

  ipcMain.handle('transactions:update', (_e, { id, ...data }: TransactionUpdateInput) => {
    if (data.type === 'transfer' && (!data.to_account_id || data.to_account_id === data.account_id)) {
      throw new Error('Selecione uma conta ou cartão de destino diferente da conta ou cartão de origem para a transferência.');
    }
    const payments = normalizePayments(data as TransactionInput);
    const categories = normalizeCategories(data as TransactionInput);
    const memberSplits = normalizeMemberSplits(data.amount!, (data as TransactionInput).member_splits);
    const primaryAccountId = data.type === 'transfer' ? data.account_id! : payments[0]?.account_id ?? data.account_id!;
    const primaryCategoryId = data.type === 'transfer' ? data.category_id! : categories[0]?.category_id ?? data.category_id!;
    const amountCents = toExactCents(data.amount!);
    const db = getDb();
    db.transaction(() => {
      const old = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as Transaction | undefined;
      const oldPayments = old ? getTransactionPayments(id) : [];
      db.prepare(
        `UPDATE transactions SET account_id=?, to_account_id=?, category_id=?, description=?, amount=?, amount_cents=?, type=?, date=?, status=?, notes=?, recurring=?, owner=?, is_mei_revenue=?, paid_by_member_id=?, updated_at=datetime('now') WHERE id=?`
      ).run(primaryAccountId, data.to_account_id ?? null, primaryCategoryId, data.description, fromCents(amountCents), amountCents, data.type, data.date, data.status, data.notes ?? null, data.recurring ? 1 : 0, data.owner ?? null, data.is_mei_revenue ? 1 : 0, data.paid_by_member_id ?? null, id);

      if (old) {
        const wasConfirmed = old.status === 'confirmed';
        const isConfirmed  = data.status === 'confirmed';

        if (wasConfirmed) {
          // Reverte o efeito anterior
          applyBalanceEffect({ ...old, payments: oldPayments }, -1);
        }
        replaceTransactionPayments(id, payments);
        replaceTransactionCategories(id, categories);
        replaceTransactionMemberSplits(id, memberSplits);
        if (isConfirmed) {
          // Aplica o novo efeito
          applyBalanceEffect({
            id,
            account_id: primaryAccountId,
            to_account_id: data.to_account_id,
            type: data.type!,
            amount: data.amount!,
            date: data.date!,
            payments,
          }, 1);
        }
      }
    })();
    return enrichTransaction(db.prepare(`${JOIN} WHERE t.id = ?`).get(id) as (Transaction & { account_name: string }) | undefined);
  });

  ipcMain.handle('transactions:delete', (_e, id: string) => {
    const db = getDb();
    db.transaction(() => {
      const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as Transaction | undefined;
      const payments = tx ? getTransactionPayments(id) : [];
      db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
      if (tx?.status === 'confirmed') {
        applyBalanceEffect({ ...tx, payments }, -1);
      }
    })();
  });

  ipcMain.handle('transactions:getMonthlySummary', (_e, { month, year }: { month: number; year: number }) => {
    const row = getDb().prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END), 0) as income,
        COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) as expense
        FROM transactions
        WHERE CAST(strftime('%m', date) AS INTEGER) = ?
          AND CAST(strftime('%Y', date) AS INTEGER) = ?
          AND status = 'confirmed'
    `).get(month, year) as { income: number; expense: number };
    return { ...row, balance: row.income - row.expense };
  });

  // Soma, por cartão e por mês futuro, as parcelas já contratadas (via
  // transactions:createInstallments) e ainda não vencidas — o "comprometimento
  // futuro" que o card de Contas mostra para cada cartão.
  ipcMain.handle('transactions:getInstallmentCommitments', () => {
    return getDb().prepare(`
      SELECT a.id AS account_id, a.name AS account_name, strftime('%Y-%m', t.date) AS month, SUM(t.amount) AS total
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      WHERE t.installment_group_id IS NOT NULL
        AND t.type = 'expense'
        AND t.status = 'confirmed'
        AND t.date > date('now')
        AND a.type = 'credit_card'
      GROUP BY a.id, month
      ORDER BY a.id, month
    `).all();
  });

  ipcMain.handle('transactions:getMonthlyHistory', (_e, months = 6) => {
    const rows: { label: string; income: number; expense: number }[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const m = d.getMonth() + 1;
      const y = d.getFullYear();
      const label = formatMainDate(d, { month: 'short' });
      const row = getDb().prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END), 0) as income,
          COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) as expense
        FROM transactions
        WHERE CAST(strftime('%m', date) AS INTEGER) = ?
          AND CAST(strftime('%Y', date) AS INTEGER) = ?
          AND status = 'confirmed'
      `).get(m, y) as { income: number; expense: number };
      rows.push({ label, ...row });
    }
    return rows;
  });

  ipcMain.handle('transactions:getExpensesByCategory', (_e, { month, year }: { month: number; year: number }) => {
    return getDb().prepare(EXPENSES_BY_ROOT_MONTH_SQL).all(month, year);
  });

  // Variante por intervalo de datas (dateFrom/dateTo, formato YYYY-MM-DD), usada
  // pelo filtro de período "de/até" do dashboard principal.
  ipcMain.handle('transactions:getSummaryRange', (_e, { dateFrom, dateTo }: { dateFrom: string; dateTo: string }) => {
    const row = getDb().prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END), 0) as income,
        COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) as expense
      FROM transactions
      WHERE date >= ? AND date <= ? AND status = 'confirmed'
    `).get(dateFrom, dateTo) as { income: number; expense: number };
    return { ...row, balance: row.income - row.expense };
  });

  ipcMain.handle('transactions:getExpensesByCategoryRange', (_e, { dateFrom, dateTo }: { dateFrom: string; dateTo: string }) => {
    return getDb().prepare(EXPENSES_BY_ROOT_RANGE_SQL).all(dateFrom, dateTo);
  });

  ipcMain.handle('transactions:getExpenseSubcategoryBreakdown', (_e, {
    rootCategoryId, dateFrom, dateTo,
  }: { rootCategoryId: string; dateFrom: string; dateTo: string }) => {
    const root = getDb().prepare('SELECT id FROM categories WHERE id = ? AND parent_id IS NULL').get(rootCategoryId);
    if (!root) throw new Error('Categoria principal não encontrada.');
    return getDb().prepare(EXPENSE_SUBCATEGORY_BREAKDOWN_SQL)
      .all(rootCategoryId, rootCategoryId, rootCategoryId, rootCategoryId, dateFrom, dateTo);
  });

  ipcMain.handle('transactions:getExpenseCategoryDetails', (_e, {
    dateFrom, dateTo,
  }: { dateFrom: string; dateTo: string }) =>
    getDb().prepare(EXPENSE_CATEGORY_DETAILS_SQL).all(dateFrom, dateTo)
  );

  ipcMain.handle('transactions:getExpenseMonthlyCategorySeries', (_e, {
    dateFrom, dateTo, rootCategoryId,
  }: { dateFrom: string; dateTo: string; rootCategoryId?: string }) => {
    if (!rootCategoryId) {
      return getDb().prepare(EXPENSE_MONTHLY_ROOT_SERIES_SQL).all(dateFrom, dateTo);
    }
    const root = getDb().prepare('SELECT id FROM categories WHERE id = ? AND parent_id IS NULL').get(rootCategoryId);
    if (!root) throw new Error('Categoria principal não encontrada.');
    return getDb().prepare(EXPENSE_MONTHLY_SUBCATEGORY_SERIES_SQL)
      .all(rootCategoryId, rootCategoryId, rootCategoryId, rootCategoryId, dateFrom, dateTo);
  });
}
