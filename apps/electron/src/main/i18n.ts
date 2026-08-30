import { app } from 'electron';
import type { AppLocale } from '../renderer/i18n';
import autoCatalog from '../renderer/i18n-auto.json';

export function resolveMainLocale(): AppLocale {
  // Desktop launchers and sandbox wrappers may force LC_ALL=C even though the
  // graphical session has a real language in LANGUAGE/LANG. Prefer the
  // session language, then Electron's OS locale, and only then LC_* values.
  const candidates = [
    ...(process.env.LANGUAGE ?? '').split(':'),
    process.env.LANG,
    ...app.getPreferredSystemLanguages(),
    process.env.LC_MESSAGES,
    process.env.LC_ALL,
    app.getLocale(),
  ];
  for (const candidate of candidates) {
    const normalized = (candidate ?? '').replace('_', '-').toLowerCase();
    if (normalized.startsWith('pt')) return 'pt-BR';
    if (normalized.startsWith('es')) return 'es-ES';
    if (normalized.startsWith('zh')) return 'zh-CN';
    if (normalized.startsWith('en')) return 'en-US';
  }
  return 'en-US';
}

export function formatMainNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(resolveMainLocale(), options).format(value);
}

export function formatMainDate(value: Date | number | string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(resolveMainLocale(), options).format(new Date(value));
}

type AutoMessage = Record<AppLocale, string>;
const messages = autoCatalog as Record<string, AutoMessage>;

// These labels are seeded by the database. User-created names and imported
// descriptions are intentionally absent: only Fina-owned defaults may be
// translated when they reach the UI, notifications, reports or exports.
export const defaultDatabaseLabels = Object.freeze([
  { label: 'Salário' },
  { label: 'Freelance' },
  { label: 'Alimentação' },
  { label: 'Transporte' },
  { label: 'Moradia' },
  { label: 'Saúde' },
  { label: 'Lazer' },
  { label: 'Educação' },
  { label: 'Conta Corrente' },
  { label: 'Carteira' },
]);
const templates = Object.entries(messages)
  .filter(([source]) => source.includes('{value}'))
  .map(([source, translations]) => ({
    translations,
    regex: new RegExp(`^${source.split('{value}').map(escapeRegex).join('(.+?)')}$`),
  }));

export function localizeMainText(value: string): string {
  const target = resolveMainLocale();
  const exact = messages[value]?.[target];
  if (exact) return exact;
  for (const template of templates) {
    const match = value.match(template.regex);
    if (!match) continue;
    let translated = template.translations[target];
    for (const captured of match.slice(1)) translated = translated.replace('{value}', captured);
    return translated;
  }
  return value;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function localizeDialogOptions<T extends {
  title?: string;
  message?: string;
  detail?: string;
  buttonLabel?: string;
  buttons?: string[];
  filters?: { name: string; extensions: string[] }[];
}>(options: T): T {
  return {
    ...options,
    ...(options.title && { title: localizeMainText(options.title) }),
    ...(options.message && { message: localizeMainText(options.message) }),
    ...(options.detail && { detail: localizeMainText(options.detail) }),
    ...(options.buttonLabel && { buttonLabel: localizeMainText(options.buttonLabel) }),
    ...(options.buttons && { buttons: options.buttons.map(localizeMainText) }),
    ...(options.filters && { filters: options.filters.map(filter => ({ ...filter, name: localizeMainText(filter.name) })) }),
  };
}

export function localizeMainHtml(html: string): string {
  const protectedBlocks: string[] = [];
  let output = html.replace(/<(?:style|script)\b[\s\S]*?<\/(?:style|script)>/gi, block => {
    protectedBlocks.push(block);
    return `__FINA_PROTECTED_${protectedBlocks.length - 1}__`;
  });
  output = output.replace(/\b(title|placeholder|aria-label)="([^"]+)"/gi, (_all, name: string, value: string) =>
    `${name}="${localizeMainText(value)}"`);
  output = output.replace(/>([^<]+)</g, (all, value: string) => {
    const leading = value.match(/^\s*/)?.[0] ?? '';
    const trailing = value.match(/\s*$/)?.[0] ?? '';
    const text = value.trim();
    return text ? `>${leading}${localizeMainText(text)}${trailing}<` : all;
  });
  return output.replace(/__FINA_PROTECTED_(\d+)__/g, (_all, index: string) => protectedBlocks[Number(index)]);
}
