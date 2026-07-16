import { invoke } from '../api';
import { formatCurrency } from '../../shared/utils';
import { createBarChart, createDonut, createAreaChart } from '../components/charts';
import { setTopbarActions } from '../components/topbar';
import { goToTransactions } from '../navigation';
import type { Account, Category } from '../../shared/types';

type NetWorthPoint = { month: string; label: string; account_balance: number; net_worth: number };

type MonthRow = { label: string; income: number; expense: number };
type CatRow   = { id: string | null; name: string; color: string; total: number };
type CatDetail = CatRow & { transaction_count: number; average_amount: number; largest_amount: number };
type MonthlyCatRow = CatRow & { month: string };
type TopExpense = { id: string; date: string; description: string; amount: number; account_name: string; category_name: string };
type ExpenseAnalytics = {
  availableRoots: CatRow[];
  categories: CatDetail[];
  monthlySeries: MonthlyCatRow[];
  topTransactions: TopExpense[];
  kindBreakdown: { kind: 'essential' | 'variable'; total: number }[];
  weekdayBreakdown: { weekday: number; total: number; transaction_count: number }[];
  accountBreakdown: { id: string; name: string; total: number }[];
  ownerBreakdown: { owner: string; total: number; transaction_count: number }[];
  destinationBreakdown: { key: string; description: string; total: number; transaction_count: number; average_amount: number }[];
};

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthStart(monthValue: string): string {
  return `${monthValue}-01`;
}

function monthEnd(monthValue: string): string {
  const [year, month] = monthValue.split('-').map(Number);
  return isoDate(new Date(year, month, 0));
}

export async function render(el: HTMLElement): Promise<void> {
  const now  = new Date();
  let months = 6;
  let expenseRootId = '';
  let subcategoryId = '';
  let incomeRootId = '';
  let accountId = '';
  let owner = '';
  let status = '';
  let comparisonMode: 'previous' | 'yoy' = 'previous';
  let filterDateTo = isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  let filterDateFrom = isoDate(new Date(now.getFullYear(), now.getMonth() - months + 1, 1));
  const [accounts, settings, expenseCategories] = await Promise.all([
    invoke<Account[]>('accounts:list'),
    invoke<Record<string, string>>('settings:getAll'),
    invoke<Category[]>('categories:list', 'expense'),
  ]);
  const owners = (settings.family_members ?? '').split(',').map(value => value.trim()).filter(Boolean);

  setTopbarActions(`
    <button class="btn btn-secondary" id="btn-export-report-csv">
      <i class="ti ti-file-type-csv"></i> Exportar CSV filtrado
    </button>
    <button class="btn btn-secondary" id="btn-export-pdf">
      <i class="ti ti-file-type-pdf"></i> Exportar PDF filtrado
    </button>
  `);
  document.getElementById('btn-export-pdf')?.addEventListener('click', async () => {
    await invoke('export:pdf', {
      dateFrom: filterDateFrom, dateTo: filterDateTo,
      account_id: accountId || undefined,
      category_id: subcategoryId || expenseRootId || undefined,
      owner: owner || undefined,
      status: status || undefined,
    });
  });
  document.getElementById('btn-export-report-csv')?.addEventListener('click', async () => {
    await invoke('export:csv', {
      dateFrom: filterDateFrom, dateTo: filterDateTo,
      account_id: accountId || undefined,
      category_id: subcategoryId || expenseRootId || undefined,
      owner: owner || undefined,
      status: status || undefined,
    });
  });

  async function renderPage(): Promise<void> {
    const month = now.getMonth() + 1;
    const year  = now.getFullYear();

    const rangeStart = new Date(`${filterDateFrom}T12:00:00`);
    const rangeEnd = new Date(`${filterDateTo}T12:00:00`);
    const rangeDays = Math.max(1, Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86400_000) + 1);
    let previousStart: Date;
    let previousEnd: Date;
    if (comparisonMode === 'yoy') {
      previousStart = new Date(rangeStart); previousStart.setFullYear(previousStart.getFullYear() - 1);
      previousEnd = new Date(rangeEnd); previousEnd.setFullYear(previousEnd.getFullYear() - 1);
    } else {
      previousEnd = new Date(rangeStart); previousEnd.setDate(previousEnd.getDate() - 1);
      previousStart = new Date(previousEnd); previousStart.setDate(previousStart.getDate() - rangeDays + 1);
    }
    const analyticsFilters = {
      dateFrom: filterDateFrom, dateTo: filterDateTo,
      rootCategoryId: expenseRootId || undefined,
      subcategoryId: subcategoryId || undefined,
      account_id: accountId || undefined,
      owner: owner || undefined,
      status: status || undefined,
    };
    const incomeAnalyticsFilters = {
      dateFrom: filterDateFrom, dateTo: filterDateTo,
      rootCategoryId: incomeRootId || undefined,
      account_id: accountId || undefined,
      owner: owner || undefined,
      status: status || undefined,
    };
    const spanMonths = Math.min(60, Math.max(1,
      (rangeEnd.getFullYear() - rangeStart.getFullYear()) * 12 + (rangeEnd.getMonth() - rangeStart.getMonth()) + 1,
    ));
    const [history, analytics, previousAnalytics, incomeAnalytics, netWorthFull] = await Promise.all([
      invoke<MonthRow[]>('transactions:getFilteredMonthlyHistory', analyticsFilters),
      invoke<ExpenseAnalytics>('transactions:getExpenseAnalytics', analyticsFilters),
      invoke<ExpenseAnalytics>('transactions:getExpenseAnalytics', {
        ...analyticsFilters, dateFrom: isoDate(previousStart), dateTo: isoDate(previousEnd),
      }),
      invoke<ExpenseAnalytics>('transactions:getIncomeAnalytics', incomeAnalyticsFilters),
      invoke<NetWorthPoint[]>('assets:getNetWorthHistory', spanMonths),
    ]);
    const fromYm = filterDateFrom.slice(0, 7);
    const toYm = filterDateTo.slice(0, 7);
    const netWorthHistory = netWorthFull.filter(point => point.month >= fromYm && point.month <= toYm);
    const netWorthChange = netWorthHistory.length >= 2
      ? netWorthHistory[netWorthHistory.length - 1].net_worth - netWorthHistory[0].net_worth
      : null;
    const incomeRoots = incomeAnalytics.availableRoots;
    if (incomeRootId && !incomeRoots.some(category => category.id === incomeRootId)) incomeRootId = '';
    const incomeCategoryDetails = incomeAnalytics.categories;
    const incomeDonutSegs = incomeCategoryDetails.map(c => ({ value: c.total, color: c.color, label: c.name }));
    const incomeDonutTotal = incomeDonutSegs.reduce((sum, seg) => sum + seg.value, 0);
    const rootExpenses = analytics.availableRoots;
    const previousExpenses = previousAnalytics.categories;
    const categoryDetails = analytics.categories;
    if (expenseRootId && !rootExpenses.some(category => category.id === expenseRootId)) expenseRootId = '';
    const expenses = analytics.categories;
    const budgetCategoryIds = Array.from(new Set(categoryDetails.map(category => category.id).filter((id): id is string => !!id)));
    const budgetTotals = budgetCategoryIds.length
      ? await invoke<{ category_id: string; budgeted: number; budgeted_months: number }[]>('budgets:getRangeTotals', {
          categoryIds: budgetCategoryIds, dateFrom: filterDateFrom, dateTo: filterDateTo,
        })
      : [];
    const budgetById = new Map(budgetTotals.map(row => [row.category_id, row]));
    const monthlyCategorySeries = analytics.monthlySeries;
    const seriesMonths = Array.from(new Set(monthlyCategorySeries.map(row => row.month))).sort();
    const seriesCategories = Array.from(new Map(monthlyCategorySeries.map(row => [row.id ?? 'direct', { id: row.id, name: row.name, color: row.color }])).values());

    const totalIncome  = history.reduce((s, r) => s + r.income,  0);
    const totalExpense = history.reduce((s, r) => s + r.expense, 0);
    const donutSegs    = expenses.map(e => ({ value: e.total, color: e.color, label: e.name }));
    const donutTotal   = expenses.reduce((s, e) => s + e.total, 0);
    const transactionCount = categoryDetails.reduce((sum, category) => sum + category.transaction_count, 0);
    const averageTicket = transactionCount > 0 ? donutTotal / transactionCount : 0;
    const topConcentration = donutTotal > 0 ? (categoryDetails[0]?.total ?? 0) / donutTotal * 100 : 0;
    const previousTotal = previousExpenses.reduce((sum, category) => sum + category.total, 0);
    const periodVariation = previousTotal > 0 ? (donutTotal - previousTotal) / previousTotal * 100 : null;
    const activeMonths = Math.max(1, seriesMonths.length);
    const monthlyAverage = monthlyCategorySeries.reduce((sum, row) => sum + row.total, 0) / activeMonths;
    const essentialTotal = analytics.kindBreakdown.find(row => row.kind === 'essential')?.total ?? 0;
    const variableTotal = analytics.kindBreakdown.find(row => row.kind === 'variable')?.total ?? 0;
    const kindTotal = essentialTotal + variableTotal;
    const weekdayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    function goToFilteredTransactions(opts: {
      type: 'income' | 'expense'; categoryId?: string | null; dateFrom?: string; dateTo?: string; weekday?: number;
    }): void {
      goToTransactions({
        dateFrom: opts.dateFrom ?? filterDateFrom,
        dateTo: opts.dateTo ?? filterDateTo,
        type: opts.type,
        categoryId: opts.categoryId ?? undefined,
        accountId: accountId || undefined,
        owner: owner || undefined,
        status: status || undefined,
        weekday: opts.weekday,
      });
    }

    el.innerHTML = `
      <div class="card" style="margin-bottom:16px">
        <div class="card-body" style="padding:12px 16px;display:flex;gap:10px;align-items:end;flex-wrap:wrap">
          <div><label class="form-label">Mês de</label><input class="form-ctrl" id="report-month-from" type="month" value="${filterDateFrom.slice(0, 7)}" style="width:auto"></div>
          <div><label class="form-label">Mês até</label><input class="form-ctrl" id="report-month-to" type="month" value="${filterDateTo.slice(0, 7)}" style="width:auto"></div>
          <div><label class="form-label">Meio de pagamento</label><select class="form-ctrl" id="report-account" style="min-width:170px"><option value="">Todos</option>${accounts.map(account => `<option value="${account.id}" ${accountId === account.id ? 'selected' : ''}>${esc(account.name)}</option>`).join('')}</select></div>
          ${owners.length ? `<div><label class="form-label">Responsável</label><select class="form-ctrl" id="report-owner" style="min-width:140px"><option value="">Todos</option>${owners.map(name => `<option value="${esc(name)}" ${owner === name ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></div>` : ''}
          <div><label class="form-label">Status</label><select class="form-ctrl" id="report-status"><option value="" ${!status ? 'selected' : ''}>Todos</option><option value="confirmed" ${status === 'confirmed' ? 'selected' : ''}>Confirmados</option><option value="pending" ${status === 'pending' ? 'selected' : ''}>Pendentes</option></select></div>
          ${expenseRootId ? `<div><label class="form-label">Subcategoria</label><select class="form-ctrl" id="report-subcategory" style="min-width:160px"><option value="">Todas</option>${expenseCategories.filter(category => category.parent_id === expenseRootId).map(category => `<option value="${category.id}" ${subcategoryId === category.id ? 'selected' : ''}>${esc(category.name)}</option>`).join('')}</select></div>` : ''}
          <div><label class="form-label">Comparar com</label><select class="form-ctrl" id="report-comparison-mode" style="min-width:190px">
            <option value="previous" ${comparisonMode === 'previous' ? 'selected' : ''}>Período anterior</option>
            <option value="yoy" ${comparisonMode === 'yoy' ? 'selected' : ''}>Mesmo período ano anterior</option>
          </select></div>
          <button class="btn btn-ghost btn-sm" id="report-clear-filters">Limpar filtros</button>
        </div>
      </div>
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
          <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            <span>${expenseRootId ? 'Despesas por subcategoria' : 'Despesas por categoria'}</span>
            <select class="form-ctrl" id="report-expense-category" style="width:auto;max-width:190px;font-size:11px">
              <option value="">Todas as categorias</option>
              ${rootExpenses.map(category => `<option value="${category.id}" ${expenseRootId === category.id ? 'selected' : ''}>${esc(category.name)}</option>`).join('')}
            </select>
          </div>
          <div class="card-hr"></div>
          <div class="card-body" style="padding:16px" id="expense-donut-panel">
            ${donutSegs.length === 0
              ? `<div class="empty" style="padding:24px"><i class="ti ti-chart-pie-off"></i><div class="empty-title">Sem despesas</div></div>`
              : `<div style="display:flex;align-items:center;justify-content:center">
                  ${createDonut(donutSegs, 150, formatCurrency(donutTotal), 'despesas', expenses.map(e => e.id))}
                </div>
                <div style="margin-top:12px">
                  ${expenses.map(e => {
                    const pct = donutTotal > 0 ? (e.total / donutTotal * 100).toFixed(0) : 0;
                    return `<div data-cat-id="${e.id ?? ''}" title="Ver lançamentos de ${esc(e.name)}" style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:12px;cursor:pointer">
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

      <div class="grid-3" style="margin-bottom:20px">
        <div class="stat-card">
          <div class="stat-label">Média mensal de despesas</div>
          <div class="stat-value stat-red">${formatCurrency(monthlyAverage)}</div>
          <div class="stat-sub">${activeMonths} mês${activeMonths === 1 ? '' : 'es'} com movimento</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Ticket médio</div>
          <div class="stat-value">${formatCurrency(averageTicket)}</div>
          <div class="stat-sub">${transactionCount} lançamento${transactionCount === 1 ? '' : 's'} no recorte</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Variação contra ${comparisonMode === 'yoy' ? 'ano anterior' : 'período anterior'}</div>
          <div class="stat-value" style="color:${periodVariation == null ? 'var(--text-3)' : periodVariation > 0 ? 'var(--danger)' : 'var(--accent)'}">${periodVariation == null ? 'Sem base' : `${periodVariation > 0 ? '+' : ''}${periodVariation.toFixed(1)}%`}</div>
          <div class="stat-sub">${comparisonMode === 'yoy' ? 'Mesmo período do ano anterior' : 'Mesma duração imediatamente anterior'}</div>
        </div>
      </div>

      <div class="grid-3" style="margin-bottom:20px">
        <div class="card">
          <div class="card-header">Concentração dos gastos</div><div class="card-hr"></div>
          <div class="card-body">
            <div style="font-size:28px;font-weight:650;color:${topConcentration >= 50 ? 'var(--warning)' : 'var(--text)'}">${topConcentration.toFixed(1)}%</div>
            <div style="font-size:12px;color:var(--text-2);margin:4px 0 14px">em ${esc(categoryDetails[0]?.name ?? 'nenhuma categoria')}</div>
            <div class="prog-track"><div class="prog-fill" style="width:${Math.min(topConcentration,100)}%;background:${categoryDetails[0]?.color ?? 'var(--accent)'}"></div></div>
            <div style="font-size:11px;color:var(--text-3);margin-top:10px">Quanto maior, mais o orçamento depende de uma única categoria.</div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">Essenciais × variáveis</div><div class="card-hr"></div>
          <div class="card-body">
            ${kindTotal === 0 ? '<div class="empty"><div class="empty-title">Sem dados</div></div>' : `
              <div style="display:flex;height:18px;border-radius:9px;overflow:hidden;margin-bottom:14px">
                <div title="Essenciais: ${formatCurrency(essentialTotal)}" style="width:${essentialTotal/kindTotal*100}%;background:var(--warning)"></div>
                <div title="Variáveis: ${formatCurrency(variableTotal)}" style="width:${variableTotal/kindTotal*100}%;background:var(--accent)"></div>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:12px"><span>Essenciais</span><strong>${(essentialTotal/kindTotal*100).toFixed(1)}%</strong></div>
              <div style="display:flex;justify-content:space-between;font-size:12px;margin-top:8px"><span>Variáveis</span><strong>${(variableTotal/kindTotal*100).toFixed(1)}%</strong></div>
            `}
          </div>
        </div>

        <div class="card">
          <div class="card-header">Gastos por dia da semana</div><div class="card-hr"></div>
          <div class="card-body" style="display:flex;align-items:flex-end;gap:6px;height:150px" id="weekday-panel">
            ${weekdayLabels.map((label, weekday) => {
              const row = analytics.weekdayBreakdown.find(item => item.weekday === weekday);
              const max = Math.max(...analytics.weekdayBreakdown.map(item => item.total), 1);
              const height = row ? Math.max(3, row.total / max * 100) : 2;
              return `<div data-weekday="${weekday}" title="${label}: ${formatCurrency(row?.total ?? 0)}" style="flex:1;text-align:center;cursor:${row ? 'pointer' : 'default'}"><div style="height:${height}px;background:var(--accent);opacity:${row ? 1 : 0.2};border-radius:4px 4px 1px 1px"></div><div style="font-size:9px;color:var(--text-3);margin-top:5px">${label}</div></div>`;
            }).join('')}
          </div>
        </div>
      </div>

      <div class="grid-2" style="grid-template-columns:${owners.length ? '1.3fr 1fr' : '1fr'};margin-bottom:20px">
        <div class="card">
          <div class="card-header">Despesas por meio de pagamento</div><div class="card-hr"></div>
          <div class="card-body">
            ${analytics.accountBreakdown.length === 0 ? '<div class="empty"><div class="empty-title">Sem despesas no recorte</div></div>' : analytics.accountBreakdown.map(account => {
              const max = Math.max(...analytics.accountBreakdown.map(item => item.total), 1);
              return `<div style="display:grid;grid-template-columns:minmax(120px,220px) 1fr 100px;gap:12px;align-items:center;margin-bottom:10px;font-size:12px"><span>${esc(account.name)}</span><div class="prog-track"><div class="prog-fill" style="width:${account.total/max*100}%"></div></div><strong style="text-align:right">${formatCurrency(account.total)}</strong></div>`;
            }).join('')}
          </div>
        </div>
        ${owners.length ? `
        <div class="card">
          <div class="card-header">Despesas por responsável</div><div class="card-hr"></div>
          <div class="card-body">
            ${analytics.ownerBreakdown.length === 0 ? '<div class="empty"><div class="empty-title">Sem despesas no recorte</div></div>' : analytics.ownerBreakdown.map(row => {
              const max = Math.max(...analytics.ownerBreakdown.map(item => item.total), 1);
              return `<div style="display:grid;grid-template-columns:minmax(90px,150px) 1fr 100px;gap:12px;align-items:center;margin-bottom:10px;font-size:12px"><span>${esc(row.owner)}</span><div class="prog-track"><div class="prog-fill" style="width:${row.total/max*100}%"></div></div><strong style="text-align:right">${formatCurrency(row.total)}</strong></div>`;
            }).join('')}
          </div>
        </div>` : ''}
      </div>

      <div class="card" style="margin-bottom:20px">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
          <span>Principais favorecidos</span>
          <span style="font-size:11px;color:var(--text-3)">Onde o dinheiro está indo, agrupado por descrição do lançamento</span>
        </div>
        <div class="card-hr"></div>
        <div class="table-wrap" style="border:0">
          ${analytics.destinationBreakdown.length === 0 ? '<div class="empty" style="padding:20px"><div class="empty-title">Sem despesas no recorte</div></div>' : `
          <table class="table">
            <thead><tr><th>Descrição</th><th>Total</th><th>Qtd.</th><th>Média</th><th>Participação</th></tr></thead>
            <tbody>${analytics.destinationBreakdown.map(row => {
              const participation = donutTotal > 0 ? row.total / donutTotal * 100 : 0;
              return `<tr>
                <td>${esc(row.description)}</td>
                <td>${formatCurrency(row.total)}</td>
                <td>${row.transaction_count}</td>
                <td>${formatCurrency(row.average_amount)}</td>
                <td>${participation.toFixed(1)}%</td>
              </tr>`;
            }).join('')}</tbody>
          </table>`}
        </div>
      </div>

      <div class="card" style="margin-bottom:20px">
        <div class="card-header" style="display:flex;justify-content:space-between;gap:12px;align-items:center">
          <span>Evolução ${expenseRootId ? 'das subcategorias' : 'por categoria'} · ${months} meses</span>
          <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end">
            ${seriesCategories.slice(0, 8).map(category => `<span style="font-size:10px;color:var(--text-2)"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${category.color};margin-right:4px"></span>${esc(category.name)}</span>`).join('')}
          </div>
        </div>
        <div class="card-hr"></div>
        <div class="card-body" style="padding:18px 20px" id="evolution-panel">
          ${seriesMonths.length === 0 ? '<div class="empty" style="padding:20px"><div class="empty-title">Sem despesas no período</div></div>' : `
            <div style="display:flex;align-items:flex-end;gap:12px;height:190px;overflow-x:auto;padding-top:12px">
              ${seriesMonths.map(monthKey => {
                const rows = monthlyCategorySeries.filter(row => row.month === monthKey);
                const total = rows.reduce((sum, row) => sum + row.total, 0);
                const maxTotal = Math.max(...seriesMonths.map(key => monthlyCategorySeries.filter(row => row.month === key).reduce((sum, row) => sum + row.total, 0)), 1);
                const height = Math.max(4, total / maxTotal * 145);
                const label = new Date(`${monthKey}-01T12:00`).toLocaleDateString('pt-BR', { month: 'short' });
                return `<div style="flex:1;min-width:54px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%">
                  <div title="${formatCurrency(total)}" style="width:34px;height:${height}px;display:flex;flex-direction:column-reverse;border-radius:5px 5px 2px 2px;overflow:hidden;background:var(--surface2)">
                    ${rows.map(row => `<div data-cat-id="${row.id ?? ''}" data-month="${monthKey}" title="${esc(row.name)}: ${formatCurrency(row.total)}" style="height:${total > 0 ? row.total / total * 100 : 0}%;background:${row.color};min-height:1px;cursor:pointer"></div>`).join('')}
                  </div>
                  <div style="font-size:10px;color:var(--text-3);margin-top:7px;text-transform:capitalize">${label}</div>
                </div>`;
              }).join('')}
            </div>
          `}
        </div>
      </div>

      <div class="grid-2" style="grid-template-columns:1fr 1.4fr;margin-bottom:20px">
        <div class="card">
          <div class="card-header">Variação por categoria</div>
          <div class="card-hr"></div>
          <div class="card-body" style="padding:14px 18px">
            ${rootExpenses.length === 0 ? '<div class="empty" style="padding:20px"><div class="empty-title">Sem despesas no mês</div></div>' : rootExpenses.slice(0, 6).map(category => {
              const previous = previousExpenses.find(item => item.id === category.id)?.total ?? 0;
              const variation = previous > 0 ? ((category.total - previous) / previous) * 100 : null;
              const max = Math.max(category.total, previous, 1);
              return `<div style="margin-bottom:14px">
                <div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;margin-bottom:5px">
                  <span>${esc(category.name)}</span>
                  <strong style="color:${variation == null ? 'var(--text-3)' : variation > 0 ? 'var(--danger)' : 'var(--accent)'}">${variation == null ? 'Novo' : `${variation > 0 ? '+' : ''}${variation.toFixed(0)}%`}</strong>
                </div>
                <div style="display:flex;flex-direction:column;gap:3px">
                  <div title="Período atual: ${formatCurrency(category.total)}" style="height:7px;width:${(category.total / max) * 100}%;background:${category.color};border-radius:4px"></div>
                  <div title="${comparisonMode === 'yoy' ? 'Mesmo período ano anterior' : 'Período anterior'}: ${formatCurrency(previous)}" style="height:5px;width:${(previous / max) * 100}%;background:var(--border-strong);border-radius:4px"></div>
                </div>
              </div>`;
            }).join('')}
            <div style="font-size:10px;color:var(--text-3)">Barra colorida: período atual · cinza: ${comparisonMode === 'yoy' ? 'mesmo período ano anterior' : 'período anterior'}</div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">Detalhamento de despesas</div>
          <div class="card-hr"></div>
          <div class="table-wrap" style="border:0" id="expense-detail-panel">
            <table class="table">
              <thead><tr><th>Categoria</th><th>Total</th><th>Participação</th><th>Qtd.</th><th>Média</th><th>Maior</th><th>Orçamento</th></tr></thead>
              <tbody>${categoryDetails.map(category => {
                const participation = donutTotal > 0 ? category.total / donutTotal * 100 : 0;
                const budget = category.id ? budgetById.get(category.id) : undefined;
                const budgetCell = !budget || budget.budgeted <= 0
                  ? `<span style="color:var(--text-3)">Sem orçamento</span>`
                  : (() => {
                      const pct = category.total / budget.budgeted * 100;
                      const color = pct >= 100 ? 'var(--danger)' : pct >= 80 ? 'var(--warning)' : 'var(--text)';
                      return `<span title="Orçado ${formatCurrency(budget.budgeted)} em ${budget.budgeted_months} mês(es)" style="color:${color};font-weight:600">${pct.toFixed(0)}%</span>`;
                    })();
                return `<tr data-cat-id="${category.id ?? ''}" title="Ver lançamentos de ${esc(category.name)}" style="cursor:pointer">
                  <td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${category.color};margin-right:6px"></span>${esc(category.name)}</td>
                  <td>${formatCurrency(category.total)}</td>
                  <td>${participation.toFixed(1)}%</td>
                  <td>${category.transaction_count}</td>
                  <td>${formatCurrency(category.average_amount)}</td>
                  <td>${formatCurrency(category.largest_amount)}</td>
                  <td>${budgetCell}</td>
                </tr>`;
              }).join('')}</tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="card" style="margin-bottom:20px">
        <div class="card-header">Maiores despesas do recorte</div>
        <div class="card-hr"></div>
        <div class="table-wrap" style="border:0">
          <table class="table"><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Meio</th><th style="text-align:right">Valor</th></tr></thead>
          <tbody>${analytics.topTransactions.map(transaction => `<tr><td>${transaction.date.split('-').reverse().join('/')}</td><td>${esc(transaction.description)}</td><td>${esc(transaction.category_name)}</td><td>${esc(transaction.account_name)}</td><td style="text-align:right;font-weight:600">${formatCurrency(transaction.amount)}</td></tr>`).join('')}</tbody></table>
        </div>
      </div>

      <div class="grid-2" style="grid-template-columns:1fr 1.4fr;margin-bottom:20px">
        <div class="card">
          <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            <span>Receitas por categoria</span>
            <select class="form-ctrl" id="report-income-category" style="width:auto;max-width:190px;font-size:11px">
              <option value="">Todas as categorias</option>
              ${incomeRoots.map(category => `<option value="${category.id}" ${incomeRootId === category.id ? 'selected' : ''}>${esc(category.name)}</option>`).join('')}
            </select>
          </div>
          <div class="card-hr"></div>
          <div class="card-body" style="padding:16px" id="income-donut-panel">
            ${incomeDonutSegs.length === 0
              ? `<div class="empty" style="padding:24px"><i class="ti ti-chart-pie-off"></i><div class="empty-title">Sem receitas</div></div>`
              : `<div style="display:flex;align-items:center;justify-content:center">
                  ${createDonut(incomeDonutSegs, 150, formatCurrency(incomeDonutTotal), 'receitas', incomeCategoryDetails.map(c => c.id))}
                </div>
                <div style="margin-top:12px">
                  ${incomeCategoryDetails.map(c => {
                    const pct = incomeDonutTotal > 0 ? (c.total / incomeDonutTotal * 100).toFixed(0) : 0;
                    return `<div data-cat-id="${c.id ?? ''}" title="Ver lançamentos de ${esc(c.name)}" style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:12px;cursor:pointer">
                      <div style="width:8px;height:8px;border-radius:50%;background:${c.color};flex-shrink:0"></div>
                      <span style="flex:1;color:var(--text-2)">${esc(c.name)}</span>
                      <span style="font-weight:500">${pct}%</span>
                      <span style="color:var(--text-3);width:80px;text-align:right">${formatCurrency(c.total)}</span>
                    </div>`;
                  }).join('')}
                </div>`
            }
          </div>
        </div>

        <div class="card">
          <div class="card-header">Detalhamento de receitas</div>
          <div class="card-hr"></div>
          <div class="table-wrap" style="border:0" id="income-detail-panel">
            <table class="table">
              <thead><tr><th>Categoria</th><th>Total</th><th>Participação</th><th>Qtd.</th><th>Média</th><th>Maior</th></tr></thead>
              <tbody>${incomeCategoryDetails.map(category => {
                const participation = incomeDonutTotal > 0 ? category.total / incomeDonutTotal * 100 : 0;
                return `<tr data-cat-id="${category.id ?? ''}" title="Ver lançamentos de ${esc(category.name)}" style="cursor:pointer">
                  <td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${category.color};margin-right:6px"></span>${esc(category.name)}</td>
                  <td>${formatCurrency(category.total)}</td>
                  <td>${participation.toFixed(1)}%</td>
                  <td>${category.transaction_count}</td>
                  <td>${formatCurrency(category.average_amount)}</td>
                  <td>${formatCurrency(category.largest_amount)}</td>
                </tr>`;
              }).join('')}</tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="card" style="margin-bottom:20px">
        <div class="card-header">Maiores receitas do recorte</div>
        <div class="card-hr"></div>
        <div class="table-wrap" style="border:0">
          <table class="table"><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Meio</th><th style="text-align:right">Valor</th></tr></thead>
          <tbody>${incomeAnalytics.topTransactions.map(transaction => `<tr><td>${transaction.date.split('-').reverse().join('/')}</td><td>${esc(transaction.description)}</td><td>${esc(transaction.category_name)}</td><td>${esc(transaction.account_name)}</td><td style="text-align:right;font-weight:600">${formatCurrency(transaction.amount)}</td></tr>`).join('')}</tbody></table>
        </div>
      </div>

      <div class="card" style="margin-bottom:20px">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
          <span>Evolução patrimonial no período</span>
          <a href="#patrimonio" style="font-size:11px">Ver detalhamento <i class="ti ti-arrow-right"></i></a>
        </div>
        <div class="card-hr"></div>
        <div class="card-body" style="padding:16px 20px">
          ${netWorthHistory.length < 2
            ? `<div class="empty" style="padding:20px"><div class="empty-title">Sem histórico suficiente no recorte</div></div>`
            : `<div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
                <div style="flex:1;min-width:260px">
                  ${createAreaChart(netWorthHistory.map(point => {
                    const [year, month] = point.month.split('-').map(Number);
                    const lastDay = new Date(year, month, 0).getDate();
                    return { date: `${point.month}-${String(lastDay).padStart(2, '0')}`, balance: point.net_worth };
                  }), 560, 150)}
                </div>
                <div style="min-width:150px">
                  <div style="font-size:11px;color:var(--text-3);text-transform:uppercase">Patrimônio líquido no fim do recorte</div>
                  <div style="font-size:22px;font-weight:650">${formatCurrency(netWorthHistory[netWorthHistory.length - 1].net_worth)}</div>
                  <div style="font-size:12px;margin-top:6px;color:${netWorthChange == null ? 'var(--text-3)' : netWorthChange >= 0 ? 'var(--accent)' : 'var(--danger)'}">
                    ${netWorthChange == null ? 'Sem base' : `${netWorthChange >= 0 ? '+' : ''}${formatCurrency(netWorthChange)} no recorte`}
                  </div>
                </div>
              </div>
              <div style="font-size:10.5px;color:var(--text-3);margin-top:10px">Investimentos, bens e dívidas considerados pelo valor de hoje (sem histórico datado); só o saldo em contas evolui de fato mês a mês.</div>`
          }
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
        filterDateFrom = isoDate(new Date(now.getFullYear(), now.getMonth() - months + 1, 1));
        filterDateTo = isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
        void renderPage();
      });
    });
    el.querySelector<HTMLSelectElement>('#report-expense-category')?.addEventListener('change', event => {
      expenseRootId = (event.target as HTMLSelectElement).value;
      subcategoryId = '';
      void renderPage();
    });
    el.querySelector<HTMLSelectElement>('#report-income-category')?.addEventListener('change', event => {
      incomeRootId = (event.target as HTMLSelectElement).value;
      void renderPage();
    });
    el.querySelector<HTMLSelectElement>('#report-subcategory')?.addEventListener('change', event => { subcategoryId = (event.target as HTMLSelectElement).value; void renderPage(); });
    el.querySelector<HTMLInputElement>('#report-month-from')?.addEventListener('change', event => {
      const value = (event.target as HTMLInputElement).value;
      if (!value) return;
      filterDateFrom = monthStart(value);
      if (filterDateFrom > filterDateTo) filterDateTo = monthEnd(value);
      void renderPage();
    });
    el.querySelector<HTMLInputElement>('#report-month-to')?.addEventListener('change', event => {
      const value = (event.target as HTMLInputElement).value;
      if (!value) return;
      filterDateTo = monthEnd(value);
      if (filterDateTo < filterDateFrom) filterDateFrom = monthStart(value);
      void renderPage();
    });
    el.querySelector<HTMLSelectElement>('#report-account')?.addEventListener('change', event => { accountId = (event.target as HTMLSelectElement).value; void renderPage(); });
    el.querySelector<HTMLSelectElement>('#report-owner')?.addEventListener('change', event => { owner = (event.target as HTMLSelectElement).value; void renderPage(); });
    el.querySelector<HTMLSelectElement>('#report-status')?.addEventListener('change', event => { status = (event.target as HTMLSelectElement).value; void renderPage(); });
    el.querySelector<HTMLSelectElement>('#report-comparison-mode')?.addEventListener('change', event => {
      comparisonMode = (event.target as HTMLSelectElement).value === 'yoy' ? 'yoy' : 'previous';
      void renderPage();
    });
    el.querySelector('#report-clear-filters')?.addEventListener('click', () => {
      accountId = ''; owner = ''; status = ''; expenseRootId = ''; subcategoryId = ''; incomeRootId = '';
      filterDateFrom = isoDate(new Date(now.getFullYear(), now.getMonth() - months + 1, 1));
      filterDateTo = isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)); void renderPage();
    });

    // Drill-down: gráficos e tabelas de despesas/receitas levam para os
    // lançamentos filtrados correspondentes.
    function wireCategoryDrilldown(panelId: string, type: 'income' | 'expense'): void {
      el.querySelector(`#${panelId}`)?.querySelectorAll<HTMLElement>('[data-cat-id]').forEach(node => {
        node.addEventListener('click', () => {
          goToFilteredTransactions({ type, categoryId: node.dataset.catId || undefined });
        });
      });
    }
    wireCategoryDrilldown('expense-donut-panel', 'expense');
    wireCategoryDrilldown('expense-detail-panel', 'expense');
    wireCategoryDrilldown('income-donut-panel', 'income');
    wireCategoryDrilldown('income-detail-panel', 'income');

    el.querySelector('#evolution-panel')?.querySelectorAll<HTMLElement>('[data-cat-id]').forEach(node => {
      node.addEventListener('click', () => {
        const monthKey = node.dataset.month!;
        goToFilteredTransactions({
          type: 'expense',
          categoryId: node.dataset.catId || undefined,
          dateFrom: monthStart(monthKey),
          dateTo: monthEnd(monthKey),
        });
      });
    });

    el.querySelector('#weekday-panel')?.querySelectorAll<HTMLElement>('[data-weekday]').forEach(node => {
      node.addEventListener('click', () => {
        goToFilteredTransactions({ type: 'expense', weekday: Number(node.dataset.weekday) });
      });
    });
  }

  await renderPage();
}

function esc(s?: string): string {
  return (s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
