import { app, ipcMain, safeStorage } from 'electron';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getDb } from '../database';
import type {
  Account,
  AIBillDraft,
  AIBudgetDraft,
  AICreateDraft,
  AICreateDraftTarget,
  AITransactionBatchDraft,
  AIDebtDraft,
  AIGoalDraft,
  AITransactionDraft,
  BillStatus,
  DebtStatus,
  DebtType,
  GoalType,
  TransactionStatus,
  TransactionType,
} from '../../shared/types';

type AIProvider = 'openai' | 'gemini';

interface AISettings {
  enabled: boolean;
  provider: AIProvider;
  model: string;
  consent: boolean;
  hasKey: boolean;
  encryptionAvailable: boolean;
}

interface AskPayload {
  question: string;
  consentConfirmed: boolean;
}

interface CreateDraftPayload {
  target: AICreateDraftTarget;
  prompt: string;
  consentConfirmed: boolean;
}

interface CreateTransactionBatchPayload {
  prompt: string;
  consentConfirmed: boolean;
}

const DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: 'gpt-5.1',
  gemini: 'gemini-3-pro',
};

const PROVIDERS: AIProvider[] = ['openai', 'gemini'];
const FALLBACK_MODELS: Record<AIProvider, string[]> = {
  openai: ['gpt-5.1', 'gpt-5.1-mini', 'gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4.1-mini'],
  gemini: ['gemini-3-pro', 'gemini-3-flash', 'gemini-2.5-pro', 'gemini-2.5-flash'],
};

function secretsPath(): string {
  return path.join(app.getPath('userData'), 'ai-secrets.json');
}

function getSetting(key: string, fallback = ''): string {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? fallback;
}

function setSetting(key: string, value: string): void {
  getDb().prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?,?)').run(key, value);
}

function readSecrets(): Record<string, string> {
  try {
    const raw = fs.readFileSync(secretsPath(), 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeSecrets(secrets: Record<string, string>): void {
  const file = secretsPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(secrets, null, 2), { mode: 0o600 });
  try { fs.chmodSync(file, 0o600); } catch { /* noop */ }
}

function saveApiKey(provider: AIProvider, apiKey: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Criptografia segura indisponível neste sistema. A chave de IA não foi salva.');
  }
  const trimmed = apiKey.trim();
  if (!trimmed) throw new Error('Informe uma chave de API válida.');
  const secrets = readSecrets();
  secrets[provider] = safeStorage.encryptString(trimmed).toString('base64');
  writeSecrets(secrets);
}

function getApiKey(provider: AIProvider): string | null {
  const enc = readSecrets()[provider];
  if (!enc) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'));
  } catch {
    return null;
  }
}

function clearApiKey(provider: AIProvider): void {
  const secrets = readSecrets();
  delete secrets[provider];
  writeSecrets(secrets);
}

function currentProvider(): AIProvider {
  const raw = getSetting('ai_provider', 'openai');
  return PROVIDERS.includes(raw as AIProvider) ? raw as AIProvider : 'openai';
}

function currentModel(provider = currentProvider()): string {
  return getSetting(`ai_model_${provider}`, DEFAULT_MODELS[provider]);
}

function settings(): AISettings {
  const provider = currentProvider();
  return {
    enabled: getSetting('ai_enabled', 'false') === 'true',
    provider,
    model: currentModel(provider),
    consent: getSetting('ai_consent', 'false') === 'true',
    hasKey: !!getApiKey(provider),
    encryptionAvailable: safeStorage.isEncryptionAvailable(),
  };
}

async function listOpenAIModels(apiKey: string): Promise<string[]> {
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const json = await res.json() as { data?: { id?: string }[]; error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message ?? `OpenAI retornou HTTP ${res.status}`);
  return (json.data ?? [])
    .map(model => model.id ?? '')
    .filter(id =>
      /^(gpt-|o[0-9]|chatgpt-)/.test(id) &&
      !id.includes('embedding') &&
      !id.includes('audio') &&
      !id.includes('transcribe') &&
      !id.includes('tts') &&
      !id.includes('image'),
    )
    .sort((a, b) => a.localeCompare(b));
}

async function listGeminiModels(apiKey: string): Promise<string[]> {
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
    headers: { 'x-goog-api-key': apiKey },
  });
  const json = await res.json() as {
    models?: { name?: string; supportedGenerationMethods?: string[] }[];
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(json.error?.message ?? `Gemini retornou HTTP ${res.status}`);
  return (json.models ?? [])
    .filter(model => (model.supportedGenerationMethods ?? []).some(method => method === 'generateContent' || method === 'generateMessage'))
    .map(model => (model.name ?? '').replace(/^models\//, ''))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

async function listModels(provider: AIProvider): Promise<string[]> {
  const apiKey = getApiKey(provider);
  if (!apiKey) return FALLBACK_MODELS[provider];
  try {
    const remote = provider === 'openai'
      ? await listOpenAIModels(apiKey)
      : await listGeminiModels(apiKey);
    return remote.length ? remote : FALLBACK_MODELS[provider];
  } catch {
    return FALLBACK_MODELS[provider];
  }
}

function financialSummary(): object {
  const db = getDb();
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const currentMonth = String(month).padStart(2, '0');

  const accounts = db.prepare(`
    SELECT type, COUNT(*) as count, COALESCE(SUM(balance),0) as total
    FROM accounts
    GROUP BY type
  `).all() as { type: string; count: number; total: number }[];

  const monthlyHistory = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(year, month - 1 - i, 1);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const y = String(d.getFullYear());
    const row = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) as income,
        COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) as expense
      FROM transactions
      WHERE status='confirmed' AND strftime('%m', date)=? AND strftime('%Y', date)=?
    `).get(m, y) as { income: number; expense: number };
    monthlyHistory.push({ month: `${y}-${m}`, income: row.income, expense: row.expense, balance: row.income - row.expense });
  }

  const expensesByCategory = db.prepare(`
    SELECT c.name as category, COALESCE(SUM(t.amount),0) as total
    FROM categories c
    JOIN transactions t ON t.category_id = c.id
    WHERE c.type='expense'
      AND t.type='expense'
      AND t.status='confirmed'
      AND strftime('%m', t.date)=?
      AND strftime('%Y', t.date)=?
    GROUP BY c.id
    ORDER BY total DESC
    LIMIT 10
  `).all(currentMonth, String(year));

  const debts = db.prepare(`
    SELECT type, status, COUNT(*) as count,
           COALESCE(SUM(outstanding_balance),0) as outstanding,
           COALESCE(SUM(installment_amount),0) as monthly_payment,
           COALESCE(AVG(interest_rate),0) as avg_interest_rate
    FROM debts
    WHERE status != 'quitada'
    GROUP BY type, status
  `).all();

  const budgets = db.prepare(`
    SELECT c.name as category, b.limit_amount,
      COALESCE((
        SELECT SUM(t.amount) FROM transactions t
        WHERE t.category_id=b.category_id AND t.type='expense' AND t.status='confirmed'
          AND strftime('%m', t.date)=printf('%02d', b.month)
          AND strftime('%Y', t.date)=CAST(b.year AS TEXT)
      ),0) as spent
    FROM budgets b
    JOIN categories c ON c.id=b.category_id
    WHERE b.month=? AND b.year=?
  `).all(month, year);

  const goals = db.prepare(`
    SELECT type, COUNT(*) as count,
           COALESCE(SUM(target_amount),0) as target,
           COALESCE(SUM(current_amount),0) as current
    FROM goals
    GROUP BY type
  `).all();

  const investments = db.prepare(`
    SELECT type, COUNT(*) as count,
           COALESCE(SUM(applied_amount),0) as applied,
           COALESCE(SUM(current_value),0) as current
    FROM investments
    GROUP BY type
  `).all();

  const assets = db.prepare(`
    SELECT type, COUNT(*) as count,
           COALESCE(SUM(current_value),0) as current
    FROM assets
    GROUP BY type
  `).all();

  return {
    generated_at: new Date().toISOString(),
    scope: 'Dados agregados e minimizados; sem nomes de bancos, descrições de transações, observações pessoais ou linhas individuais.',
    current_period: { month, year },
    accounts_by_type: accounts,
    monthly_history: monthlyHistory,
    expenses_by_category_current_month: expensesByCategory,
    active_debts_by_type_status: debts,
    budgets_current_month: budgets,
    goals_by_type: goals,
    investments_by_type: investments,
    assets_by_type: assets,
  };
}

function systemInstruction(): string {
  return [
    'Você é um assistente financeiro educacional dentro do Fina.',
    'Use apenas os dados agregados fornecidos.',
    'Não invente dados e não peça informações sensíveis.',
    'Não prometa resultados financeiros.',
    'Não forneça consultoria financeira, fiscal, jurídica ou de investimento personalizada.',
    'Responda em português do Brasil, com linguagem simples, prática e prudente.',
    'Inclua um lembrete curto de que a resposta é informativa e deve ser conferida pelo usuário.',
  ].join('\n');
}

function buildPrompt(question: string, summary: object): string {
  return [
    'Pergunta do usuário:',
    question,
    '',
    'Resumo financeiro agregado do Fina:',
    JSON.stringify(summary, null, 2),
  ].join('\n');
}

function buildSummaryPrompt(summary: object): string {
  return [
    'Gere um resumo em linguagem natural sobre a situação financeira deste mês, com base apenas no resumo agregado abaixo.',
    'Escreva um único parágrafo curto, direto e prático, destacando o saldo do mês, a categoria de maior gasto e uma variação relevante em relação aos meses anteriores.',
    '',
    'Resumo financeiro agregado do Fina:',
    JSON.stringify(summary, null, 2),
  ].join('\n');
}

const DEBT_TYPE_LABELS: Record<string, string> = {
  emprestimo: 'Empréstimo pessoal',
  financiamento: 'Financiamento',
  cartao: 'Cartão de crédito',
  cheque_especial: 'Cheque especial',
  pessoal: 'Dívida pessoal',
  outro: 'Outro',
};

interface RenegotiationDebtInfo {
  type: string;
  outstanding_balance: number;
  installment_amount: number;
  interest_rate: number;
  status: string;
}

function buildRenegotiationPrompt(debt: RenegotiationDebtInfo, summary: object): string {
  return [
    'O usuário quer negociar a dívida abaixo com o credor (nome do credor e descrição não são compartilhados por privacidade):',
    `Tipo: ${DEBT_TYPE_LABELS[debt.type] ?? debt.type}`,
    `Saldo devedor: ${debt.outstanding_balance}`,
    `Parcela mensal atual: ${debt.installment_amount}`,
    `Taxa de juros ao mês: ${debt.interest_rate}%`,
    `Status: ${debt.status === 'em_atraso' ? 'em atraso' : 'em dia'}`,
    '',
    'Escreva um rascunho curto de mensagem/roteiro que o usuário possa usar ao negociar com o credor (por telefone, chat ou e-mail), pedindo redução de juros e/ou alongamento de prazo, com tom educado e direto. Não invente nome de credor, valores ou condições além dos informados.',
    '',
    'Resumo financeiro agregado do Fina (contexto adicional, não é sobre esta dívida especificamente):',
    JSON.stringify(summary, null, 2),
  ].join('\n');
}

type SummaryPeriod = 'day' | 'week';

function periodSummary(period: SummaryPeriod): object {
  const db = getDb();
  const now = new Date();
  const days = period === 'day' ? 1 : 7;
  const from = new Date(now);
  from.setDate(from.getDate() - (days - 1));
  const dateFrom = from.toISOString().slice(0, 10);
  const dateTo = now.toISOString().slice(0, 10);

  const totals = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) as income,
           COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) as expense
    FROM transactions
    WHERE status='confirmed' AND date >= ? AND date <= ?
  `).get(dateFrom, dateTo) as { income: number; expense: number };

  const topExpenseCategories = db.prepare(`
    SELECT c.name as category, COALESCE(SUM(t.amount),0) as total
    FROM categories c
    JOIN transactions t ON t.category_id = c.id
    WHERE c.type='expense' AND t.type='expense' AND t.status='confirmed'
      AND t.date >= ? AND t.date <= ?
    GROUP BY c.id
    ORDER BY total DESC
    LIMIT 5
  `).all(dateFrom, dateTo);

  return {
    period,
    date_from: dateFrom,
    date_to: dateTo,
    income: totals.income,
    expense: totals.expense,
    balance: totals.income - totals.expense,
    top_expense_categories: topExpenseCategories,
  };
}

function buildPeriodSummaryPrompt(period: SummaryPeriod, data: object): string {
  const label = period === 'day' ? 'de hoje' : 'dos últimos 7 dias';
  return [
    `Gere um resumo em linguagem natural sobre a movimentação financeira ${label}, com base apenas nos dados agregados abaixo.`,
    'Escreva um único parágrafo curto, simples, objetivo e acionável, destacando o que entrou, o que saiu, o saldo do período e a categoria de maior gasto (se houver).',
    '',
    'Dados agregados do período:',
    JSON.stringify(data, null, 2),
  ].join('\n');
}

function buildDecisionPrompt(decision: { title: string; body: string; impact: string }, summary: object): string {
  return [
    'O usuário recebeu a seguinte decisão sugerida pelo Fina:',
    `Título: ${decision.title}`,
    `Descrição: ${decision.body}`,
    `Impacto esperado: ${decision.impact}`,
    '',
    'Explique, em um passo a passo prático e numerado, como executar essa decisão específica, considerando o resumo financeiro agregado abaixo.',
    '',
    'Resumo financeiro agregado do Fina:',
    JSON.stringify(summary, null, 2),
  ].join('\n');
}

const DRAFT_TARGETS: AICreateDraftTarget[] = ['transaction', 'bill', 'budget', 'debt', 'goal'];
const TRANSACTION_TYPES: TransactionType[] = ['income', 'expense', 'transfer'];
const TRANSACTION_STATUSES: TransactionStatus[] = ['confirmed', 'pending'];
const BILL_STATUSES: BillStatus[] = ['pending', 'paid', 'overdue'];
const DEBT_TYPES: DebtType[] = ['emprestimo', 'financiamento', 'cartao', 'cheque_especial', 'pessoal', 'outro'];
const DEBT_STATUSES: DebtStatus[] = ['em_dia', 'em_atraso', 'renegociada', 'quitada'];
const GOAL_TYPES: GoalType[] = ['viagem', 'imovel', 'evento', 'emergencia', 'outro'];

function buildCreateDraftPrompt(target: AICreateDraftTarget, userPrompt: string, summary: object): string {
  const today = new Date().toISOString().slice(0, 10);
  return [
    'Transforme o pedido do usuário em um rascunho estruturado para o formulário indicado.',
    'Responda somente com JSON válido, sem markdown e sem texto fora do JSON.',
    'Não invente dados que não estejam no pedido; quando faltar algo, omita o campo e inclua aviso em "warnings".',
    'Resolva datas relativas usando a data atual informada.',
    'Use ponto como separador decimal em números.',
    '',
    `Data atual: ${today}`,
    `Formulário alvo: ${target}`,
    '',
    'Schemas aceitos:',
    'transaction: {"description":string,"amount":number,"type":"income|expense|transfer","date":"YYYY-MM-DD","status":"confirmed|pending","category_hint":string,"account_hint":string,"notes":string,"explanation":string,"warnings":string[]}',
    'bill: {"description":string,"amount":number,"due_date":"YYYY-MM-DD","status":"pending|paid|overdue","category_hint":string,"account_hint":string,"explanation":string,"warnings":string[]}',
    'budget: {"category_hint":string,"month":number,"year":number,"limit_amount":number,"carry_over":boolean,"explanation":string,"warnings":string[]}',
    'debt: {"description":string,"type":"emprestimo|financiamento|cartao|cheque_especial|pessoal|outro","creditor":string,"status":"em_dia|em_atraso|renegociada|quitada","original_amount":number,"outstanding_balance":number,"interest_rate":number,"installments_total":number,"installments_remaining":number,"installment_amount":number,"next_due_date":"YYYY-MM-DD","explanation":string,"warnings":string[]}',
    'goal: {"name":string,"type":"viagem|imovel|evento|emergencia|outro","target_amount":number,"current_amount":number,"target_date":"YYYY-MM-DD","account_hint":string,"description":string,"explanation":string,"warnings":string[]}',
    '',
    'Pedido do usuário:',
    userPrompt,
    '',
    'Resumo financeiro agregado do Fina, para contexto quando útil:',
    JSON.stringify(summary, null, 2),
  ].join('\n');
}

function buildTransactionBatchPrompt(userPrompt: string, summary: object): string {
  const today = new Date().toISOString().slice(0, 10);
  return [
    'Transforme o texto do usuário em uma lista de rascunhos de lançamentos financeiros.',
    'Responda somente com JSON válido, sem markdown e sem texto fora do JSON.',
    'Não invente dados que não estejam no pedido; quando faltar algo em um item, omita o campo e inclua aviso em "warnings" daquele item.',
    'Resolva datas relativas usando a data atual informada.',
    'Use ponto como separador decimal em números.',
    'Limite a resposta a no máximo 20 lançamentos.',
    '',
    `Data atual: ${today}`,
    '',
    'Schema obrigatório:',
    '{"explanation":string,"warnings":string[],"items":[{"description":string,"amount":number,"type":"income|expense|transfer","date":"YYYY-MM-DD","status":"confirmed|pending","category_hint":string,"account_hint":string,"notes":string,"explanation":string,"warnings":string[]}]}',
    '',
    'Texto do usuário:',
    userPrompt,
    '',
    'Resumo financeiro agregado do Fina, para contexto quando útil:',
    JSON.stringify(summary, null, 2),
  ].join('\n');
}

function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || undefined;
}

function asNumber(value: unknown): number | undefined {
  const num = typeof value === 'number' ? value : typeof value === 'string' ? parseFloat(value.replace(',', '.')) : NaN;
  return Number.isFinite(num) ? Math.round(num * 100) / 100 : undefined;
}

function asInt(value: unknown): number | undefined {
  const num = asNumber(value);
  return num == null ? undefined : Math.trunc(num);
}

function asBool01(value: unknown): 0 | 1 | undefined {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value === 1 || value === '1' || value === 'true') return 1;
  if (value === 0 || value === '0' || value === 'false') return 0;
  return undefined;
}

function asEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  const text = asString(value);
  return text && allowed.includes(text as T) ? text as T : undefined;
}

function asDate(value: unknown): string | undefined {
  const text = asString(value);
  return text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : undefined;
}

function asWarnings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(asString).filter((v): v is string => !!v).slice(0, 6) : [];
}

function extractJson(text: string): Record<string, unknown> {
  const trimmed = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
  try {
    return asObject(JSON.parse(trimmed));
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) return asObject(JSON.parse(trimmed.slice(start, end + 1)));
    throw new Error('A IA não retornou um JSON válido para preencher o formulário.');
  }
}

function listAccounts(): Account[] {
  return getDb().prepare('SELECT * FROM accounts ORDER BY created_at, name').all() as Account[];
}

function matchAccount(hint: unknown, preferredType?: string): string | undefined {
  const accounts = listAccounts();
  if (accounts.length === 0) return undefined;
  const text = normalizeText(asString(hint) ?? '');
  if (text) {
    const direct = accounts.find(account => normalizeText(`${account.name} ${account.bank_name ?? ''} ${account.type}`).includes(text));
    if (direct) return direct.id;
  }
  const byType = preferredType ? accounts.find(account => account.type === preferredType) : undefined;
  return byType?.id ?? accounts[0]?.id;
}

function matchCategory(hint: unknown, type: 'income' | 'expense'): string | undefined {
  const categories = getDb().prepare('SELECT id, name FROM categories WHERE type = ? ORDER BY created_at, name').all(type) as { id: string; name: string }[];
  if (categories.length === 0) return undefined;
  const text = normalizeText(asString(hint) ?? '');
  if (text) {
    const direct = categories.find(category => {
      const name = normalizeText(category.name);
      return name.includes(text) || text.includes(name);
    });
    if (direct) return direct.id;
  }
  return categories[0]?.id;
}

function normalizeCreateDraft(target: AICreateDraftTarget, raw: Record<string, unknown>): AICreateDraft {
  const explanation = asString(raw.explanation) ?? 'Rascunho gerado pela IA. Revise todos os campos antes de salvar.';
  const warnings = asWarnings(raw.warnings);

  if (target === 'transaction') {
    const type = asEnum(raw.type, TRANSACTION_TYPES) ?? 'expense';
    const categoryType = type === 'income' ? 'income' : 'expense';
    const draft: AITransactionDraft = {
      target,
      explanation,
      warnings,
      description: asString(raw.description),
      amount: asNumber(raw.amount),
      type,
      date: asDate(raw.date),
      status: asEnum(raw.status, TRANSACTION_STATUSES) ?? 'confirmed',
      notes: asString(raw.notes) ?? null,
      account_id: matchAccount(raw.account_hint),
      category_id: matchCategory(raw.category_hint ?? raw.description, categoryType),
    };
    if (!draft.description) draft.warnings.push('Revise a descrição antes de salvar.');
    if (draft.amount == null) draft.warnings.push('Informe o valor antes de salvar.');
    return draft;
  }

  if (target === 'bill') {
    const draft: AIBillDraft = {
      target,
      explanation,
      warnings,
      description: asString(raw.description),
      amount: asNumber(raw.amount),
      due_date: asDate(raw.due_date),
      status: asEnum(raw.status, BILL_STATUSES) ?? 'pending',
      account_id: matchAccount(raw.account_hint) ?? null,
      category_id: matchCategory(raw.category_hint ?? raw.description, 'expense') ?? null,
    };
    if (!draft.description) draft.warnings.push('Revise a descrição antes de salvar.');
    if (draft.amount == null) draft.warnings.push('Informe o valor antes de salvar.');
    if (!draft.due_date) draft.warnings.push('Informe o vencimento antes de salvar.');
    return draft;
  }

  if (target === 'budget') {
    const now = new Date();
    const draft: AIBudgetDraft = {
      target,
      explanation,
      warnings,
      category_id: matchCategory(raw.category_hint, 'expense'),
      month: asInt(raw.month) ?? now.getMonth() + 1,
      year: asInt(raw.year) ?? now.getFullYear(),
      limit_amount: asNumber(raw.limit_amount),
      carry_over: asBool01(raw.carry_over) ?? 0,
    };
    if (!draft.category_id) draft.warnings.push('Selecione uma categoria antes de salvar.');
    if (draft.limit_amount == null) draft.warnings.push('Informe o limite antes de salvar.');
    return draft;
  }

  if (target === 'debt') {
    const draft: AIDebtDraft = {
      target,
      explanation,
      warnings,
      description: asString(raw.description),
      type: asEnum(raw.type, DEBT_TYPES) ?? 'outro',
      creditor: asString(raw.creditor) ?? null,
      status: asEnum(raw.status, DEBT_STATUSES) ?? 'em_dia',
      original_amount: asNumber(raw.original_amount),
      outstanding_balance: asNumber(raw.outstanding_balance ?? raw.original_amount),
      interest_rate: asNumber(raw.interest_rate) ?? 0,
      installments_total: asInt(raw.installments_total) ?? 1,
      installments_remaining: asInt(raw.installments_remaining ?? raw.installments_total) ?? 1,
      installment_amount: asNumber(raw.installment_amount) ?? 0,
      next_due_date: asDate(raw.next_due_date) ?? null,
    };
    if (!draft.description) draft.warnings.push('Informe a descrição da dívida antes de salvar.');
    return draft;
  }

  const goalDraft: AIGoalDraft = {
    target: 'goal',
    explanation,
    warnings,
    name: asString(raw.name),
    type: asEnum(raw.type, GOAL_TYPES) ?? 'outro',
    target_amount: asNumber(raw.target_amount),
    current_amount: asNumber(raw.current_amount) ?? 0,
    target_date: asDate(raw.target_date) ?? null,
    account_id: matchAccount(raw.account_hint) ?? null,
    description: asString(raw.description) ?? null,
  };
  if (!goalDraft.name) goalDraft.warnings.push('Informe o nome da meta antes de salvar.');
  if (goalDraft.target_amount == null) goalDraft.warnings.push('Informe o valor alvo antes de salvar.');
  return goalDraft;
}

function normalizeTransactionBatch(raw: Record<string, unknown>): AITransactionBatchDraft {
  const items = Array.isArray(raw.items) ? raw.items.slice(0, 20) : [];
  const drafts = items.map(item => normalizeCreateDraft('transaction', asObject(item)) as AITransactionDraft);
  if (drafts.length === 0) {
    throw new Error('A IA não encontrou lançamentos no texto informado.');
  }
  return {
    target: 'transaction_batch',
    explanation: asString(raw.explanation) ?? 'Rascunhos de lançamentos gerados pela IA. Revise os itens antes de salvar.',
    warnings: asWarnings(raw.warnings),
    drafts,
  };
}

async function callOpenAI(apiKey: string, model: string, prompt: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      instructions: systemInstruction(),
      input: prompt,
      store: false,
      max_output_tokens: 1200,
    }),
  });
  const json = await res.json() as {
    output_text?: string;
    error?: { message?: string };
    output?: { content?: { text?: string }[] }[];
  };
  if (!res.ok) throw new Error(json.error?.message ?? `OpenAI retornou HTTP ${res.status}`);
  return json.output_text ?? json.output?.flatMap(o => o.content ?? []).map(c => c.text ?? '').join('\n').trim() ?? '';
}

async function callGemini(apiKey: string, model: string, prompt: string): Promise<string> {
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      system_instruction: systemInstruction(),
      input: prompt,
      store: false,
      generation_config: { temperature: 0.4, thinking_level: 'low' },
    }),
  });
  const json = await res.json() as {
    output_text?: string;
    error?: { message?: string };
    steps?: { content?: { text?: string }[] }[];
  };
  if (!res.ok) throw new Error(json.error?.message ?? `Gemini retornou HTTP ${res.status}`);
  return json.output_text ?? json.steps?.flatMap(s => s.content ?? []).map(c => c.text ?? '').join('\n').trim() ?? '';
}

interface AIAnswer {
  provider: AIProvider;
  model: string;
  answer: string;
  disclaimer: string;
}

interface AIConversation {
  id: string;
  question: string;
  answer: string;
  provider: AIProvider;
  model: string;
  created_at: string;
}

function saveConversation(question: string, answer: AIAnswer): void {
  getDb().prepare(
    'INSERT INTO ai_conversations (id, question, answer, provider, model) VALUES (?,?,?,?,?)'
  ).run(randomUUID(), question, answer.answer, answer.provider, answer.model);
}

function listConversations(): AIConversation[] {
  return getDb().prepare(
    'SELECT id, question, answer, provider, model, created_at FROM ai_conversations ORDER BY created_at DESC LIMIT 50'
  ).all() as AIConversation[];
}

function clearConversations(): void {
  getDb().prepare('DELETE FROM ai_conversations').run();
}

const ANSWER_DISCLAIMER = 'Resposta informativa e educacional. Confira os dados e procure profissional qualificado quando necessário.';

async function askProvider(prompt: string, consentConfirmed: boolean): Promise<AIAnswer> {
  const s = settings();
  if (!s.enabled) throw new Error('A IA está desativada nas configurações.');
  if (!s.consent || !consentConfirmed) throw new Error('Confirme o consentimento antes de enviar dados ao provedor de IA.');
  const apiKey = getApiKey(s.provider);
  if (!apiKey) throw new Error('Configure a chave de API antes de usar o assistente.');

  const answer = s.provider === 'openai'
    ? await callOpenAI(apiKey, s.model, prompt)
    : await callGemini(apiKey, s.model, prompt);

  return {
    provider: s.provider,
    model: s.model,
    answer: answer || 'O provedor não retornou texto.',
    disclaimer: ANSWER_DISCLAIMER,
  };
}

export function registerAIHandlers(): void {
  ipcMain.handle('ai:getSettings', () => settings());

  ipcMain.handle('ai:listModels', async (_e, provider?: AIProvider) => {
    const safeProvider = provider && PROVIDERS.includes(provider) ? provider : currentProvider();
    const models = await listModels(safeProvider);
    const selected = currentModel(safeProvider);
    return models.includes(selected) ? models : [selected, ...models];
  });

  ipcMain.handle('ai:saveSettings', (_e, data: { enabled: boolean; provider: AIProvider; model: string; consent: boolean }) => {
    const provider = PROVIDERS.includes(data.provider) ? data.provider : 'openai';
    setSetting('ai_enabled', data.enabled ? 'true' : 'false');
    setSetting('ai_provider', provider);
    setSetting(`ai_model_${provider}`, data.model?.trim() || DEFAULT_MODELS[provider]);
    setSetting('ai_consent', data.consent ? 'true' : 'false');
    return settings();
  });

  ipcMain.handle('ai:setApiKey', (_e, data: { provider: AIProvider; apiKey: string }) => {
    const provider = PROVIDERS.includes(data.provider) ? data.provider : currentProvider();
    saveApiKey(provider, data.apiKey);
    return settings();
  });

  ipcMain.handle('ai:clearApiKey', (_e, provider?: AIProvider) => {
    clearApiKey(provider && PROVIDERS.includes(provider) ? provider : currentProvider());
    return settings();
  });

  ipcMain.handle('ai:getSummaryPreview', () => ({
    id: randomUUID(),
    fieldsShared: [
      'renda/despesa mensal agregada',
      'despesas por categoria',
      'saldos totais por tipo de meio de pagamento',
      'dívidas por tipo/status',
      'orçamentos do mês',
      'metas, investimentos e bens agregados',
    ],
    fieldsNotShared: [
      'nome, e-mail e dados pessoais',
      'nomes de bancos',
      'descrições e observações de transações',
      'dados linha a linha',
      'chaves de API',
    ],
    summary: financialSummary(),
  }));

  ipcMain.handle('ai:ask', async (_e, payload: AskPayload) => {
    const question = payload.question?.trim();
    if (!question) throw new Error('Digite uma pergunta para o assistente.');
    const answer = await askProvider(buildPrompt(question, financialSummary()), payload.consentConfirmed);
    saveConversation(question, answer);
    return answer;
  });

  ipcMain.handle('ai:createDraft', async (_e, payload: CreateDraftPayload): Promise<AICreateDraft> => {
    const target = DRAFT_TARGETS.includes(payload.target) ? payload.target : null;
    if (!target) throw new Error('Tipo de formulário inválido para criação com IA.');
    const prompt = payload.prompt?.trim();
    if (!prompt) throw new Error('Descreva o que você quer criar.');
    const answer = await askProvider(buildCreateDraftPrompt(target, prompt, financialSummary()), payload.consentConfirmed);
    return normalizeCreateDraft(target, extractJson(answer.answer));
  });

  ipcMain.handle('ai:createTransactionBatchDrafts', async (_e, payload: CreateTransactionBatchPayload): Promise<AITransactionBatchDraft> => {
    const prompt = payload.prompt?.trim();
    if (!prompt) throw new Error('Cole ou descreva os lançamentos que você quer criar.');
    const answer = await askProvider(buildTransactionBatchPrompt(prompt, financialSummary()), payload.consentConfirmed);
    return normalizeTransactionBatch(extractJson(answer.answer));
  });

  ipcMain.handle('ai:summary', async (_e, payload: { consentConfirmed: boolean }) => {
    return askProvider(buildSummaryPrompt(financialSummary()), payload.consentConfirmed);
  });

  ipcMain.handle('ai:periodSummary', async (_e, payload: { period: SummaryPeriod; consentConfirmed: boolean }) => {
    const period: SummaryPeriod = payload.period === 'day' ? 'day' : 'week';
    return askProvider(buildPeriodSummaryPrompt(period, periodSummary(period)), payload.consentConfirmed);
  });

  ipcMain.handle('ai:explainDecision', async (_e, payload: { title: string; body: string; impact: string; consentConfirmed: boolean }) => {
    return askProvider(buildDecisionPrompt(payload, financialSummary()), payload.consentConfirmed);
  });

  ipcMain.handle('ai:renegotiationDraft', async (_e, payload: RenegotiationDebtInfo & { consentConfirmed: boolean }) => {
    return askProvider(buildRenegotiationPrompt(payload, financialSummary()), payload.consentConfirmed);
  });

  ipcMain.handle('ai:history', () => listConversations());

  ipcMain.handle('ai:clearHistory', () => {
    clearConversations();
    return true;
  });
}
