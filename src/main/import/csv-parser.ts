import type { ImportPreviewRow } from '../../shared/types';

// Heurísticas para detectar colunas por cabeçalho
const DATE_COLS        = ['data', 'date', 'dt', 'data lancamento', 'data lançamento'];
const DESC_COLS        = ['descricao', 'descrição', 'historico', 'histórico', 'memo', 'description', 'estabelecimento'];
const AMOUNT_COLS      = ['valor', 'amount', 'value', 'quantia', 'vlr'];
const CREDIT_COLS      = ['credito', 'crédito', 'entrada', 'credit', 'receita'];
const DEBIT_COLS       = ['debito', 'débito', 'saida', 'saída', 'debit', 'despesa'];

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function parseDate(raw: string): string {
  // DD/MM/YYYY ou YYYY-MM-DD ou DD-MM-YYYY
  const clean = raw.trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(clean)) {
    const [d, m, y] = clean.split('/');
    return `${y}-${m}-${d}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  if (/^\d{2}-\d{2}-\d{4}$/.test(clean)) {
    const [d, m, y] = clean.split('-');
    return `${y}-${m}-${d}`;
  }
  return new Date().toISOString().slice(0, 10);
}

function parseMoney(raw: string): number {
  // "1.234,56" ou "1234.56" ou "-1.234,56"
  const clean = raw.replace(/\s/g, '').replace(/^-/, '');
  if (clean.includes(',') && clean.includes('.')) {
    // último separador é decimal?
    const lastComma = clean.lastIndexOf(',');
    const lastDot   = clean.lastIndexOf('.');
    if (lastComma > lastDot) {
      return parseFloat(clean.replace(/\./g, '').replace(',', '.'));
    }
    return parseFloat(clean.replace(/,/g, ''));
  }
  if (clean.includes(',')) return parseFloat(clean.replace(',', '.'));
  return parseFloat(clean) || 0;
}

function findColIndex(headers: string[], candidates: string[]): number {
  return headers.findIndex(h => candidates.includes(normalize(h)));
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuote = false;
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if ((ch === ',' || ch === ';') && !inQuote) { result.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  result.push(cur.trim());
  return result;
}

export function parseCSV(content: string): ImportPreviewRow[] {
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const headers  = splitCsvLine(lines[0]);

  const iDate   = findColIndex(headers, DATE_COLS);
  const iDesc   = findColIndex(headers, DESC_COLS);
  const iAmount = findColIndex(headers, AMOUNT_COLS);
  const iCredit = findColIndex(headers, CREDIT_COLS);
  const iDebit  = findColIndex(headers, DEBIT_COLS);

  const rows: ImportPreviewRow[] = [];

  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    if (cols.length < 2) continue;

    const rawDate = iDate >= 0 ? (cols[iDate] ?? '') : '';
    const desc    = iDesc >= 0 ? (cols[iDesc] ?? '') : cols[1] ?? '';

    let amount = 0;
    let type: 'income' | 'expense' = 'expense';

    if (iAmount >= 0) {
      const raw = cols[iAmount] ?? '0';
      const negative = raw.trim().startsWith('-');
      amount = Math.abs(parseMoney(raw));
      type   = negative ? 'expense' : 'income';
    } else if (iCredit >= 0 || iDebit >= 0) {
      const credit = iCredit >= 0 ? parseMoney(cols[iCredit] ?? '0') : 0;
      const debit  = iDebit  >= 0 ? parseMoney(cols[iDebit]  ?? '0') : 0;
      if (credit > 0)      { amount = credit; type = 'income';  }
      else if (debit > 0)  { amount = debit;  type = 'expense'; }
    }

    if (!amount) continue;

    rows.push({
      date: parseDate(rawDate),
      description: desc,
      amount,
      type,
      fitid: null,
      duplicate: false,
    });
  }

  return rows;
}
