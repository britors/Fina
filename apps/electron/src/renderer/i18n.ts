import autoCatalog from './i18n-auto.json';

export type AppLocale = 'en-US' | 'pt-BR' | 'es-ES' | 'zh-CN';
export type I18nValues = Readonly<Record<string, string | number>>;

type Translation = readonly [source: string, en: string, es: string, zh: string];

// pt-BR is the source language. Keeping every locale on the same row makes it
// impossible to add an orphan key or accidentally ship a partial catalog.
const entries: readonly Translation[] = [
  ['Finanças pessoais', 'Personal finance', 'Finanzas personales', '个人财务'],
  ['Conta pessoal', 'Personal account', 'Cuenta personal', '个人账户'],
  ['Usuário', 'User', 'Usuario', '用户'],
  ['Buscar no menu... (Ctrl+K)', 'Search the menu... (Ctrl+K)', 'Buscar en el menú... (Ctrl+K)', '搜索菜单... (Ctrl+K)'],
  ['Mostrar/ocultar menu', 'Show/hide menu', 'Mostrar/ocultar menú', '显示/隐藏菜单'],
  ['Minimizar', 'Minimize', 'Minimizar', '最小化'],
  ['Maximizar', 'Maximize', 'Maximizar', '最大化'],
  ['Fechar', 'Close', 'Cerrar', '关闭'],
  ['Visão geral', 'Overview', 'Vista general', '概览'],
  ['Movimentação', 'Activity', 'Movimientos', '收支'],
  ['Dívidas e proteção', 'Debt and protection', 'Deudas y protección', '债务与保障'],
  ['Patrimônio e crescimento', 'Wealth and growth', 'Patrimonio y crecimiento', '资产与增长'],
  ['Análise', 'Analysis', 'Análisis', '分析'],
  ['Sistema', 'System', 'Sistema', '系统'],
  ['Dashboard', 'Dashboard', 'Panel', '仪表板'],
  ['Diagnóstico', 'Diagnosis', 'Diagnóstico', '财务诊断'],
  ['Score', 'Score', 'Puntuación', '评分'],
  ['Revisão semanal', 'Weekly review', 'Revisión semanal', '每周复盘'],
  ['Decisões', 'Decisions', 'Decisiones', '决策'],
  ['Plano mensal', 'Monthly plan', 'Plan mensual', '月度计划'],
  ['Alertas', 'Alerts', 'Alertas', '提醒'],
  ['Assistente IA', 'AI assistant', 'Asistente de IA', 'AI 助手'],
  ['Lançamentos', 'Transactions', 'Movimientos', '交易记录'],
  ['Transações', 'Transactions', 'Transacciones', '交易记录'],
  ['Contas e Cartões', 'Accounts and cards', 'Cuentas y tarjetas', '账户与卡'],
  ['Contas a pagar', 'Bills to pay', 'Cuentas por pagar', '应付账款'],
  ['Contas a receber', 'Accounts receivable', 'Cuentas por cobrar', '应收账款'],
  ['Despesas fixas', 'Fixed expenses', 'Gastos fijos', '固定支出'],
  ['Receitas fixas', 'Fixed income', 'Ingresos fijos', '固定收入'],
  ['Calendário', 'Calendar', 'Calendario', '日历'],
  ['Orçamento', 'Budget', 'Presupuesto', '预算'],
  ['Família/Casal', 'Family/Couple', 'Familia/Pareja', '家庭/伴侣'],
  ['Dívidas', 'Debts', 'Deudas', '债务'],
  ['Plano de saída', 'Payoff plan', 'Plan de salida', '还债计划'],
  ['Renegociação', 'Renegotiation', 'Renegociación', '重新协商'],
  ['Reserva', 'Emergency fund', 'Fondo de emergencia', '应急储备'],
  ['Patrimônio', 'Net worth', 'Patrimonio', '净资产'],
  ['Investimentos', 'Investments', 'Inversiones', '投资'],
  ['Metas', 'Goals', 'Metas', '目标'],
  ['Simulador', 'Simulator', 'Simulador', '模拟器'],
  ['Aposentadoria', 'Retirement', 'Jubilación', '退休'],
  ['Jornada', 'Journey', 'Recorrido', '财务路径'],
  ['Relatórios', 'Reports', 'Informes', '报表'],
  ['Retrospectiva', 'Year in review', 'Retrospectiva', '年度回顾'],
  ['Mercado', 'Markets', 'Mercados', '市场'],
  ['Documentos', 'Documents', 'Documentos', '文档'],
  ['Manual', 'Manual', 'Manual', '手册'],
  ['Configurações', 'Settings', 'Configuración', '设置'],
  ['Bem-vindo', 'Welcome', 'Bienvenido', '欢迎'],
  ['Riscos e oportunidades financeiras', 'Financial risks and opportunities', 'Riesgos y oportunidades financieras', '财务风险与机会'],
  ['Análise educacional com dados minimizados', 'Educational analysis with minimized data', 'Análisis educativo con datos minimizados', '使用最少数据的教育分析'],
  ['Situação financeira e próximos passos', 'Financial situation and next steps', 'Situación financiera y próximos pasos', '财务状况与后续步骤'],
  ['Sugestão de uso da renda do mês', 'Suggested use of monthly income', 'Sugerencia de uso de los ingresos mensuales', '月收入使用建议'],
  ['Pontuação de saúde financeira', 'Financial health score', 'Puntuación de salud financiera', '财务健康评分'],
  ['Checklist financeiro da semana', 'Weekly financial checklist', 'Lista financiera semanal', '每周财务清单'],
  ['Prioridades financeiras sugeridas', 'Suggested financial priorities', 'Prioridades financieras sugeridas', '建议的财务优先级'],
  ['Últimos 6 meses', 'Last 6 months', 'Últimos 6 meses', '过去 6 个月'],
  ['Personalize o Fina de acordo com suas preferências', 'Customize Fina to your preferences', 'Personaliza Fina según tus preferencias', '根据您的偏好自定义 Fina'],
  ['Vencimentos e pagamentos pendentes', 'Due dates and pending payments', 'Vencimientos y pagos pendientes', '到期日与待付款项'],
  ['Vencimentos e recebimentos pendentes', 'Due dates and pending receipts', 'Vencimientos y cobros pendientes', '到期日与待收款项'],
  ['Histórico e auditoria de pagamentos', 'Payment history and audit', 'Historial y auditoría de pagos', '付款历史与审计'],
  ['Assinaturas e compromissos recorrentes', 'Subscriptions and recurring commitments', 'Suscripciones y compromisos recurrentes', '订阅与定期支出'],
  ['Salários, mensalidades e recebimentos recorrentes', 'Salaries, fees and recurring income', 'Salarios, cuotas e ingresos recurrentes', '工资、会费与定期收入'],
  ['Vencimentos e lançamentos por dia', 'Due dates and transactions by day', 'Vencimientos y movimientos por día', '每日到期日与交易'],
  ['Imóveis, veículos e outros bens', 'Real estate, vehicles and other assets', 'Inmuebles, vehículos y otros bienes', '房产、车辆与其他资产'],
  ['Carteira e rendimentos', 'Portfolio and returns', 'Cartera y rendimientos', '投资组合与收益'],
  ['Projeção de patrimônio futuro', 'Future net worth projection', 'Proyección de patrimonio futuro', '未来净资产预测'],
  ['Simulador de renda na aposentadoria', 'Retirement income simulator', 'Simulador de ingresos de jubilación', '退休收入模拟器'],
  ['Passos guiados para evoluir financeiramente', 'Guided steps for financial progress', 'Pasos guiados para progresar financieramente', '引导式财务成长步骤'],
  ['Planejamento financeiro', 'Financial planning', 'Planificación financiera', '财务规划'],
  ['Empréstimos e financiamentos', 'Loans and financing', 'Préstamos y financiación', '贷款与融资'],
  ['Estratégias para quitar dívidas', 'Strategies to pay off debt', 'Estrategias para saldar deudas', '债务清偿策略'],
  ['Prioridades e propostas para dívidas', 'Debt priorities and proposals', 'Prioridades y propuestas para deudas', '债务优先级与方案'],
  ['Proteção para emergências', 'Protection for emergencies', 'Protección para emergencias', '紧急保障'],
  ['Câmbio, bolsas e indicadores', 'Currencies, exchanges and indicators', 'Divisas, bolsas e indicadores', '汇率、股市与指标'],
  ['Instituições, contas e conexões ativas', 'Institutions, accounts and active connections', 'Instituciones, cuentas y conexiones activas', '机构、账户与活动连接'],
  ['Informe de rendimentos para declaração', 'Income report for tax filing', 'Informe de ingresos para la declaración', '报税收入报告'],
  ['Livro-caixa e controle de DAS', 'Cash book and DAS tracking', 'Libro de caja y control de DAS', '现金账簿与 DAS 管理'],
  ['Membros, rateio de despesas e quem deve quem', 'Members, expense splitting and balances', 'Miembros, reparto de gastos y saldos', '成员、费用分摊与余额'],
  ['Seu ano financeiro resumido', 'Your financial year in review', 'Resumen de tu año financiero', '您的年度财务回顾'],
  ['Guia de uso do Fina', 'Fina user guide', 'Guía de uso de Fina', 'Fina 使用指南'],
  ['Comprovantes e arquivos financeiros locais', 'Receipts and local financial files', 'Comprobantes y archivos financieros locales', '收据与本地财务文件'],
  ['Erro ao carregar página:', 'Could not load page:', 'No se pudo cargar la página:', '无法加载页面：'],
  ['FINANÇAS PESSOAIS', 'PERSONAL FINANCE', 'FINANZAS PERSONALES', '个人财务'],
  ['Banco de dados protegido', 'Protected database', 'Base de datos protegida', '受保护的数据库'],
  ['Digite a senha mestre para destravar seus dados financeiros.', 'Enter the master password to unlock your financial data.', 'Introduce la contraseña maestra para desbloquear tus datos financieros.', '请输入主密码以解锁您的财务数据。'],
  ['Senha mestre', 'Master password', 'Contraseña maestra', '主密码'],
  ['Desbloquear', 'Unlock', 'Desbloquear', '解锁'],
  ['Fina — Desbloquear', 'Fina — Unlock', 'Fina — Desbloquear', 'Fina — 解锁'],
  ['Senha incorreta. Tente novamente.', 'Incorrect password. Try again.', 'Contraseña incorrecta. Inténtalo de nuevo.', '密码错误，请重试。'],
  ['Aviso', 'Notice', 'Aviso', '提示'],
  ['Confirmar', 'Confirm', 'Confirmar', '确认'],
  ['Cancelar', 'Cancel', 'Cancelar', '取消'],
  ['Salvar', 'Save', 'Guardar', '保存'],
  ['Cofre local', 'Local vault', 'Bóveda local', '本地保险库'],
  ['Seus comprovantes ficam no computador e não são enviados a terceiros.', 'Your receipts stay on this computer and are not sent to third parties.', 'Tus comprobantes permanecen en este equipo y no se envían a terceros.', '您的凭证保存在此电脑上，不会发送给第三方。'],
  ['Importar documentos', 'Import documents', 'Importar documentos', '导入文档'],
  ['{count} documento', '{count} document', '{count} documento', '{count} 个文档'],
  ['{count} documentos', '{count} documents', '{count} documentos', '{count} 个文档'],
  ['Nenhum documento', 'No documents', 'No hay documentos', '暂无文档'],
  ['Importe um comprovante para começar.', 'Import a receipt to get started.', 'Importa un comprobante para comenzar.', '导入凭证以开始使用。'],
  ['Abrir', 'Open', 'Abrir', '打开'],
  ['Remover', 'Remove', 'Eliminar', '移除'],
  ['Remover este documento do cofre?', 'Remove this document from the vault?', '¿Eliminar este documento de la bóveda?', '从保险库中移除此文档？'],
];

const supported: readonly AppLocale[] = ['en-US', 'pt-BR', 'es-ES', 'zh-CN'];

export function resolveLocale(candidates: readonly string[]): AppLocale {
  for (const candidate of candidates) {
    const normalized = candidate.replace('_', '-').toLowerCase();
    if (normalized.startsWith('pt')) return 'pt-BR';
    if (normalized.startsWith('es')) return 'es-ES';
    if (normalized.startsWith('zh')) return 'zh-CN';
    if (normalized.startsWith('en')) return 'en-US';
  }
  return 'en-US';
}

const browserLocales = typeof navigator === 'undefined'
  ? []
  : (navigator.languages.length ? navigator.languages : [navigator.language]);
const operatingSystemLocale = typeof location === 'undefined'
  ? null
  : new URLSearchParams(location.search).get('locale');
export const locale: AppLocale = resolveLocale([
  ...(operatingSystemLocale ? [operatingSystemLocale] : []),
  ...browserLocales,
]);
export function supportsPix(target: AppLocale = locale): boolean {
  return target === 'pt-BR';
}
export const isBrazilLocale = supportsPix();
const index = new Map(entries.map(row => [row[0], row]));
type AutoMessage = Record<AppLocale, string>;
for (const [source, translations] of Object.entries(autoCatalog as Record<string, AutoMessage>)) {
  if (!index.has(source)) index.set(source, [
    translations['pt-BR'], translations['en-US'], translations['es-ES'], translations['zh-CN'],
  ]);
}
const renderedTemplates = [...index.entries()]
  .filter(([source]) => source.includes('{value}'))
  .map(([source]) => ({ source, regex: new RegExp(`^${source.split('{value}').map(escapeRegex).join('(.+?)')}$`) }));
const keyedSources = {
  'documents.vault.title': 'Cofre local',
  'documents.vault.description': 'Seus comprovantes ficam no computador e não são enviados a terceiros.',
  'documents.import': 'Importar documentos',
  'documents.count.one': '{count} documento',
  'documents.count.other': '{count} documentos',
  'documents.empty.title': 'Nenhum documento',
  'documents.empty.description': 'Importe um comprovante para começar.',
  'documents.open': 'Abrir',
  'documents.remove': 'Remover',
  'documents.remove.confirm': 'Remover este documento do cofre?',
} as const;
export type MessageKey = keyof typeof keyedSources;
export const messageKeys = Object.freeze(Object.keys(keyedSources) as MessageKey[]);

export function assertCatalogIntegrity(): void {
  if (new Set(entries.map(row => row[0])).size !== entries.length) throw new Error('duplicate i18n source key');
  for (const row of entries) {
    if (row.length !== 4 || row.some(value => !value.trim())) throw new Error(`incomplete i18n entry: ${row[0]}`);
  }
  for (const [key, source] of Object.entries(keyedSources)) {
    if (!index.has(source)) throw new Error(`i18n key references missing message: ${key}`);
  }
  for (const [source, translations] of Object.entries(autoCatalog as Record<string, AutoMessage>)) {
    if (!source.trim() || supported.some(target => !translations[target]?.trim())) {
      throw new Error(`incomplete generated i18n entry: ${source}`);
    }
  }
  if (!supported.includes(locale)) throw new Error(`unsupported resolved locale: ${locale}`);
}

export function t(source: string, values: I18nValues = {}): string {
  return translateFor(locale, source, values);
}

export function tk(key: MessageKey, values: I18nValues = {}): string {
  return translateKeyFor(locale, key, values);
}

export function translateKeyFor(target: AppLocale, key: MessageKey, values: I18nValues = {}): string {
  const source = keyedSources[key];
  if (!source) throw new Error(`unknown i18n key: ${key}`);
  const translated = translateFor(target, source, values);
  if (!translated || translated === key) throw new Error(`i18n key rendered as text: ${key}`);
  return translated;
}

export function tpk(one: MessageKey, other: MessageKey, count: number): string {
  const key = new Intl.PluralRules(locale).select(count) === 'one' ? one : other;
  return tk(key, { count });
}

/** Translate a catalogued message and interpolate named values.
 * Values are escaped by default so the result is safe to insert in HTML.
 */
export function translateFor(target: AppLocale, source: string, values: I18nValues = {}, escape = true): string {
  const message = lookupFor(target, source);
  return message.replace(/\{([A-Za-z][\w]*)\}/g, (_match, name: string) => {
    const value = values[name];
    if (value == null) throw new Error(`missing i18n interpolation value: ${name}`);
    return escape ? escapeHtml(String(value)) : String(value);
  });
}

function lookupFor(target: AppLocale, source: string): string {
  const row = index.get(source);
  // Missing keys have one deterministic fallback. The coverage gate makes this
  // path a development-time error; production never falls back to Portuguese.
  return !row ? source : target === 'pt-BR' ? row[0]
    : target === 'es-ES' ? row[2] : target === 'zh-CN' ? row[3] : row[1];
}

export function tp(
  singular: string,
  plural: string,
  count: number,
  values: I18nValues = {},
): string {
  const form = new Intl.PluralRules(locale).select(count) === 'one' ? singular : plural;
  return translateFor(locale, form, { ...values, count });
}

/** Explicit translation for legacy template literals while they receive
 * semantic keys. Each value replaces one {value} marker and is HTML-escaped.
 */
export function td(source: string, values: readonly (string | number)[]): string {
  let message = lookupFor(locale, source);
  for (const value of values) message = message.replace('{value}', escapeHtml(String(value)));
  if (message.includes('{value}')) throw new Error(`missing i18n template values: ${source}`);
  return message;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[char]!);
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatDate(value: Date | number | string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale, options).format(new Date(value));
}

function translateTextNode(node: Text): void {
  const value = node.data;
  const trimmed = value.trim();
  if (!trimmed) return;
  const translated = translateRendered(trimmed);
  if (translated !== trimmed) node.data = value.replace(trimmed, translated);
}

function translateTree(root: Node): void {
  if (root instanceof Text) translateTextNode(root);
  if (!(root instanceof Element || root instanceof Document)) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) translateTextNode(walker.currentNode as Text);
  if (root instanceof Element) translateAttributes(root);
  root.querySelectorAll?.('[placeholder],[title],[aria-label]').forEach(translateAttributes);
}

function translateAttributes(element: Element): void {
  for (const attribute of ['placeholder', 'title', 'aria-label']) {
    const value = element.getAttribute(attribute);
    if (value) element.setAttribute(attribute, translateRendered(value));
  }
}

function translateRendered(value: string): string {
  if (index.has(value)) return t(value);
  for (const template of renderedTemplates) {
    const match = value.match(template.regex);
    if (!match) continue;
    let translated = lookupFor(locale, template.source);
    for (const captured of match.slice(1)) translated = translated.replace('{value}', captured);
    return translated;
  }
  return value;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function initializeI18n(): void {
  assertCatalogIntegrity();
  document.documentElement.lang = locale;
  document.title = t(document.title);
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(element => {
    element.textContent = t(element.dataset.i18n!);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-placeholder]').forEach(element => {
    element.setAttribute('placeholder', t(element.dataset.i18nPlaceholder!));
  });
  translateTree(document);
  new MutationObserver(records => {
    for (const record of records) record.addedNodes.forEach(translateTree);
  }).observe(document.documentElement, { childList: true, subtree: true });
}
