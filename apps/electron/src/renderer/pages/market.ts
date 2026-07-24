import { invoke } from '../api';
import { setTopbarActions } from '../components/topbar';
import type { MarketQuote } from '../../shared/types';

const SYMBOL_ICONS: Record<string, string> = {
  USDBRL:  'ti-currency-dollar',
  EURBRL:  'ti-currency-euro',
  BTCBRL:  'ti-currency-bitcoin',
  '^BVSP': 'ti-trending-up',
  '^GSPC': 'ti-chart-line',
  '^IXIC': 'ti-chart-line',
  SELIC:   'ti-percentage',
};

export async function render(el: HTMLElement): Promise<void> {
  let quotes: MarketQuote[] = [];
  let loading = false;

  setTopbarActions(`
    <button class="btn btn-secondary" id="btn-refresh-market">
      <i class="ti ti-refresh"></i> Atualizar
    </button>
  `);

  document.getElementById('btn-refresh-market')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-refresh-market') as HTMLButtonElement;
    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-loader ti-spin"></i> Atualizando...';
    quotes = await invoke<MarketQuote[]>('market:refresh');
    await renderPage();
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-refresh"></i> Atualizar';
  });

  async function renderPage(): Promise<void> {
    if (loading) {
      el.innerHTML = '<div class="loading"><i class="ti ti-loader-2"></i> Buscando cotações...</div>';
      return;
    }

    if (quotes.length === 0) {
      el.innerHTML = `
        <div class="empty">
          <i class="ti ti-wifi-off" style="font-size:2.5rem;color:var(--text-4)"></i>
          <div class="empty-title">Cotações indisponíveis</div>
          <div class="empty-desc">Verifique sua conexão com a internet e tente novamente.</div>
          <button class="btn btn-primary" id="btn-retry">
            <i class="ti ti-refresh"></i> Tentar novamente
          </button>
        </div>`;
      el.querySelector('#btn-retry')?.addEventListener('click', fetchAndRender);
      return;
    }

    const stale = quotes.some(q => q.stale);
    const lastUpdate = quotes[0]?.updated_at
      ? new Date(quotes[0].updated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : null;

    el.innerHTML = `
      ${stale ? `
        <div style="background:rgba(239,159,39,.1);border:1px solid rgba(239,159,39,.25);border-radius:8px;padding:10px 14px;font-size:0.82rem;color:var(--warning);margin-bottom:16px">
          <i class="ti ti-wifi-off"></i> Sem conexão — exibindo última cotação disponível.
        </div>` : ''}

      ${lastUpdate ? `<div style="font-size:0.75rem;color:var(--text-3);margin-bottom:16px">Última atualização: ${lastUpdate} · Cache de 15 min</div>` : ''}

      <div class="grid-3" style="gap:12px;margin-bottom:24px">
        ${quotes.map(q => {
          const icon   = SYMBOL_ICONS[q.symbol] ?? 'ti-chart-line';
          const up     = q.change_pct >= 0;
          const noChange = q.change_pct === 0;
          const color  = noChange ? 'var(--text-2)' : up ? 'var(--accent)' : 'var(--danger)';
          const arrow  = noChange ? '' : up ? '▲' : '▼';

          const priceStr = q.currency === '%'
            ? `${q.price.toFixed(2)}%`
            : q.currency === 'BRL'
              ? q.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
              : q.price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

          return `<div class="stat-card" style="display:flex;flex-direction:column;gap:8px">
            <div style="display:flex;align-items:center;gap:8px">
              <i class="ti ${icon}" style="color:${color};font-size:1.1rem"></i>
              <span style="font-size:0.8rem;color:var(--text-2)">${esc(q.label)}</span>
              ${q.stale ? `<span style="font-size:0.68rem;color:var(--warning);margin-left:auto">offline</span>` : ''}
            </div>
            <div style="font-size:1.4rem;font-weight:700">${priceStr}</div>
            ${!noChange ? `
              <div style="font-size:0.8rem;color:${color}">
                ${arrow} ${Math.abs(q.change_pct).toFixed(2)}% hoje
              </div>` : ''}
          </div>`;
        }).join('')}
      </div>

      <div class="card">
        <div class="card-header">Tabela de cotações</div>
        <div class="card-hr"></div>
        <table class="table">
          <thead>
            <tr>
              <th>INDICADOR</th>
              <th style="text-align:right">COTAÇÃO</th>
              <th style="text-align:right">VAR. DIA</th>
            </tr>
          </thead>
          <tbody>
            ${quotes.map(q => {
              const up    = q.change_pct > 0;
              const noChg = q.change_pct === 0;
              const color = noChg ? 'var(--text-2)' : up ? 'var(--accent)' : 'var(--danger)';
              const priceStr = q.currency === '%'
                ? `${q.price.toFixed(2)}% a.a.`
                : q.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
              return `<tr>
                <td>
                  <div style="font-weight:500">${esc(q.label)}</div>
                  <div style="font-size:0.73rem;color:var(--text-3)">${q.symbol}</div>
                </td>
                <td style="text-align:right;font-weight:500">${priceStr}</td>
                <td style="text-align:right;color:${color}">
                  ${noChg ? '—' : (up ? '+' : '') + q.change_pct.toFixed(2) + '%'}
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  async function fetchAndRender(): Promise<void> {
    loading = true;
    await renderPage();
    quotes = await invoke<MarketQuote[]>('market:getQuotes');
    loading = false;
    await renderPage();
  }

  await fetchAndRender();
}

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
