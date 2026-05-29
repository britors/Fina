export type AccountType = 'checking' | 'savings' | 'credit_card' | 'wallet';
export type TransactionType = 'income' | 'expense' | 'transfer';
export type TransactionStatus = 'confirmed' | 'pending';
export type CategoryType = 'income' | 'expense';
export type BillStatus = 'pending' | 'paid' | 'overdue';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  bank_name: string | null;
  balance: number;
  credit_limit: number | null;
  color: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  type: CategoryType;
  created_at: string;
}

export interface Transaction {
  id: string;
  account_id: string;
  category_id: string;
  description: string;
  amount: number;
  type: TransactionType;
  date: string;
  status: TransactionStatus;
  notes: string | null;
  recurring: 0 | 1;
  created_at: string;
  updated_at: string;
}

export interface TransactionWithDetails extends Transaction {
  account_name: string;
  category_name: string;
  category_icon: string;
  category_color: string;
}

export interface Budget {
  id: string;
  category_id: string;
  month: number;
  year: number;
  limit_amount: number;
  created_at: string;
  updated_at: string;
}

export interface BudgetWithProgress extends Budget {
  category_name: string;
  category_icon: string;
  category_color: string;
  spent: number;
  percentage: number;
}

export interface Bill {
  id: string;
  description: string;
  amount: number;
  due_date: string;
  status: BillStatus;
  account_id: string | null;
  recurring: 0 | 1;
  created_at: string;
  updated_at: string;
}

export interface TransactionFilters {
  month?: number;
  year?: number;
  account_id?: string;
  category_id?: string;
  type?: TransactionType;
  status?: TransactionStatus;
  limit?: number;
  offset?: number;
}

export interface MonthlySummary {
  income: number;
  expense: number;
  balance: number;
}
