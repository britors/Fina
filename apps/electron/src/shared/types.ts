export type AccountType = 'checking' | 'savings' | 'credit_card' | 'meal_voucher' | 'food_voucher' | 'wallet';
export type TransactionType = 'income' | 'expense' | 'transfer';
export type TransactionStatus = 'confirmed' | 'pending';
export type CategoryType = 'income' | 'expense';
export type CategoryKind = 'essential' | 'variable' | 'income';
export type BillStatus = 'pending' | 'paid' | 'overdue';
export type BillInterval = 'weekly' | 'biweekly' | 'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'annual';
export type ReceivableStatus = 'pending' | 'received' | 'overdue';
export type ReceivableInterval = BillInterval;
export type CreditCardInvoiceStatus = 'open' | 'closed' | 'paid';

export type RadarSeverity = 'danger' | 'warning' | 'info';

export interface RadarSignal {
  key: string;
  severity: RadarSeverity;
  icon: string;
  title: string;
  body: string;
  action: string;
  route: string;
}

export type AccountCurrency = 'BRL' | 'USD' | 'EUR';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  bank_name: string | null;
  balance: number;
  credit_limit: number | null;
  color: string | null;
  currency: AccountCurrency;
  original_balance: number | null;
  closing_day: number | null;
  due_day: number | null;
  openfinance_provider?: string | null;
  openfinance_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinancialDocument {
  id: string;
  filename: string;
  stored_path: string;
  mime_type: string | null;
  size_bytes: number;
  sha256: string;
  created_at: string;
}

export type FiscalClassification = 'tributavel' | 'isenta' | 'dedutivel';

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  type: CategoryType;
  kind: CategoryKind;
  parent_id: string | null;
  parent_name?: string | null;
  depth?: 0 | 1;
  children_count?: number;
  fiscal_classification?: FiscalClassification | null;
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
  owner: string | null;
  installment_group_id?: string | null;
  installment_index?: number | null;
  installment_total?: number | null;
  paid_by_member_id?: string | null;
  is_mei_revenue?: 0 | 1;
  openfinance_provider?: string | null;
  openfinance_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentSplit {
  account_id: string;
  amount: number;
  is_pix?: 0 | 1;
}

export interface PaymentSplitWithAccount extends PaymentSplit {
  account_name: string;
  invoice_id?: string | null;
}

// ── Família/casal: membros e rateio de despesas ───────────────────────────────

export interface FamilyMember {
  id: string;
  name: string;
  created_at: string;
}

export interface TransactionMemberSplit {
  member_id: string;
  share_amount: number;
}

export interface TransactionMemberSplitWithMember extends TransactionMemberSplit {
  member_name: string;
}

export interface FamilySettlementTransfer {
  from_member_id: string;
  from_member_name: string;
  to_member_id: string;
  to_member_name: string;
  amount: number;
}

export interface FamilySettlement {
  balances: { member_id: string; member_name: string; net: number }[];
  transfers: FamilySettlementTransfer[];
}

export interface CategorySplit {
  category_id: string;
  amount: number;
}

export interface CategorySplitWithCategory extends CategorySplit {
  category_name: string;
  category_icon?: string | null;
  category_color?: string | null;
}

export interface TransactionWithDetails extends Transaction {
  account_name: string;
  category_name: string;
  category_icon: string;
  category_color: string;
  payments?: PaymentSplitWithAccount[];
  categories?: CategorySplitWithCategory[];
  member_splits?: TransactionMemberSplitWithMember[];
}

export interface Budget {
  id: string;
  category_id: string;
  month: number;
  year: number;
  limit_amount: number;
  carry_over: 0 | 1;
  created_at: string;
  updated_at: string;
}

export interface BudgetWithProgress extends Budget {
  category_name: string;
  category_icon: string;
  category_color: string;
  spent: number;
  carried_in: number;
  percentage: number;
}

export interface Bill {
  id: string;
  description: string;
  amount: number;
  due_date: string;
  status: BillStatus;
  account_id: string | null;
  category_id: string | null;
  recurring: 0 | 1;
  recurrence_interval: BillInterval;
  created_at: string;
  updated_at: string;
}

export interface BillWithCategory extends Bill {
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
  payments?: PaymentSplitWithAccount[];
  categories?: CategorySplitWithCategory[];
}

export interface Receivable {
  id: string;
  description: string;
  amount: number;
  due_date: string;
  status: ReceivableStatus;
  account_id: string | null;
  category_id: string | null;
  recurring: 0 | 1;
  recurrence_interval: ReceivableInterval;
  created_at: string;
  updated_at: string;
}

export interface ReceivableWithCategory extends Receivable {
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
  payments?: PaymentSplitWithAccount[];
  categories?: CategorySplitWithCategory[];
}

export interface ReceivablePriceHistory {
  id: string;
  receivable_id: string;
  amount: number;
  changed_at: string;
}

export interface ReceivablePriceIncrease {
  receivable_id: string;
  description: string;
  previous_amount: number;
  new_amount: number;
  changed_at: string;
}

export interface InstallmentCommitment {
  account_id: string;
  account_name: string;
  month: string; // 'YYYY-MM'
  total: number;
}

export interface BestPurchaseWindow {
  days_until_closing: number;
  closing_date: string;
  due_date: string;
}

export interface CreditCardInvoice {
  id: string;
  account_id: string;
  amount: number;
  closing_date: string;
  due_date: string;
  status: CreditCardInvoiceStatus;
  created_at: string;
  updated_at: string;
}

export interface CreditCardInvoiceCardState {
  open: CreditCardInvoice;
  closed: CreditCardInvoice | null;
}

export interface CreditCardInvoiceWithAccount extends CreditCardInvoice {
  account_name: string;
}

export interface BillPriceHistory {
  id: string;
  bill_id: string;
  amount: number;
  changed_at: string;
}

export interface DetectedRecurrence {
  key: string;
  description: string;
  occurrences: number;
  avgAmount: number;
  lastDate: string;
  interval: BillInterval;
  likelyForgotten: boolean;
}

export type AnomalyType = 'high_amount' | 'duplicate' | 'recurring_change';

export interface SpendingAnomaly {
  transactionId: string;
  description: string;
  amount: number;
  date: string;
  accountName: string;
  type: AnomalyType;
  reason: string;
}

export interface BillPriceIncrease {
  bill_id: string;
  description: string;
  previous_amount: number;
  new_amount: number;
  changed_at: string;
}

export interface TransactionFilters {
  month?: number;
  year?: number;
  dateFrom?: string;
  dateTo?: string;
  account_id?: string;
  category_id?: string;
  type?: TransactionType;
  status?: TransactionStatus;
  owner?: string;
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

export type AssetReminderKind = 'seguro' | 'garantia' | 'ipva' | 'outro';
export type AssetReminderRecurrence = 'none' | 'annual';

export interface AssetReminder {
  id: string;
  asset_id: string;
  kind: AssetReminderKind;
  due_date: string;
  recurrence: AssetReminderRecurrence;
  notes: string | null;
  dismissed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssetReminderWithAsset extends AssetReminder {
  asset_name: string;
  days_until: number;
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

export type InvestmentOperationType = 'compra' | 'venda';

export interface InvestmentOperation {
  id: string;
  investment_id: string;
  type: InvestmentOperationType;
  quantity: number;
  unit_price: number;
  fees: number;
  date: string;
  notes: string | null;
  created_at: string;
}

export interface InvestmentOperationWithInvestment extends InvestmentOperation {
  investment_name: string;
  investment_type: InvestmentType;
}

// Cálculo auxiliar de ganho de capital por custo médio ponderado — não
// substitui a apuração oficial (GCAP/programa da Receita).
export interface CapitalGainsMonth {
  month: string; // 'YYYY-MM'
  investment_type: InvestmentType;
  total_sold: number;
  cost_basis: number;
  gain: number;
  exempt: boolean;
  exemption_limit: number;
  suggested_darf: number;
}

export interface CapitalGainsReport {
  year: number;
  months: CapitalGainsMonth[];
  total_gain: number;
  total_suggested_darf: number;
}

// ── Previsão de saldo ─────────────────────────────────────────────────────────

export interface ForecastPoint {
  date: string;
  balance: number;
}

export interface ForecastFactor {
  label: string;
  date: string;
  amount: number;
  type: 'income' | 'expense';
}

export interface EndOfMonthForecast {
  points: ForecastPoint[];
  projectedBalance: number;
  currentBalance: number;
  factors: ForecastFactor[];
}

// ── Open Finance: consolidação e fluxo de caixa ───────────────────────────────

export interface ConsolidatedBalanceAccount {
  id: string;
  name: string;
  type: string;
  balance: number;
}

export interface ConsolidatedBalanceGroup {
  bankName: string;
  total: number;
  accounts: ConsolidatedBalanceAccount[];
}

export interface ConsolidatedBalance {
  total: number;
  byInstitution: ConsolidatedBalanceGroup[];
}

export type OpenFinanceConnectionStatus = 'active' | 'pending' | 'incomplete' | 'disabled' | 'unsupported' | 'awaiting_import';

export interface OpenFinanceLinkedAccount {
  id: string;
  name: string;
  type: AccountType;
  bank_name: string | null;
  balance: number;
  credit_limit: number | null;
  openfinance_provider: string | null;
  openfinance_id: string | null;
}

export interface OpenFinanceConnectionInstitution {
  name: string;
  totalBalance: number;
  accounts: OpenFinanceLinkedAccount[];
}

export interface OpenFinanceProviderOverview {
  provider: 'pluggy' | 'belvo' | 'klavi';
  name: string;
  enabled: boolean;
  supportedSync: boolean;
  supportsConnect: boolean;
  hasCredentials: boolean;
  hasConnectionId: boolean;
  status: OpenFinanceConnectionStatus;
  statusLabel: string;
  connectionIdMasked: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  institutions: OpenFinanceConnectionInstitution[];
  totalBalance: number;
  accountCount: number;
}

export interface OpenFinanceOverview {
  providers: OpenFinanceProviderOverview[];
  totalBalance: number;
  accountCount: number;
}

export interface CashFlowWeek {
  weekStart: string;
  weekEnd: string;
  income: number;
  expense: number;
  balance: number;
}

export interface CashFlowFactor {
  label: string;
  date: string;
  amount: number;
  type: 'income' | 'expense';
  recurring: boolean;
}

export interface CashFlowForecast {
  weeks: CashFlowWeek[];
  factors: CashFlowFactor[];
}

export interface BalanceAlertSettings {
  enabled: boolean;
  thresholdPct: number;
  days: number;
}

export interface BalanceDropAlert {
  accountId: string;
  accountName: string;
  bankName: string;
  currentBalance: number;
  previousBalance: number;
  dropPct: number;
  days: number;
}

// ── IA: rascunhos de criação com confirmação ────────────────────────────────

export type AICreateDraftTarget = 'transaction' | 'bill' | 'receivable' | 'budget' | 'debt' | 'goal';

export interface AICreateDraftBase {
  target: AICreateDraftTarget;
  explanation: string;
  warnings: string[];
}

export interface AITransactionDraft extends AICreateDraftBase {
  target: 'transaction';
  description?: string;
  amount?: number;
  type?: TransactionType;
  date?: string;
  status?: TransactionStatus;
  notes?: string | null;
  account_id?: string;
  category_id?: string;
}

export interface AITransactionBatchDraft {
  target: 'transaction_batch';
  explanation: string;
  warnings: string[];
  drafts: AITransactionDraft[];
}

export interface AIBillDraft extends AICreateDraftBase {
  target: 'bill';
  description?: string;
  amount?: number;
  due_date?: string;
  status?: BillStatus;
  account_id?: string | null;
  category_id?: string | null;
}

export interface AIReceivableDraft extends AICreateDraftBase {
  target: 'receivable';
  description?: string;
  amount?: number;
  due_date?: string;
  status?: ReceivableStatus;
  account_id?: string | null;
  category_id?: string | null;
}

export interface AIBudgetDraft extends AICreateDraftBase {
  target: 'budget';
  category_id?: string;
  month?: number;
  year?: number;
  limit_amount?: number;
  carry_over?: 0 | 1;
}

export interface AIDebtDraft extends AICreateDraftBase {
  target: 'debt';
  description?: string;
  type?: DebtType;
  creditor?: string | null;
  status?: DebtStatus;
  original_amount?: number;
  outstanding_balance?: number;
  interest_rate?: number;
  installments_total?: number;
  installments_remaining?: number;
  installment_amount?: number;
  next_due_date?: string | null;
}

export interface AIGoalDraft extends AICreateDraftBase {
  target: 'goal';
  name?: string;
  type?: GoalType;
  target_amount?: number;
  current_amount?: number;
  target_date?: string | null;
  account_id?: string | null;
  description?: string | null;
}

export type AICreateDraft = AITransactionDraft | AIBillDraft | AIReceivableDraft | AIBudgetDraft | AIDebtDraft | AIGoalDraft;

// ── Pix via Open Finance ─────────────────────────────────────────────────────

export type PixPaymentStatus = 'draft' | 'pending' | 'sent' | 'confirmed' | 'failed' | 'cancelled';
export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';

export interface PixPayment {
  id: string;
  provider: 'pluggy' | 'belvo' | 'klavi';
  source_account_id: string | null;
  source_account_name?: string | null;
  amount: number;
  pix_key_masked: string;
  recipient_name: string | null;
  recipient_bank: string | null;
  description: string | null;
  status: PixPaymentStatus;
  external_id: string | null;
  transaction_id: string | null;
  error_message: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

export interface PixPaymentFilters {
  status?: PixPaymentStatus | '';
  dateFrom?: string;
  dateTo?: string;
}

export interface PixRecipient {
  id: string;
  name: string;
  pix_key: string;
  key_type: PixKeyType;
  institution: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PixKeyValidation {
  valid: boolean;
  keyType: PixKeyType | null;
  normalizedKey: string;
  message: string;
}

// ── Importação de extratos ────────────────────────────────────────────────────

export interface ImportPreviewRow {
  date: string;
  description: string;
  amount: number;
  type: TransactionType;
  fitid: string | null;
  duplicate: boolean;
  suggested_category_id?: string | null;
  suggested_category_name?: string | null;
  suggested_category_reason?: string | null;
}

export interface CategorySuggestion {
  categoryId: string;
  categoryName: string;
  occurrences: number;
  totalOccurrences: number;
  reason: string;
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

export interface GoalContribution {
  id: string;
  goal_id: string;
  member_id: string | null;
  amount: number;
  date: string;
  note: string | null;
}

export interface GoalContributionWithMember extends GoalContribution {
  member_name: string | null;
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

// Comparador "quitar dívida antecipadamente vs. investir o mesmo valor" —
// reaproveita simulateDebtPayoff/projectCompoundGrowth de shared/utils.ts.
export interface DebtVsInvestComparison {
  monthly_amount: number;
  months: number;
  payoff_interest_saved: number;
  payoff_months_to_pay: number;
  invest_final_value: number;
  invest_gain: number;
  recommendation: 'payoff' | 'invest';
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

// ── Auto-atualização (electron-updater, apenas Windows) ────────────────────────

export interface UpdateStatus {
  state: 'checking' | 'available' | 'up-to-date' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  percent?: number;
  message?: string;
}

// ── MEI: livro-caixa e DAS ─────────────────────────────────────────────────────

export type MeiDasStatus = 'pendente' | 'pago';

export interface MeiDasPayment {
  id: string;
  competencia: string; // 'YYYY-MM'
  amount: number;
  paid_date: string | null;
  status: MeiDasStatus;
  created_at: string;
  updated_at: string;
}

export interface MeiMonthRevenue {
  month: string; // 'YYYY-MM'
  revenue: number;
  cumulative: number;
}

export interface MeiReport {
  year: number;
  months: MeiMonthRevenue[];
  total_revenue: number;
  annual_limit: number;
  projected_to_exceed: boolean;
  das_payments: MeiDasPayment[];
}

// ── Revisão semanal: persistência e streak ─────────────────────────────────────

export interface WeeklyReviewState {
  week_start: string;
  completed_items: string[];
  completed_at: string | null;
}

export interface WeeklyReviewStreak {
  current_streak: number;
  best_streak: number;
}

// ── Importação de boleto via OCR ───────────────────────────────────────────────

export interface BoletoData {
  raw_text: string;
  linha_digitavel: string | null;
  valid: boolean;
  bank_code: string | null;
  due_date: string | null;
  amount: number | null;
  beneficiario: string | null;
}

// ── Backup incremental ──────────────────────────────────────────────────────────

export interface IncrementalBackupResult {
  file_path: string;
  since: string;
  table_counts: Record<string, number>;
}
