import type { Account, Transaction, MonthlySummary } from './types';

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
