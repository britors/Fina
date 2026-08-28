import type { Account, Transaction, MonthlySummary, AccountType, TransactionType, CapitalGainsMonth, CapitalGainsReport, InvestmentType, FamilySettlementTransfer } from './types';

function presentationLocale(): string {
  if (typeof navigator !== 'undefined') {
    const candidate = navigator.languages?.[0] || navigator.language;
    if (candidate) return candidate;
  }
  return 'en-US';
}

export function formatCurrency(amount: number, locale = presentationLocale(), currency = 'BRL'): string {
  const normalized = Object.is(amount, -0) || Math.abs(amount) < 0.005 ? 0 : amount;
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(normalized);
}

// `value` já está na escala de porcentagem (ex.: 12.5 para "12,5%"), não em
// fração (0-1) — por isso não usamos style:'percent' do Intl, que multiplica
// por 100. Só formata o número respeitando o separador decimal do locale
// (vírgula em pt-BR); quem chama continua responsável por acrescentar o "%".
export function formatPercent(value: number, decimals = 1, locale = presentationLocale()): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

export function formatDate(dateStr: string, locale = presentationLocale()): string {
  if (!dateStr) return '';
  const isoDate = dateStr.split('T')[0];
  return new Intl.DateTimeFormat(locale).format(new Date(`${isoDate}T00:00:00`));
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
  // Cartão de crédito guarda no saldo o valor da fatura (uma dívida). Vales
  // guardam diretamente o valor disponível para gastar, como uma conta.
  return type === 'credit_card';
}

export function isVoucherAccountType(type: string): boolean {
  return type === 'meal_voucher' || type === 'food_voucher';
}

// Pix só se aplica a pagamentos feitos por conta corrente ou fatura de cartão
// de crédito — as demais contas (vale, poupança, carteira) não têm essa opção.
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

export interface DebtPayoffResult {
  monthsToPay: number;
  totalPaid: number;
  totalInterest: number;
}

// Simula a quitação de uma única dívida com juros compostos mensais dado um
// pagamento mensal fixo. Reaproveitada pelo simulador de dívidas e pelo
// comparador "quitar antecipado vs. investir".
export function simulateDebtPayoff(balance: number, monthlyRatePct: number, payment: number): DebtPayoffResult {
  const monthlyRate = monthlyRatePct / 100;
  let remaining = balance;
  let months = 0;
  let totalPaid = 0;

  while (remaining > 0.01 && months < 600) {
    const interest = remaining * monthlyRate;
    const owed = remaining + interest;
    const actualPayment = Math.min(payment, owed);
    remaining = owed - actualPayment;
    if (remaining < 0) remaining = 0;
    totalPaid += actualPayment;
    months++;
  }

  return { monthsToPay: months, totalPaid, totalInterest: totalPaid - balance };
}

// ── Família/casal: simplificação de dívidas (quem deve quem) ─────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Algoritmo guloso de simplificação de dívidas: casa repetidamente o maior
// credor com o maior devedor até zerar os saldos — minimiza o número de
// transferências necessárias para acertar as contas do grupo.
export function simplifyDebts(balances: { member_id: string; member_name: string; net: number }[]): FamilySettlementTransfer[] {
  const creditors = balances.filter(b => b.net > 0.005).map(b => ({ ...b })).sort((a, b) => b.net - a.net);
  const debtors = balances.filter(b => b.net < -0.005).map(b => ({ ...b, net: -b.net })).sort((a, b) => b.net - a.net);
  const transfers: FamilySettlementTransfer[] = [];

  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = round2(Math.min(debtors[i].net, creditors[j].net));
    if (amount > 0.005) {
      transfers.push({
        from_member_id: debtors[i].member_id,
        from_member_name: debtors[i].member_name,
        to_member_id: creditors[j].member_id,
        to_member_name: creditors[j].member_name,
        amount,
      });
    }
    debtors[i].net = round2(debtors[i].net - amount);
    creditors[j].net = round2(creditors[j].net - amount);
    if (debtors[i].net <= 0.005) i++;
    if (creditors[j].net <= 0.005) j++;
  }
  return transfers;
}

// ── Ganho de capital em investimentos (cálculo auxiliar de IRPF) ─────────────
//
// Isenções mensais de venda (não de ganho) previstas na legislação vigente:
// ações negociadas em bolsa até R$20.000/mês; criptomoedas até R$35.000/mês
// (soma de todas as exchanges/corretoras). Fora disso, alíquota de 15% sobre
// o ganho apurado pelo custo médio ponderado. Isto NÃO substitui a apuração
// oficial (GCAP/programa da Receita) — é só um auxílio de planejamento.
export const CAPITAL_GAINS_EXEMPTION_ACOES = 20000;
export const CAPITAL_GAINS_EXEMPTION_CRIPTO = 35000;
export const CAPITAL_GAINS_RATE = 0.15;

export interface CapitalGainsOperation {
  investment_id: string;
  investment_type: InvestmentType;
  type: 'compra' | 'venda';
  quantity: number;
  unit_price: number;
  fees: number;
  date: string;
}

// Recebe as operações de compra/venda já com o tipo do investimento anexado
// (join feito por quem chama) — não depende de banco de dados, só de dados
// em memória, pra poder ser testada isoladamente.
export function computeCapitalGains(operations: CapitalGainsOperation[], year: number): CapitalGainsReport {
  const byInvestment = new Map<string, CapitalGainsOperation[]>();
  for (const op of operations) {
    const list = byInvestment.get(op.investment_id) ?? [];
    list.push(op);
    byInvestment.set(op.investment_id, list);
  }

  const monthly = new Map<string, { investment_type: InvestmentType; total_sold: number; cost_basis: number; gain: number }>();

  for (const ops of byInvestment.values()) {
    const sorted = [...ops].sort((a, b) => a.date.localeCompare(b.date));
    let qty = 0;
    let costBasis = 0;

    for (const op of sorted) {
      if (op.type === 'compra') {
        qty += op.quantity;
        costBasis += op.quantity * op.unit_price + op.fees;
        continue;
      }

      const avgCost = qty > 0 ? costBasis / qty : 0;
      const soldQty = Math.min(op.quantity, qty);
      const proceeds = soldQty * op.unit_price - op.fees;
      const cost = soldQty * avgCost;
      qty -= soldQty;
      costBasis -= cost;

      if (op.date.slice(0, 4) !== String(year)) continue;

      const month = op.date.slice(0, 7);
      const key = `${month}|${op.investment_type}`;
      const entry = monthly.get(key) ?? { investment_type: op.investment_type, total_sold: 0, cost_basis: 0, gain: 0 };
      entry.total_sold += proceeds;
      entry.cost_basis += cost;
      entry.gain += proceeds - cost;
      monthly.set(key, entry);
    }
  }

  const months: CapitalGainsMonth[] = [...monthly.entries()]
    .map(([key, v]) => {
      const [month] = key.split('|');
      const exemptionLimit = v.investment_type === 'cripto' ? CAPITAL_GAINS_EXEMPTION_CRIPTO : CAPITAL_GAINS_EXEMPTION_ACOES;
      const exempt = v.total_sold <= exemptionLimit;
      const suggestedDarf = !exempt && v.gain > 0 ? v.gain * CAPITAL_GAINS_RATE : 0;
      return {
        month,
        investment_type: v.investment_type,
        total_sold: v.total_sold,
        cost_basis: v.cost_basis,
        gain: v.gain,
        exempt,
        exemption_limit: exemptionLimit,
        suggested_darf: suggestedDarf,
      };
    })
    .sort((a, b) => a.month.localeCompare(b.month) || a.investment_type.localeCompare(b.investment_type));

  return {
    year,
    months,
    total_gain: months.reduce((s, m) => s + m.gain, 0),
    total_suggested_darf: months.reduce((s, m) => s + m.suggested_darf, 0),
  };
}

// Projeta o valor mês a mês com aporte mensal fixo e taxa anual equivalente
// convertida para mensal. Retorna `months + 1` valores (índice 0 = inicial).
// Reaproveitada pelo simulador de patrimônio e pelo comparador "quitar
// antecipado vs. investir".
export function projectCompoundGrowth(initial: number, monthlyContribution: number, annualRatePct: number, months: number): number[] {
  const monthlyRate = Math.pow(1 + annualRatePct / 100, 1 / 12) - 1;
  const values = [initial];
  let value = initial;
  for (let i = 1; i <= months; i++) {
    value = value * (1 + monthlyRate) + monthlyContribution;
    values.push(value);
  }
  return values;
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
