import { ipcMain } from 'electron';
import type { MarketQuote } from '../../shared/types';

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 min

interface CacheEntry { quotes: MarketQuote[]; fetched_at: number }
let cache: CacheEntry | null = null;

// AwesomeAPI: cotações de câmbio e cripto (sem API key)
async function fetchAwesome(pairs: string[]): Promise<Record<string, { bid: string; pctChange: string }>> {
  const url = `https://economia.awesomeapi.com.br/json/last/${pairs.join(',')}`;
  const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`AwesomeAPI ${res.status}`);
  return res.json() as Promise<Record<string, { bid: string; pctChange: string }>>;
}

// brapi.dev: índices de bolsa (sem API key, rate-limited)
async function fetchBrapi(tickers: string[]): Promise<{ results: { symbol: string; regularMarketPrice: number; regularMarketChangePercent: number }[] }> {
  const url = `https://brapi.dev/api/quote/${tickers.join(',')}?fundamental=false`;
  const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`brapi ${res.status}`);
  return res.json() as Promise<{ results: { symbol: string; regularMarketPrice: number; regularMarketChangePercent: number }[] }>;
}

// BCB: taxa Selic
async function fetchSelic(): Promise<number> {
  const url = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.11/dados/ultimos/1?formato=json';
  const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`BCB ${res.status}`);
  const data = await res.json() as { valor: string }[];
  return parseFloat(data[0]?.valor ?? '0');
}

async function fetchAll(): Promise<MarketQuote[]> {
  const quotes: MarketQuote[] = [];
  const now = new Date().toISOString();

  // Câmbio e cripto
  try {
    const fx = await fetchAwesome(['USD-BRL', 'EUR-BRL', 'BTC-BRL']);
    const map: [string, string, string][] = [
      ['USDBRL', 'Dólar', 'BRL'],
      ['EURBRL', 'Euro',  'BRL'],
      ['BTCBRL', 'Bitcoin', 'BRL'],
    ];
    for (const [key, label, currency] of map) {
      const d = fx[key];
      if (d) quotes.push({ symbol: key, label, price: parseFloat(d.bid), change_pct: parseFloat(d.pctChange), currency, updated_at: now, stale: false });
    }
  } catch { /* continua offline */ }

  // Bolsas
  try {
    const stocks = await fetchBrapi(['^BVSP', '^GSPC', '^IXIC']);
    const labelMap: Record<string, string> = { '^BVSP': 'Ibovespa', '^GSPC': 'S&P 500', '^IXIC': 'Nasdaq' };
    for (const r of stocks.results) {
      quotes.push({ symbol: r.symbol, label: labelMap[r.symbol] ?? r.symbol, price: r.regularMarketPrice, change_pct: r.regularMarketChangePercent, currency: 'BRL', updated_at: now, stale: false });
    }
  } catch { /* continua offline */ }

  // Selic
  try {
    const selic = await fetchSelic();
    quotes.push({ symbol: 'SELIC', label: 'Selic (% a.a.)', price: selic, change_pct: 0, currency: '%', updated_at: now, stale: false });
  } catch { /* continua offline */ }

  return quotes;
}

// Cotação de USD/EUR para BRL, reaproveitando o mesmo cache do painel de
// Mercado (só busca de novo se o cache tiver expirado). Usado para converter
// o saldo de contas em moeda estrangeira.
export async function getExchangeRate(currency: 'USD' | 'EUR'): Promise<number | null> {
  const symbol = `${currency}BRL`;
  const isFresh = cache && Date.now() - cache.fetched_at < CACHE_TTL_MS;

  if (!isFresh) {
    try {
      const quotes = await fetchAll();
      if (quotes.length > 0) cache = { quotes, fetched_at: Date.now() };
    } catch { /* usa o cache existente, se houver */ }
  }

  return cache?.quotes.find(q => q.symbol === symbol)?.price ?? null;
}

export function registerMarketHandlers(): void {
  ipcMain.handle('market:getQuotes', async (): Promise<MarketQuote[]> => {
    const now = Date.now();

    if (cache && now - cache.fetched_at < CACHE_TTL_MS) {
      return cache.quotes;
    }

    try {
      const quotes = await fetchAll();
      if (quotes.length > 0) {
        cache = { quotes, fetched_at: now };
        return quotes;
      }
    } catch { /* rede indisponível */ }

    // fallback: retorna cache stale se existir
    if (cache) {
      return cache.quotes.map(q => ({ ...q, stale: true }));
    }

    return [];
  });

  ipcMain.handle('market:refresh', async (): Promise<MarketQuote[]> => {
    cache = null;
    const quotes = await fetchAll();
    if (quotes.length > 0) cache = { quotes, fetched_at: Date.now() };
    return quotes;
  });
}
