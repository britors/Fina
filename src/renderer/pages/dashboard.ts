import { invoke } from '../api';
import { formatCurrency, formatDate, getDaysUntilDue, isCreditLikeAccountType } from '../../shared/utils';
import { createDonut, createAreaChart } from '../components/charts';
import type { Account, Bill, Receivable, TransactionWithDetails, MonthlySummary, ForecastPoint, EndOfMonthForecast, InvestmentSummary, Goal, MarketQuote, ConsolidatedBalance, CashFlowForecast } from '../../shared/types';

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
  let expenseRootId = '';

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

    const [accounts, summary, recent, bills, receivables, rootExpenses, forecast, endOfMonthForecast, invSummary, assetSummary, goals, debtSummary, quotes, consolidatedBalance, cashFlow] = await Promise.all([
      invoke<Account[]>('accounts:list'),
      invoke<MonthlySummary>('transactions:getSummaryRange', { dateFrom, dateTo }),
      invoke<TransactionWithDetails[]>('transactions:list', { dateFrom, dateTo, limit: 5 }),
      invoke<Bill[]>('bills:getUpcoming', 30),
      invoke<Receivable[]>('receivables:getUpcoming', 30),
      invoke<{ id: string; name: string; color: string; total: number }[]>('transactions:getExpensesByCategoryRange', { dateFrom, dateTo }),
      invoke<ForecastPoint[]>('forecast:get', 30),
      invoke<EndOfMonthForecast>('forecast:endOfMonth'),
      invoke<InvestmentSummary>('investments:getSummary'),
      invoke<{ total: number }>('assets:getSummary'),
      invoke<Goal[]>('goals:list'),
      invoke<{ total_debt: number }>('debts:getSummary'),
      invoke<MarketQuote[]>('market:getQuotes'),
      invoke<ConsolidatedBalance>('openFinance:getConsolidatedBalance'),
      invoke<CashFlowForecast>('openFinance:getCashFlowForecast', 8),
    ]);
    if (expenseRootId && !rootExpenses.some(category => category.id === expenseRootId)) expenseRootId = '';
    const expenses = expenseRootId
      ? await invoke<{ id: string | null; name: string; color: string; total: number }[]>('transactions:getExpenseSubcategoryBreakdown', { rootCategoryId: expenseRootId, dateFrom, dateTo })
      : rootExpenses;

    const totalBalance  = accounts.reduce((s, a) => s + (isCreditLikeAccountType(a.type) ? -a.balance : a.balance), 0);
    const netWorth       = totalBalance + invSummary.total_current + (assetSummary.total ?? 0) - (debtSummary.total_debt ?? 0);
    const donutSegs      = expenses.map(e => ({ value: e.total, color: e.color, label: e.name }));
    const expenseTotal   = expenses.reduce((sum, expense) => sum + expense.total, 0);
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
        <div class="stat-label">Saldo em meios de pagamento</div>
        <div class="stat-value">${formatCurrency(totalBalance)}</div>
        <div class="stat-sub">${accounts.length} meio${accounts.length !== 1 ? 's' : ''} · patrimônio líquido: <strong>${formatCurrency(netWorth)}</strong></div>
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
        <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <span>${expenseRootId ? 'Gastos por subcategoria' : 'Gastos por categoria'}</span>
          <select class="form-ctrl" id="dash-expense-category" style="width:auto;max-width:180px;font-size:11px">
            <option value="">Todas as categorias</option>
            ${rootExpenses.map(category => `<option value="${category.id}" ${expenseRootId === category.id ? 'selected' : ''}>${esc(category.name)}</option>`).join('')}
          </select>
        </div>
        <div class="card-hr"></div>
        <div class="card-body" style="padding:16px 20px">
          ${donutSegs.length === 0
            ? '<div class="empty" style="padding:24px"><i class="ti ti-chart-pie-off"></i><div class="empty-title">Sem despesas</div></div>'
            : `<div class="chart-container">
                ${createDonut(donutSegs, 150,
                  periodLabel,
                  formatCurrency(expenseTotal))}
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

    <!-- Previsão até o fim do mês -->
    <div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <span>Previsão até o fim do mês</span>
        ${endOfMonthForecast.projectedBalance < 0
          ? `<span style="color:var(--danger);font-size:0.8rem"><i class="ti ti-alert-triangle"></i> Saldo negativo previsto</span>`
          : ''}
      </div>
      <div class="card-hr"></div>
      <div class="card-body" style="display:flex;gap:24px;flex-wrap:wrap">
        <div style="min-width:160px">
          <div class="stat-label">Saldo projetado</div>
          <div class="stat-value" style="color:${endOfMonthForecast.projectedBalance >= 0 ? 'var(--accent)' : 'var(--danger)'}">${formatCurrency(endOfMonthForecast.projectedBalance)}</div>
          <div class="stat-sub">a partir de ${formatCurrency(endOfMonthForecast.currentBalance)} hoje</div>
        </div>
        <div style="flex:1;min-width:240px">
          <div class="stat-label" style="margin-bottom:8px">Principais fatores</div>
          ${endOfMonthForecast.factors.length === 0
            ? `<div style="color:var(--text-3);font-size:0.82rem">Nenhum lançamento ou conta futura no período.</div>`
            : `<div style="display:flex;flex-direction:column;gap:6px">
                ${endOfMonthForecast.factors.map(f => `
                  <div style="display:flex;justify-content:space-between;gap:12px;font-size:0.82rem">
                    <span style="color:var(--text-2)">${esc(f.label)} · ${formatDate(f.date)}</span>
                    <strong style="color:${f.type === 'income' ? 'var(--accent)' : 'var(--danger)'}">${f.type === 'income' ? '+' : ''}${formatCurrency(f.amount)}</strong>
                  </div>
                `).join('')}
              </div>`
          }
        </div>
      </div>
    </div>

    ${consolidatedBalance.byInstitution.length > 0 ? `
      <!-- Open Finance: saldo consolidado -->
      <div class="card" style="margin-bottom:20px">
        <div class="card-header">Open Finance — saldo consolidado</div>
        <div class="card-hr"></div>
        <div class="card-body">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:14px">
            <div>
              <div class="stat-label">Saldo total conectado</div>
              <div class="stat-value" style="color:var(--accent)">${formatCurrency(consolidatedBalance.total)}</div>
            </div>
            <select class="form-ctrl" id="of-bank-filter" style="max-width:240px">
              <option value="">Todos os bancos</option>
              ${consolidatedBalance.byInstitution.map(b => `<option value="${esc(b.bankName)}">${esc(b.bankName)} · ${formatCurrency(b.total)}</option>`).join('')}
            </select>
          </div>
          <div style="display:flex;flex-direction:column;gap:2px">
            ${consolidatedBalance.byInstitution.flatMap(b => b.accounts.map(a => `
              <div class="of-account-row" data-bank="${esc(b.bankName)}" style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:0.5px solid var(--border)">
                <div>
                  <div style="font-weight:500">${esc(a.name)}</div>
                  <div style="font-size:0.76rem;color:var(--text-3)">${esc(b.bankName)}</div>
                </div>
                <div style="font-weight:600">${formatCurrency(a.balance)}</div>
              </div>
            `)).join('')}
          </div>
        </div>
      </div>

      <!-- Open Finance: fluxo de caixa consolidado -->
      <div class="card" style="margin-bottom:20px">
        <div class="card-header">Fluxo de caixa consolidado — próximas ${cashFlow.weeks.length} semanas</div>
        <div class="card-hr"></div>
        <div class="card-body">
          <div class="table-wrap">
            <table class="table" style="margin:0">
              <thead><tr><th>Semana</th><th>Entradas</th><th>Saídas</th><th style="text-align:right">Saldo projetado</th></tr></thead>
              <tbody>
                ${cashFlow.weeks.map(w => `
                  <tr>
                    <td>${formatDate(w.weekStart)} – ${formatDate(w.weekEnd)}</td>
                    <td style="color:var(--accent)">+${formatCurrency(w.income)}</td>
                    <td style="color:var(--danger)">-${formatCurrency(w.expense)}</td>
                    <td style="text-align:right;font-weight:600;color:${w.balance >= 0 ? 'var(--accent)' : 'var(--danger)'}">${formatCurrency(w.balance)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          ${cashFlow.factors.length > 0 ? `
            <div style="margin-top:16px">
              <div class="stat-label" style="margin-bottom:8px">Principais fatores</div>
              ${cashFlow.factors.map(f => `
                <div style="display:flex;justify-content:space-between;gap:12px;font-size:0.82rem;margin-bottom:6px">
                  <span style="color:var(--text-2)">
                    ${esc(f.label)} · ${formatDate(f.date)}
                    ${f.recurring ? '<span class="badge badge-warn" style="margin-left:4px">Recorrente</span>' : ''}
                  </span>
                  <strong style="color:${f.type === 'income' ? 'var(--accent)' : 'var(--danger)'}">${f.type === 'income' ? '+' : ''}${formatCurrency(f.amount)}</strong>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      </div>
    ` : ''}

    <!-- Bills & Receivables -->
    <div class="grid-2" style="margin-bottom:20px">
      <div class="card">
        <div class="card-header">
          <span>Contas a pagar</span>
          <a href="#agenda" style="font-size:12px;color:var(--accent)">Ver todas</a>
        </div>
        <div class="card-hr"></div>
        ${bills.length === 0
          ? '<div class="empty" style="padding:24px"><i class="ti ti-check"></i><div class="empty-title">Nenhuma conta próxima</div></div>'
          : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:0">
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

      <div class="card">
        <div class="card-header">
          <span>Contas a receber</span>
          <a href="#contas-receber" style="font-size:12px;color:var(--accent)">Ver todas</a>
        </div>
        <div class="card-hr"></div>
        ${receivables.length === 0
          ? '<div class="empty" style="padding:24px"><i class="ti ti-check"></i><div class="empty-title">Nenhuma conta próxima</div></div>'
          : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:0">
              ${receivables.slice(0, 4).map((r, i, arr) => `
                <div style="padding:14px 20px;${i < arr.length - 1 ? 'border-right:0.5px solid var(--border)' : ''}">
                  <div style="font-weight:500;margin-bottom:4px">${esc(r.description)}</div>
                  <div style="font-size:11px;color:var(--text-3);margin-bottom:6px">Vence ${formatDate(r.due_date)}</div>
                  ${receivableDueBadge(r.due_date, r.status)}
                  <div style="font-size:18px;font-weight:600;margin-top:8px;color:${r.status === 'overdue' ? 'var(--danger)' : 'var(--accent)'}">
                    ${formatCurrency(r.amount)}
                  </div>
                </div>
              `).join('')}
            </div>`
        }
      </div>
    </div>

    <!-- Metas urgentes + Indicadores -->
    <div class="grid-2">
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
    el.querySelector<HTMLSelectElement>('#dash-expense-category')?.addEventListener('change', event => {
      expenseRootId = (event.target as HTMLSelectElement).value;
      void load();
    });
    el.querySelector<HTMLSelectElement>('#of-bank-filter')?.addEventListener('change', e => {
      const bank = (e.target as HTMLSelectElement).value;
      el.querySelectorAll<HTMLElement>('.of-account-row').forEach(row => {
        row.style.display = !bank || row.dataset.bank === bank ? 'flex' : 'none';
      });
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

function receivableDueBadge(dueDate: string, status: string): string {
  if (status === 'received') return `<span class="badge badge-confirmed">Recebido</span>`;
  if (status === 'overdue')  return `<span class="badge badge-overdue">Vencido</span>`;
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
