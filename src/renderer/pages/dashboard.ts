import { invoke } from '../api';
import { formatCurrency, formatDate, getDaysUntilDue } from '../../shared/utils';
import { createDonut, createAreaChart } from '../components/charts';
import type { Account, Bill, TransactionWithDetails, MonthlySummary, ForecastPoint, InvestmentSummary } from '../../shared/types';

export async function render(el: HTMLElement): Promise<void> {
  el.innerHTML = '<div class="loading"><i class="ti ti-loader-2"></i> Carregando...</div>';

  const now = new Date();
  const month = now.getMonth() + 1;
  const year  = now.getFullYear();

  const [accounts, summary, recent, bills, expenses, forecast, invSummary, assetSummary] = await Promise.all([
    invoke<Account[]>('accounts:list'),
    invoke<MonthlySummary>('transactions:getMonthlySummary', { month, year }),
    invoke<TransactionWithDetails[]>('transactions:list', { month, year, limit: 5 }),
    invoke<Bill[]>('bills:getUpcoming', 30),
    invoke<{ name: string; color: string; total: number }[]>('transactions:getExpensesByCategory', { month, year }),
    invoke<ForecastPoint[]>('forecast:get', 30),
    invoke<InvestmentSummary>('investments:getSummary'),
    invoke<{ total: number }>('assets:getSummary'),
  ]);

  const totalBalance  = accounts.reduce((s, a) => s + a.balance, 0);
  const netWorth      = totalBalance + invSummary.total_current + (assetSummary.total ?? 0);
  const donutSegs     = expenses.map(e => ({ value: e.total, color: e.color, label: e.name }));

  el.innerHTML = `
    <!-- Stat cards -->
    <div class="grid-3" style="margin-bottom:20px">
      <div class="stat-card">
        <div class="stat-label">Saldo em contas</div>
        <div class="stat-value">${formatCurrency(totalBalance)}</div>
        <div class="stat-sub">${accounts.length} conta${accounts.length !== 1 ? 's' : ''} · patrimônio líquido: <strong>${formatCurrency(netWorth)}</strong></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Receitas (${now.toLocaleDateString('pt-BR', { month: 'short' })})</div>
        <div class="stat-value stat-green">${formatCurrency(summary.income)}</div>
        <div class="stat-sub">↑ mês atual</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Despesas (${now.toLocaleDateString('pt-BR', { month: 'short' })})</div>
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
          ? '<div class="empty" style="padding:32px"><i class="ti ti-receipt-off"></i><div class="empty-title">Nenhuma transação este mês</div></div>'
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
                  now.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
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
  `;
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
