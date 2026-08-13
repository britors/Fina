import { td } from '../i18n';
import { invoke } from '../api';
import { isBrazilLocale } from '../i18n';
import { formatCurrency } from '../../shared/utils';
import { setTopbarActions } from '../components/topbar';
import { createBarChart } from '../components/charts';

type MonthRow = { label: string; income: number; expense: number };
type CatRow = { id: string | null; name: string; color: string; total: number };
type TopExpense = { id: string; date: string; description: string; amount: number; account_name: string; category_name: string };
type ExpenseAnalytics = {
  availableRoots: CatRow[];
  categories: (CatRow & { transaction_count: number })[];
  topTransactions: TopExpense[];
  weekdayBreakdown: { weekday: number; total: number; transaction_count: number }[];
  paymentMethodBreakdown: { method: 'pix' | 'outros'; total: number; transaction_count: number }[];
};
type NetWorthPoint = { month: string; label: string; account_balance: number; net_worth: number };

const WEEKDAY_LABEL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

// A retrospectiva reaproveita os mesmos endpoints de Relatórios (que já
// aceitam qualquer intervalo de datas), só compondo o ano cheio em vez de
// filtrar por 3/6/12 meses — nenhum agregado novo precisou ser criado.
export async function render(el: HTMLElement): Promise<void> {
  const currentYear = new Date().getFullYear();
  let year = currentYear;

  setTopbarActions(`
    <select class="form-ctrl" id="retro-year" style="width:110px">
      ${[0, 1, 2, 3].map(i => {
        const y = currentYear - i;
        return `<option value="${y}" ${y === year ? 'selected' : ''}>${y}</option>`;
      }).join('')}
    </select>
  `);
  document.getElementById('retro-year')?.addEventListener('change', async e => {
    year = parseInt((e.target as HTMLSelectElement).value);
    await renderPage();
  });

  async function renderPage(): Promise<void> {
    el.innerHTML = '<div class="loading"><i class="ti ti-loader-2"></i> Montando sua retrospectiva...</div>';

    const dateFrom = `${year}-01-01`;
    const isCurrentYear = year === currentYear;
    const dateTo = isCurrentYear ? new Date().toISOString().slice(0, 10) : `${year}-12-31`;
    const prevDateFrom = `${year - 1}-01-01`;
    const prevDateTo = isCurrentYear ? `${year - 1}-${dateTo.slice(5)}` : `${year - 1}-12-31`;

    const [history, analytics, prevAnalytics, netWorthFull] = await Promise.all([
      invoke<MonthRow[]>('transactions:getFilteredMonthlyHistory', { dateFrom, dateTo }),
      invoke<ExpenseAnalytics>('transactions:getExpenseAnalytics', { dateFrom, dateTo }),
      invoke<ExpenseAnalytics>('transactions:getExpenseAnalytics', { dateFrom: prevDateFrom, dateTo: prevDateTo }),
      invoke<NetWorthPoint[]>('assets:getNetWorthHistory', 24),
    ]);

    const totalIncome = history.reduce((s, r) => s + r.income, 0);
    const totalExpense = history.reduce((s, r) => s + r.expense, 0);
    const saved = totalIncome - totalExpense;
    const prevTotalExpense = prevAnalytics.categories.reduce((s, c) => s + c.total, 0);
    const expenseChangePct = prevTotalExpense > 0 ? ((totalExpense - prevTotalExpense) / prevTotalExpense) * 100 : null;

    const bestMonth = history.reduce((best, m) => (m.income - m.expense > (best?.income ?? -Infinity) - (best?.expense ?? 0) ? m : best), null as MonthRow | null);
    const worstMonth = history.reduce((worst, m) => (m.income - m.expense < (worst?.income ?? Infinity) - (worst?.expense ?? 0) ? m : worst), null as MonthRow | null);

    const topCategories = [...analytics.categories].sort((a, b) => b.total - a.total).slice(0, 5);
    const topTransactions = [...analytics.topTransactions].slice(0, 5);
    const topWeekday = [...analytics.weekdayBreakdown].sort((a, b) => b.total - a.total)[0];
    const pixTotal = analytics.paymentMethodBreakdown.find(p => p.method === 'pix')?.total ?? 0;

    const netWorthYear = netWorthFull.filter(p => p.month >= `${year}-01` && p.month <= dateTo.slice(0, 7));
    const netWorthChange = netWorthYear.length >= 2 ? netWorthYear[netWorthYear.length - 1].net_worth - netWorthYear[0].net_worth : null;

    el.innerHTML = `
      <div style="max-width:920px;display:flex;flex-direction:column;gap:16px">
        <div class="card" style="padding:20px 24px;text-align:center;background:linear-gradient(135deg, rgba(29,158,117,.12), rgba(59,130,246,.08))">
          <div style="font-size:0.8rem;color:var(--text-3);text-transform:uppercase;letter-spacing:1px">Sua retrospectiva financeira</div>
          <div style="font-size:2rem;font-weight:700;margin-top:4px">${year}</div>
        </div>

        <div class="grid-3">
          ${metricCard('Total recebido', formatCurrency(totalIncome), td("{value} meses no período", [history.length]), 'ti-arrow-down-left', 'var(--accent)')}
          ${metricCard('Total gasto', formatCurrency(totalExpense), expenseChangePct !== null ? `${expenseChangePct >= 0 ? '+' : ''}${expenseChangePct.toFixed(0)}% vs. ${year - 1}` : 'sem comparação', 'ti-arrow-up-right', 'var(--danger)')}
          ${metricCard('Sobra do período', formatCurrency(saved), saved >= 0 ? 'no azul' : 'no vermelho', 'ti-piggy-bank', saved >= 0 ? 'var(--accent)' : 'var(--danger)')}
        </div>

        <div class="card">
          <div class="card-header">Fluxo mensal</div>
          <div class="card-hr"></div>
          <div class="card-body">
            ${history.length > 0 ? createBarChart(history.map(h => ({ label: h.label, income: h.income, expense: h.expense })), 720, 180) : '<div class="empty" style="padding:20px"><div class="empty-title">Sem dados no período</div></div>'}
          </div>
        </div>

        <div class="grid-2" style="gap:16px">
          ${bestMonth ? metricCard('Melhor mês', bestMonth.label, formatCurrency(bestMonth.income - bestMonth.expense), 'ti-trophy', 'var(--accent)') : ''}
          ${worstMonth ? metricCard('Mês mais apertado', worstMonth.label, formatCurrency(worstMonth.income - worstMonth.expense), 'ti-alert-triangle', 'var(--danger)') : ''}
        </div>

        <div class="card">
          <div class="card-header">Top 5 categorias de gasto</div>
          <div class="card-hr"></div>
          ${topCategories.length === 0 ? `<div class="empty" style="padding:16px"><div class="empty-title">Sem despesas no período</div></div>` : `
            <table class="table">
              <tbody>
                ${topCategories.map(c => `<tr>
                  <td><span style="display:inline-flex;align-items:center;gap:8px"><span style="width:8px;height:8px;border-radius:50%;background:${c.color}"></span>${esc(c.name)}</span></td>
                  <td style="text-align:right;color:var(--text-3);font-size:0.78rem">${c.transaction_count} lançamento${c.transaction_count !== 1 ? 's' : ''}</td>
                  <td style="text-align:right;font-weight:600">${formatCurrency(c.total)}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          `}
        </div>

        <div class="card">
          <div class="card-header">Maiores gastos individuais</div>
          <div class="card-hr"></div>
          ${topTransactions.length === 0 ? `<div class="empty" style="padding:16px"><div class="empty-title">Sem lançamentos no período</div></div>` : `
            <table class="table">
              <tbody>
                ${topTransactions.map(t => `<tr>
                  <td>${esc(t.description)}<div style="font-size:0.72rem;color:var(--text-3)">${esc(t.category_name)} · ${t.date}</div></td>
                  <td style="text-align:right;font-weight:600;color:var(--danger)">${formatCurrency(t.amount)}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          `}
        </div>

        <div class="grid-3">
          ${topWeekday ? metricCard('Dia da semana que mais gasta', WEEKDAY_LABEL[topWeekday.weekday], formatCurrency(topWeekday.total), 'ti-calendar', 'var(--warning)') : ''}
          ${isBrazilLocale ? metricCard('Gasto via Pix', formatCurrency(pixTotal), totalExpense > 0 ? td("{value}% do total", [((pixTotal / totalExpense) * 100).toFixed(0)]) : '—', 'ti-qrcode', 'var(--accent)') : ''}
          ${netWorthChange !== null ? metricCard('Variação de patrimônio', `${netWorthChange >= 0 ? '+' : ''}${formatCurrency(netWorthChange)}`, 'no ano', 'ti-trending-up', netWorthChange >= 0 ? 'var(--accent)' : 'var(--danger)') : ''}
        </div>
      </div>
    `;
  }

  await renderPage();
}

function metricCard(label: string, value: string, sub: string, icon: string, color: string): string {
  return `
    <div class="stat-card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div class="stat-label" style="margin:0">${label}</div>
        <i class="ti ${icon}" style="color:${color};font-size:1.1rem"></i>
      </div>
      <div class="stat-value" style="color:${color};font-size:1.3rem">${value}</div>
      <div class="stat-sub">${sub}</div>
    </div>
  `;
}

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
