import { app, ipcMain, safeStorage } from 'electron';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getDb } from '../database';

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

const DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: 'gpt-5.5',
  gemini: 'gemini-3.5-flash',
};

const PROVIDERS: AIProvider[] = ['openai', 'gemini'];

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

export function registerAIHandlers(): void {
  ipcMain.handle('ai:getSettings', () => settings());

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
      'saldos totais por tipo de conta',
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
    const s = settings();
    if (!s.enabled) throw new Error('A IA está desativada nas configurações.');
    if (!s.consent || !payload.consentConfirmed) throw new Error('Confirme o consentimento antes de enviar dados ao provedor de IA.');
    const question = payload.question?.trim();
    if (!question) throw new Error('Digite uma pergunta para o assistente.');
    const apiKey = getApiKey(s.provider);
    if (!apiKey) throw new Error('Configure a chave de API antes de usar o assistente.');

    const prompt = buildPrompt(question, financialSummary());
    const answer = s.provider === 'openai'
      ? await callOpenAI(apiKey, s.model, prompt)
      : await callGemini(apiKey, s.model, prompt);

    return {
      provider: s.provider,
      model: s.model,
      answer: answer || 'O provedor não retornou texto.',
      disclaimer: 'Resposta informativa e educacional. Confira os dados e procure profissional qualificado quando necessário.',
    };
  });
}
