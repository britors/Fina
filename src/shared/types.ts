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
  to_account_id: string | null;
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

// ── Bens patrimoniais ────────────────────────────────────────────────────────

export type AssetType = 'imovel' | 'veiculo' | 'terreno' | 'investimento' | 'outro';

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  acquisition_value: number;
  current_value: number;
  acquisition_date: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

// ── Carteira de investimentos ─────────────────────────────────────────────────

export type InvestmentType = 'renda_fixa' | 'renda_variavel' | 'fundo' | 'cripto' | 'outro';

export interface Investment {
  id: string;
  name: string;
  type: InvestmentType;
  institution: string | null;
  applied_amount: number;
  current_value: number;
  application_date: string | null;
  maturity_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvestmentSummary {
  total_applied: number;
  total_current: number;
  gain: number;
  gain_pct: number;
  by_type: { type: string; label: string; total: number; color: string }[];
}

// ── Previsão de saldo ─────────────────────────────────────────────────────────

export interface ForecastPoint {
  date: string;
  balance: number;
}

// ── Importação de extratos ────────────────────────────────────────────────────

export interface ImportPreviewRow {
  date: string;
  description: string;
  amount: number;
  type: TransactionType;
  fitid: string | null;
  duplicate: boolean;
}

export interface ImportPreview {
  rows: ImportPreviewRow[];
  format: 'csv' | 'ofx';
  total: number;
  duplicates: number;
}

// ── Metas financeiras ─────────────────────────────────────────────────────────

export type GoalType = 'viagem' | 'imovel' | 'evento' | 'emergencia' | 'outro';

export interface Goal {
  id: string;
  name: string;
  type: GoalType;
  target_amount: number;
  current_amount: number;
  target_date: string | null;
  account_id: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

// ── Dívidas ───────────────────────────────────────────────────────────────────

export type DebtType = 'emprestimo' | 'financiamento' | 'cartao' | 'cheque_especial' | 'pessoal' | 'outro';
export type DebtStatus = 'em_dia' | 'em_atraso' | 'renegociada' | 'quitada';

export interface Debt {
  id: string;
  description: string;
  type: DebtType;
  creditor: string | null;
  original_amount: number;
  outstanding_balance: number;
  interest_rate: number;
  installments_total: number;
  installments_remaining: number;
  installment_amount: number;
  next_due_date: string | null;
  status: DebtStatus;
  created_at: string;
  updated_at: string;
}

export interface DebtSimulation {
  extra_payment: number;
  months_to_pay: number;
  total_paid: number;
  total_interest: number;
  savings_vs_minimum: number;
}

// ── IRPF ─────────────────────────────────────────────────────────────────────

export interface IRPFReport {
  year: number;
  user_name: string;
  rendimentos_tributaveis: { category: string; total: number }[];
  total_rendimentos_tributaveis: number;
  rendimentos_isentos: { category: string; total: number }[];
  total_rendimentos_isentos: number;
  deducoes: { categoria: string; total: number }[];
  total_deducoes: number;
  bens: { descricao: string; tipo: string; valor: number }[];
  total_bens: number;
  dividas: { descricao: string; credor: string; saldo: number }[];
  total_dividas: number;
}

export interface IRPFImportPreview {
  rendimentos: { category: string; total: number }[];
  deducoes: { categoria: string; total: number }[];
  bens: { descricao: string; tipo: string; valor: number }[];
  dividas: { descricao: string; credor: string; saldo: number }[];
  total_rendimentos: number;
  total_deducoes: number;
  total_bens: number;
  total_dividas: number;
}

// ── Indicadores de mercado ────────────────────────────────────────────────────

export interface MarketQuote {
  symbol: string;
  label: string;
  price: number;
  change_pct: number;
  currency: string;
  updated_at: string;
  stale: boolean;
}
