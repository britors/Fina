import type { Account, Transaction, MonthlySummary, AccountType, TransactionType } from './types';

export function formatCurrency(amount: number, locale = 'pt-BR', currency = 'BRL'): string {
  const normalized = Object.is(amount, -0) || Math.abs(amount) < 0.005 ? 0 : amount;
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(normalized);
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('T')[0].split('-');
  return `${day}/${month}/${year}`;
}

export function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

export function getCurrentYearMonth(): { month: number; year: number } {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

export function calculateTotalBalance(accounts: Account[]): number {
  return accounts.reduce((sum, acc) => sum + (isCreditLikeAccountType(acc.type) ? -acc.balance : acc.balance), 0);
}

export function calculateAvailableCredit(account: Account): number {
  if (account.credit_limit == null) return 0;
  return account.credit_limit - account.balance;
}

export function filterTransactionsByDateRange(
  transactions: Transaction[],
  startDate: Date,
  endDate: Date,
): Transaction[] {
  return transactions.filter(t => {
    const d = new Date(t.date); // ISO date string → UTC midnight, consistente com new Date('YYYY-MM-DD')
    return d >= startDate && d <= endDate;
  });
}

export function calculateMonthlySummary(transactions: Transaction[]): MonthlySummary {
  let income = 0;
  let expense = 0;
  for (const t of transactions) {
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') expense += t.amount;
  }
  return { income, expense, balance: income - expense };
}

export function calculateBudgetPercentage(spent: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min((spent / limit) * 100, 100);
}

export function getDaysUntilDue(dueDateStr: string): number {
  const due = new Date(dueDateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function accountTypeLabel(type: string): string {
  const map: Record<string, string> = {
    checking: 'Conta Corrente',
    savings: 'Poupança',
    credit_card: 'Cartão de Crédito',
    meal_voucher: 'Vale Refeição',
    food_voucher: 'Vale Alimentação',
    wallet: 'Carteira',
  };
  return map[type] ?? type;
}

export function isCreditLikeAccountType(type: string): boolean {
  return type === 'credit_card' || type === 'meal_voucher' || type === 'food_voucher';
}

// Pix só se aplica a pagamentos feitos por conta corrente ou fatura de cartão
// de crédito — os demais meios (vale, poupança, carteira) não têm essa opção.
export function isPixEligibleAccountType(type: string): boolean {
  return type === 'checking' || type === 'credit_card';
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// Soma `months` a `date` (YYYY-MM-DD), travando o dia resultante em
// `targetDay`, clampado ao tamanho do mês de destino.
export function addMonthsClamped(date: string, months: number, targetDay: number): string {
  const [year, month] = date.split('-').map(Number);
  const target = new Date(year, month - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const day = Math.min(targetDay, lastDay);
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(day)}`;
}

// Data de fechamento (YYYY-MM-DD) do ciclo de fatura ao qual `date`
// pertence: compras até o dia de fechamento caem na fatura que fecha nesse
// mesmo mês; depois dele, caem na fatura do mês seguinte.
export function invoicePeriodClosingDate(closingDay: number, date: string): string {
  const day = Number(date.split('-')[2]);
  return day <= closingDay ? addMonthsClamped(date, 0, closingDay) : addMonthsClamped(date, 1, closingDay);
}

// Vencimento correspondente a uma data de fechamento de fatura: mesmo mês
// do fechamento se o dia de vencimento vier depois do dia de fechamento
// nesse mês, senão mês seguinte — replica o ciclo real fatura/vencimento.
export function invoiceDueDate(closingDate: string, closingDay: number, dueDay: number): string {
  return dueDay > closingDay ? addMonthsClamped(closingDate, 0, dueDay) : addMonthsClamped(closingDate, 1, dueDay);
}

// --- Open Finance: normalização de dados remotos (Pluggy, Klavi, ...) ---

export interface OpenFinanceRemoteAccount {
  id: string;
  name: string;
  type: AccountType;
  bankName: string | null;
  balance: number;
  creditLimit: number | null;
}

export interface OpenFinanceRemoteTransaction {
  id: string;
  accountId: string;
  description: string;
  amount: number;
  type: TransactionType;
  date: string;
}

export function mapOpenFinanceAccountType(type: string, subtype = ''): AccountType {
  const normalized = stripAccentsLower(`${type} ${subtype}`);
  if (normalized.includes('credit') || normalized.includes('cartao')) return 'credit_card';
  if (normalized.includes('saving') || normalized.includes('poupanca')) return 'savings';
  if (normalized.includes('wallet') || normalized.includes('carteira')) return 'wallet';
  return 'checking';
}

export function stripAccentsLower(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Lê um campo por múltiplos nomes candidatos (exato, depois case-insensitive)
// — útil para respostas de API cuja documentação pública não confirma a
// convenção de casing exata (ex.: a Klavi documenta `accesskey` minúsculo,
// mas a API real usa `accessKey`).
export function ofPick(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  const lowerKeys = keys.map(k => k.toLowerCase());
  const foundKey = Object.keys(obj).find(k => lowerKeys.includes(k.toLowerCase()));
  return foundKey !== undefined ? obj[foundKey] : undefined;
}

function ofNormalizeMoney(value: unknown): number {
  if (value && typeof value === 'object') {
    return ofNormalizeMoney(ofPick(value as Record<string, unknown>, 'amount', 'value'));
  }
  const num = typeof value === 'number' ? value : parseFloat(String(value ?? '0').replace(',', '.'));
  return Number.isFinite(num) ? Math.round(num * 100) / 100 : 0;
}

function ofNormalizeDate(value: unknown): string {
  const raw = String(value ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : new Date().toISOString().slice(0, 10);
}

// A Klavi entrega o relatório de forma assíncrona (webhook/console), e a
// documentação pública não fixa um schema único de resposta — produtos
// distintos (ex.: "pf checking account", "pf credit card") podem vir
// aninhados sob a própria chave do produto. Por isso o parser varre tanto
// a raiz quanto um nível de aninhamento à procura de arrays "accounts", em
// vez de assumir uma única forma fixa; ajuste aqui se o payload real da
// sandbox usar um formato diferente do inferido pela doc.
function extractKlaviAccountNodes(raw: unknown): Record<string, unknown>[] {
  const groups: Record<string, unknown>[][] = [];
  if (!raw || typeof raw !== 'object') return [];
  const obj = raw as Record<string, unknown>;

  const direct = ofPick(obj, 'accounts', 'account');
  if (Array.isArray(direct)) groups.push(direct.filter(isPlainObject));

  for (const value of Object.values(obj)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const nested = ofPick(value as Record<string, unknown>, 'accounts', 'account');
    if (Array.isArray(nested)) groups.push(nested.filter(isPlainObject));
  }

  const seen = new Set<Record<string, unknown>>();
  const flat: Record<string, unknown>[] = [];
  for (const group of groups) for (const node of group) {
    if (seen.has(node)) continue;
    seen.add(node);
    flat.push(node);
  }
  return flat;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseKlaviAccountNode(node: Record<string, unknown>): OpenFinanceRemoteAccount | null {
  const id = ofPick(node, 'accountid', 'accountId', 'id', 'number');
  if (id == null) return null;
  const type = String(ofPick(node, 'type', 'accounttype') ?? '');
  const subtype = String(ofPick(node, 'subtype', 'accountsubtype') ?? '');
  const bankName = ofPick(node, 'brandname', 'bacenname', 'institutionname', 'companyname');
  const balanceRaw = ofPick(node, 'balance', 'availableamount', 'amount');
  const creditLimitRaw = ofPick(node, 'creditlimit', 'limitamount', 'overdraftcontractedlimit');

  return {
    id: String(id),
    name: String(ofPick(node, 'name', 'marketingname', 'brandname') ?? 'Conta Klavi'),
    type: mapOpenFinanceAccountType(type, subtype),
    bankName: bankName != null ? String(bankName) : null,
    balance: ofNormalizeMoney(balanceRaw),
    creditLimit: creditLimitRaw != null ? ofNormalizeMoney(creditLimitRaw) : null,
  };
}

function parseKlaviTransactionNodes(node: Record<string, unknown>, accountId: string): OpenFinanceRemoteTransaction[] {
  const list = ofPick(node, 'transactions', 'movements', 'lancamentos');
  if (!Array.isArray(list)) return [];

  const parsed: OpenFinanceRemoteTransaction[] = [];
  for (const item of list) {
    if (!isPlainObject(item)) continue;
    const id = ofPick(item, 'transactionid', 'transactionId', 'id', 'movementid');
    if (id == null) continue;

    const rawAmount = ofNormalizeMoney(ofPick(item, 'amount', 'transactionamount'));
    const indicator = stripAccentsLower(String(ofPick(item, 'creditdebittype', 'creditodebitotype', 'type') ?? ''));
    const type: TransactionType = indicator.includes('debit') || indicator.includes('debito')
      ? 'expense'
      : indicator.includes('credit') || indicator.includes('credito')
        ? 'income'
        : (rawAmount >= 0 ? 'income' : 'expense');

    const amount = Math.abs(rawAmount);
    if (amount <= 0) continue;

    parsed.push({
      id: String(id),
      accountId,
      description: String(ofPick(item, 'description', 'transactionname', 'descricao') ?? 'Lançamento Klavi'),
      amount,
      type,
      date: ofNormalizeDate(ofPick(item, 'date', 'transactiondate', 'movementdate')),
    });
  }
  return parsed;
}

export function parseKlaviReport(raw: unknown): { accounts: OpenFinanceRemoteAccount[]; transactions: OpenFinanceRemoteTransaction[] } {
  const accounts: OpenFinanceRemoteAccount[] = [];
  const transactions: OpenFinanceRemoteTransaction[] = [];
  const seenIds = new Set<string>();

  for (const node of extractKlaviAccountNodes(raw)) {
    const account = parseKlaviAccountNode(node);
    if (!account || seenIds.has(account.id)) continue;
    seenIds.add(account.id);
    accounts.push(account);
    transactions.push(...parseKlaviTransactionNodes(node, account.id));
  }

  return { accounts, transactions };
}

// --- Open Finance: normalização de dados da Belvo (agregação Brasil/OFDA) ---
//
// Ao contrário da Klavi, a agregação Brasil da Belvo é síncrona (pull), mas
// a doc pública (SPA renderizada em JS) não expôs o schema completo de
// accounts/transactions durante a implementação — os nomes de campo abaixo
// (balance.current, credit_data.credit_limit, type INFLOW/OUTFLOW,
// value_date) são best-effort a partir do conhecimento público da API e
// podem precisar de ajuste contra a sandbox real.

function belvoResultList(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter(isPlainObject);
  if (isPlainObject(payload) && Array.isArray(payload.results)) return payload.results.filter(isPlainObject);
  return [];
}

export function parseBelvoAccounts(payload: unknown): OpenFinanceRemoteAccount[] {
  return belvoResultList(payload).map(acc => {
    const balance = ofPick(acc, 'balance');
    const institution = ofPick(acc, 'institution');
    const creditData = ofPick(acc, 'credit_data');
    const creditLimitRaw = isPlainObject(creditData) ? ofPick(creditData, 'credit_limit') : undefined;
    return {
      id: String(ofPick(acc, 'id') ?? ''),
      name: String(ofPick(acc, 'name', 'category') ?? 'Conta Belvo'),
      type: mapOpenFinanceAccountType(String(ofPick(acc, 'category', 'type') ?? '')),
      bankName: isPlainObject(institution) && institution.name != null ? String(institution.name) : null,
      balance: ofNormalizeMoney(isPlainObject(balance) ? ofPick(balance, 'current') : ofPick(acc, 'balance')),
      creditLimit: creditLimitRaw != null ? ofNormalizeMoney(creditLimitRaw) : null,
    };
  }).filter(account => account.id);
}

export function parseBelvoTransactions(payload: unknown, accountId: string): OpenFinanceRemoteTransaction[] {
  return belvoResultList(payload).map(tx => {
    const merchant = ofPick(tx, 'merchant');
    const rawAmount = ofNormalizeMoney(ofPick(tx, 'amount'));
    const kind = String(ofPick(tx, 'type') ?? '').toUpperCase();
    const type: TransactionType = kind === 'INFLOW' ? 'income' : kind === 'OUTFLOW' ? 'expense' : (rawAmount >= 0 ? 'income' : 'expense');
    return {
      id: String(ofPick(tx, 'id') ?? ''),
      accountId,
      description: String(ofPick(tx, 'description') ?? (isPlainObject(merchant) ? merchant.name : undefined) ?? 'Lançamento Belvo'),
      amount: Math.abs(rawAmount),
      type,
      date: ofNormalizeDate(ofPick(tx, 'value_date', 'accounting_date')),
    };
  }).filter(tx => tx.id && tx.amount > 0);
}
