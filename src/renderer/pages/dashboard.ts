import { invoke } from '../api';
import { formatCurrency, formatDate, getDaysUntilDue } from '../../shared/utils';
import { createDonut, createAreaChart } from '../components/charts';
import type { Account, Bill, TransactionWithDetails, MonthlySummary, ForecastPoint, InvestmentSummary, Goal, MarketQuote } from '../../shared/types';

function monthLabel(month: number, year: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
}

export async function render(el: HTMLElement): Promise<void> {
  const now = new Date();
  let fromMonth = now.getMonth() + 1;
  let fromYear  = now.getFullYear();
  let toMonth   = now.getMonth() + 1;
  let toYear    = now.getFullYear();
  let firstLoad = true;

  async function load(): Promise<void> {
    if (firstLoad) {
      el.innerHTML = '<div class="loading"><i class="ti ti-loader-2"></i> Carregando...</div>';
      firstLoad = false;
    }

    const dateFrom = `${fromYear}-${String(fromMonth).padStart(2, '0')}-01`;
    const lastDay  = new Date(toYear, toMonth, 0).getDate();
    const dateTo   = `${toYear}-${String(toMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const periodLabel = (fromMonth === toMonth && fromYear === toYear)
      ? monthLabel(fromMonth, fromYear)
      : `${monthLabel(fromMonth, fromYear)} – ${monthLabel(toMonth, toYear)}`;

    const [accounts, summary, recent, bills, expenses, forecast, invSummary, assetSummary, goals, debtSummary, quotes] = await Promise.all([
      invoke<Account[]>('accounts:list'),
      invoke<MonthlySummary>('transactions:getSummaryRange', { dateFrom, dateTo }),
      invoke<TransactionWithDetails[]>('transactions:list', { dateFrom, dateTo, limit: 5 }),
      invoke<Bill[]>('bills:getUpcoming', 30),
      invoke<{ name: string; color: string; total: number }[]>('transactions:getExpensesByCategoryRange', { dateFrom, dateTo }),
      invoke<ForecastPoint[]>('forecast:get', 30),
      invoke<InvestmentSummary>('investments:getSummary'),
      invoke<{ total: number }>('assets:getSummary'),
      invoke<Goal[]>('goals:list'),
      invoke<{ total_debt: number }>('debts:getSummary'),
      invoke<MarketQuote[]>('market:getQuotes'),
    ]);

    const totalBalance  = accounts.reduce((s, a) => s + a.balance, 0);
    const netWorth       = totalBalance + invSummary.total_current + (assetSummary.total ?? 0) - (debtSummary.total_debt ?? 0);
    const donutSegs      = expenses.map(e => ({ value: e.total, color: e.color, label: e.name }));
    const urgentGoals    = goals.filter(g => {
      if (!g.target_date) return false;
      const days = Math.ceil((new Date(g.target_date + 'T12:00').getTime() - Date.now()) / 86400_000);
      return days <= 60 && g.current_amount < g.target_amount;
    }).slice(0, 3);

    el.innerHTML = `
    <!-- Filtro de período -->
    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:12px;padding:12px 20px;flex-wrap:wrap">
        <span style="font-size:0.8rem;color:var(--text-2)">Período</span>
        <input class="form-ctrl" id="dash-from" type="month" value="${fromYear}-${String(fromMonth).padStart(2, '0')}" style="width:auto">
        <span style="color:var(--text-3)">até</span>
        <input class="form-ctrl" id="dash-to" type="month" value="${toYear}-${String(toMonth).padStart(2, '0')}" style="width:auto">
        <button class="btn btn-ghost btn-sm" id="dash-reset">Mês atual</button>
      </div>
    </div>

    <!-- Stat cards -->
    <div class="grid-3" style="margin-bottom:20px">
      <div class="stat-card">
        <div class="stat-label">Saldo em contas</div>
        <div class="stat-value">${formatCurrency(totalBalance)}</div>
        <div class="stat-sub">${accounts.length} conta${accounts.length !== 1 ? 's' : ''} · patrimônio líquido: <strong>${formatCurrency(netWorth)}</strong></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Receitas (${periodLabel})</div>
        <div class="stat-value stat-green">${formatCurrency(summary.income)}</div>
        <div class="stat-sub">↑ período selecionado</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Despesas (${periodLabel})</div>
        <div class="stat-value stat-red">${formatCurrency(summary.expense)}</div>
        <div class="stat-sub">Saldo: <strong style="color:${summary.balance >= 0 ? 'var(--accent)' : 'var(--danger)'}">${formatCurrency(summary.balance)}</strong></div>
      </div>
    </div>

    <!-- Transactions + Donut -->
    <div class="grid-2" style="grid-template-columns:1.6fr 1fr;margin-bottom:20px">
      <!-- Recent transactions -->
      <div class="card">
        <div class="card-header">
          <span>Últimas transações</span>
          <a href="#transactions" style="font-size:12px;color:var(--accent)">Ver todas</a>
        </div>
        <div class="card-hr"></div>
        ${recent.length === 0
          ? '<div class="empty" style="padding:32px"><i class="ti ti-receipt-off"></i><div class="empty-title">Nenhuma transação no período</div></div>'
          : `<table class="table">
              <tbody>
                ${recent.map(t => `
                  <tr>
                    <td>
                      <div style="display:flex;align-items:center;gap:10px">
                        <div class="cat-dot" style="background:${hexWithAlpha(t.category_color, 0.15)}">
                          <i class="ti ${t.category_icon}" style="color:${t.category_color};font-size:14px"></i>
                        </div>
                        <div>
                          <div class="desc-main">${esc(t.description)}</div>
                          <div class="desc-sub">${esc(t.account_name)} · ${formatDate(t.date)}</div>
                        </div>
                      </div>
                    </td>
                    <td style="text-align:right;font-weight:500;color:${t.type === 'income' ? 'var(--accent)' : 'var(--danger)'}">
                      ${t.type === 'income' ? '+' : '-'}${formatCurrency(t.amount)}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>`
        }
      </div>

      <!-- Donut chart -->
      <div class="card">
        <div class="card-header"><span>Gastos por categoria</span></div>
        <div class="card-hr"></div>
        <div class="card-body" style="padding:16px 20px">
          ${donutSegs.length === 0
            ? '<div class="empty" style="padding:24px"><i class="ti ti-chart-pie-off"></i><div class="empty-title">Sem despesas</div></div>'
            : `<div class="chart-container">
                ${createDonut(donutSegs, 150,
                  periodLabel,
                  formatCurrency(summary.expense))}
                <div class="chart-legend" style="max-width:140px">
                  ${donutSegs.slice(0, 5).map(s => `
                    <div class="legend-item">
                      <div class="legend-dot" style="background:${s.color}"></div>
                      <span class="legend-name">${esc(s.label)}</span>
                      <span class="legend-val">${formatCurrency(s.value)}</span>
                    </div>
                  `).join('')}
                </div>
              </div>`
          }
        </div>
      </div>
    </div>

    <!-- Forecast -->
    <div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <span>Previsão de saldo — próximos 30 dias</span>
        ${forecast.length > 0 && forecast[forecast.length - 1].balance < 0
          ? `<span style="color:var(--danger);font-size:0.8rem"><i class="ti ti-alert-triangle"></i> Saldo negativo previsto</span>`
          : ''}
      </div>
      <div class="card-hr"></div>
      <div class="card-body" style="padding:12px 16px">
        ${createAreaChart(forecast, 820, 140)}
      </div>
    </div>

    <!-- Bills -->
    <div class="card">
      <div class="card-header">
        <span>Contas a pagar</span>
        <a href="#agenda" style="font-size:12px;color:var(--accent)">Ver todas</a>
      </div>
      <div class="card-hr"></div>
      ${bills.length === 0
        ? '<div class="empty" style="padding:24px"><i class="ti ti-check"></i><div class="empty-title">Nenhuma conta próxima</div></div>'
        : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:0">
            ${bills.slice(0, 4).map((b, i, arr) => `
              <div style="padding:14px 20px;${i < arr.length - 1 ? 'border-right:0.5px solid var(--border)' : ''}">
                <div style="font-weight:500;margin-bottom:4px">${esc(b.description)}</div>
                <div style="font-size:11px;color:var(--text-3);margin-bottom:6px">Vence ${formatDate(b.due_date)}</div>
                ${billDueBadge(b.due_date, b.status)}
                <div style="font-size:18px;font-weight:600;margin-top:8px;color:${b.status === 'overdue' ? 'var(--danger)' : 'var(--text)'}">
                  ${formatCurrency(b.amount)}
                </div>
              </div>
            `).join('')}
          </div>`
      }
    </div>

    <!-- Metas urgentes + Indicadores -->
    <div class="grid-2" style="margin-top:20px">
      <!-- Metas próximas do prazo -->
      <div class="card">
        <div class="card-header">
          <span>Metas próximas</span>
          <a href="#goals" style="font-size:12px;color:var(--accent)">Ver todas</a>
        </div>
        <div class="card-hr"></div>
        ${urgentGoals.length === 0
          ? `<div class="empty" style="padding:24px"><i class="ti ti-target"></i><div class="empty-title">Nenhuma meta urgente</div></div>`
          : `<div style="display:flex;flex-direction:column;gap:0">
              ${urgentGoals.map(g => {
                const pct  = g.target_amount > 0 ? Math.min(100, (g.current_amount / g.target_amount) * 100) : 0;
                const days = Math.ceil((new Date(g.target_date! + 'T12:00').getTime() - Date.now()) / 86400_000);
                return `<div style="padding:12px 20px;border-bottom:0.5px solid var(--border)">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                    <div style="font-weight:500;font-size:0.88rem">${esc(g.name)}</div>
                    <span style="font-size:0.75rem;color:${days <= 0 ? 'var(--danger)' : 'var(--warning)'}">
                      ${days <= 0 ? `${Math.abs(days)}d atraso` : `${days}d restantes`}
                    </span>
                  </div>
                  <div class="progress-track">
                    <div class="prog-fill" style="width:${pct.toFixed(0)}%;background:${days <= 0 ? 'var(--danger)' : 'var(--warning)'}"></div>
                  </div>
                  <div style="display:flex;justify-content:space-between;font-size:0.73rem;color:var(--text-3);margin-top:4px">
                    <span>${formatCurrency(g.current_amount)}</span>
                    <span>${formatCurrency(g.target_amount)}</span>
                  </div>
                </div>`;
              }).join('')}
            </div>`
        }
      </div>

      <!-- Indicadores de mercado -->
      <div class="card">
        <div class="card-header">
          <span>Mercado</span>
          <a href="#market" style="font-size:12px;color:var(--accent)">Ver todos</a>
        </div>
        <div class="card-hr"></div>
        ${quotes.length === 0
          ? `<div class="empty" style="padding:24px"><i class="ti ti-wifi-off"></i><div class="empty-title">Cotações indisponíveis</div></div>`
          : `<div style="display:flex;flex-direction:column;gap:0">
              ${quotes.slice(0, 5).map(q => {
                const up    = q.change_pct > 0;
                const noChg = q.change_pct === 0;
                const color = noChg ? 'var(--text-2)' : up ? 'var(--accent)' : 'var(--danger)';
                const priceStr = q.currency === '%'
                  ? `${q.price.toFixed(2)}% a.a.`
                  : q.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                return `<div style="padding:10px 20px;border-bottom:0.5px solid var(--border);display:flex;align-items:center;justify-content:space-between">
                  <span style="font-size:0.85rem;font-weight:500">${esc(q.label)}</span>
                  <div style="text-align:right">
                    <div style="font-weight:600;font-size:0.88rem">${priceStr}</div>
                    ${!noChg ? `<div style="font-size:0.73rem;color:${color}">${up ? '+' : ''}${q.change_pct.toFixed(2)}%</div>` : ''}
                  </div>
                </div>`;
              }).join('')}
            </div>`
        }
      </div>
    </div>
  `;

    el.querySelector<HTMLInputElement>('#dash-from')?.addEventListener('change', e => {
      const [y, m] = (e.target as HTMLInputElement).value.split('-').map(Number);
      if (y && m) { fromYear = y; fromMonth = m; load(); }
    });
    el.querySelector<HTMLInputElement>('#dash-to')?.addEventListener('change', e => {
      const [y, m] = (e.target as HTMLInputElement).value.split('-').map(Number);
      if (y && m) { toYear = y; toMonth = m; load(); }
    });
    el.querySelector('#dash-reset')?.addEventListener('click', () => {
      fromMonth = now.getMonth() + 1; fromYear = now.getFullYear();
      toMonth   = now.getMonth() + 1; toYear   = now.getFullYear();
      load();
    });
  }

  await load();
}

function billDueBadge(dueDate: string, status: string): string {
  if (status === 'paid')    return `<span class="badge badge-confirmed">Pago</span>`;
  if (status === 'overdue') return `<span class="badge badge-overdue">Vencido</span>`;
  const days = getDaysUntilDue(dueDate);
  const cls = days <= 3 ? 'badge-warn' : 'badge-ok';
  const label = days === 0 ? 'Hoje' : days === 1 ? 'Amanhã' : `Em ${days} dias`;
  return `<span class="badge ${cls}">${label}</span>`;
}

function hexWithAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
