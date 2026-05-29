import { invoke } from '../api';
import { formatCurrency } from '../../shared/utils';
import { createBarChart, createDonut } from '../components/charts';

type MonthRow = { label: string; income: number; expense: number };
type CatRow   = { name: string; color: string; total: number };

export async function render(el: HTMLElement): Promise<void> {
  const now  = new Date();
  let months = 6;

  async function renderPage(): Promise<void> {
    const month = now.getMonth() + 1;
    const year  = now.getFullYear();

    const [history, expenses] = await Promise.all([
      invoke<MonthRow[]>('transactions:getMonthlyHistory', months),
      invoke<CatRow[]>('transactions:getExpensesByCategory', { month, year }),
    ]);

    const totalIncome  = history.reduce((s, r) => s + r.income,  0);
    const totalExpense = history.reduce((s, r) => s + r.expense, 0);
    const donutSegs    = expenses.map(e => ({ value: e.total, color: e.color, label: e.name }));
    const donutTotal   = expenses.reduce((s, e) => s + e.total, 0);

    el.innerHTML = `
      <!-- Period tabs -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <div style="display:flex;gap:0;background:var(--surface);border:0.5px solid var(--border);border-radius:7px;overflow:hidden">
          ${[3,6,12].map(n => `
            <button class="btn" data-months="${n}"
              style="border-radius:0;background:${months===n ? 'var(--bg)' : 'transparent'};
                     color:${months===n ? 'var(--text)' : 'var(--text-3)'};
                     border:none;padding:7px 18px;font-size:12px">
              ${n} meses
            </button>
          `).join('')}
        </div>
        <div style="display:flex;gap:12px;font-size:12px;color:var(--text-3)">
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--accent);margin-right:5px"></span>Receitas</span>
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--danger);margin-right:5px"></span>Despesas</span>
        </div>
      </div>

      <!-- Charts row -->
      <div class="grid-2" style="grid-template-columns:1.8fr 1fr;margin-bottom:20px">
        <!-- Bar chart -->
        <div class="card">
          <div class="card-header">Receitas × Despesas mensais</div>
          <div class="card-hr"></div>
          <div class="card-body" style="padding:16px 20px;overflow:hidden">
            ${createBarChart(history, undefined, 190)}
          </div>
        </div>
        <!-- Donut -->
        <div class="card">
          <div class="card-header">Despesas por categoria</div>
          <div class="card-hr"></div>
          <div class="card-body" style="padding:16px">
            ${donutSegs.length === 0
              ? `<div class="empty" style="padding:24px"><i class="ti ti-chart-pie-off"></i><div class="empty-title">Sem despesas</div></div>`
              : `<div style="display:flex;align-items:center;justify-content:center">
                  ${createDonut(donutSegs, 150, formatCurrency(donutTotal), 'despesas')}
                </div>
                <div style="margin-top:12px">
                  ${expenses.map(e => {
                    const pct = donutTotal > 0 ? (e.total / donutTotal * 100).toFixed(0) : 0;
                    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:12px">
                      <div style="width:8px;height:8px;border-radius:50%;background:${e.color};flex-shrink:0"></div>
                      <span style="flex:1;color:var(--text-2)">${esc(e.name)}</span>
                      <span style="font-weight:500">${pct}%</span>
                      <span style="color:var(--text-3);width:80px;text-align:right">${formatCurrency(e.total)}</span>
                    </div>`;
                  }).join('')}
                </div>`
            }
          </div>
        </div>
      </div>

      <!-- Summary table -->
      <div class="card">
        <div class="card-header">Resumo do período</div>
        <div class="card-hr"></div>
        <div class="table-wrap" style="border:none;border-radius:0 0 var(--r-panel) var(--r-panel)">
          <table class="table">
            <thead>
              <tr>
                <th>MÊS</th>
                <th style="text-align:right">RECEITAS</th>
                <th style="text-align:right">DESPESAS</th>
                <th style="text-align:right">SALDO</th>
              </tr>
            </thead>
            <tbody>
              ${history.map(r => {
                const bal = r.income - r.expense;
                return `<tr>
                  <td style="font-weight:500">${r.label}</td>
                  <td style="text-align:right;color:var(--accent)">+${formatCurrency(r.income)}</td>
                  <td style="text-align:right;color:var(--danger)">-${formatCurrency(r.expense)}</td>
                  <td style="text-align:right;font-weight:500;color:${bal>=0?'var(--accent)':'var(--danger)'}">
                    ${bal>=0?'+':''}${formatCurrency(bal)}
                  </td>
                </tr>`;
              }).join('')}
              <tr style="background:var(--surface2)">
                <td style="font-weight:600">Total (${months}m)</td>
                <td style="text-align:right;color:var(--accent);font-weight:600">+${formatCurrency(totalIncome)}</td>
                <td style="text-align:right;color:var(--danger);font-weight:600">-${formatCurrency(totalExpense)}</td>
                <td style="text-align:right;font-weight:600;color:${totalIncome-totalExpense>=0?'var(--accent)':'var(--danger)'}">
                  ${totalIncome-totalExpense>=0?'+':''}${formatCurrency(totalIncome-totalExpense)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    el.querySelectorAll<HTMLElement>('[data-months]').forEach(btn => {
      btn.addEventListener('click', () => {
        months = parseInt(btn.dataset.months!);
        renderPage();
      });
    });
  }

  await renderPage();
}

function esc(s?: string): string {
  return (s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
