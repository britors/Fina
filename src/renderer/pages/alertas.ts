import { invoke } from '../api';
import { formatCurrency, getCurrentYearMonth, isCreditLikeAccountType } from '../../shared/utils';
import type { Account, BudgetWithProgress, Debt } from '../../shared/types';

type MonthRow = { label: string; income: number; expense: number };
type CategoryExpense = { name: string; color: string; total: number };
type AlertLevel = 'danger' | 'warning' | 'info';

interface FinancialAlert {
  level: AlertLevel;
  title: string;
  body: string;
  action: string;
  icon: string;
}

export async function render(el: HTMLElement): Promise<void> {
  el.innerHTML = '<div class="loading"><i class="ti ti-loader-2"></i> Analisando alertas...</div>';

  const now = getCurrentYearMonth();
  const prevDate = new Date(now.year, now.month - 2, 1);
  const prev = { month: prevDate.getMonth() + 1, year: prevDate.getFullYear() };

  const [history, debts, accounts, budgets, currentCats, prevCats] = await Promise.all([
    invoke<MonthRow[]>('transactions:getMonthlyHistory', 3),
    invoke<Debt[]>('debts:list'),
    invoke<Account[]>('accounts:list'),
    invoke<BudgetWithProgress[]>('budgets:list', now),
    invoke<CategoryExpense[]>('transactions:getExpensesByCategory', now),
    invoke<CategoryExpense[]>('transactions:getExpensesByCategory', prev),
  ]);

  const alerts = buildAlerts(history, debts, accounts, budgets, currentCats, prevCats);
  const counts = {
    danger: alerts.filter(a => a.level === 'danger').length,
    warning: alerts.filter(a => a.level === 'warning').length,
    info: alerts.filter(a => a.level === 'info').length,
  };

  el.innerHTML = `
    <div class="grid-3" style="margin-bottom:20px">
      ${metricCard('Críticos', String(counts.danger), 'Exigem ação imediata', 'ti-alert-triangle', 'var(--danger)')}
      ${metricCard('Atenção', String(counts.warning), 'Riscos para acompanhar', 'ti-alert-circle', 'var(--warning)')}
      ${metricCard('Oportunidades', String(counts.info), 'Ações preventivas', 'ti-bulb', 'var(--accent)')}
    </div>

    ${alerts.length === 0 ? `
      <div class="empty">
        <i class="ti ti-circle-check"></i>
        <div class="empty-title">Nenhum alerta no momento</div>
        <p>Continue atualizando seus lançamentos para o Fina acompanhar sua situação.</p>
      </div>
    ` : `
      <div style="display:flex;flex-direction:column;gap:12px">
        ${alerts.map(alertCard).join('')}
      </div>
    `}
  `;
}

function buildAlerts(
  history: MonthRow[],
  debts: Debt[],
  accounts: Account[],
  budgets: BudgetWithProgress[],
  currentCats: CategoryExpense[],
  prevCats: CategoryExpense[],
): FinancialAlert[] {
  const alerts: FinancialAlert[] = [];
  const avgIncome = avg(history.map(h => h.income));
  const avgExpense = avg(history.map(h => h.expense));
  const monthlyBalance = avgIncome - avgExpense;
  const activeDebts = debts.filter(d => d.status !== 'quitada');
  const debtInstallments = activeDebts.reduce((s, d) => s + d.installment_amount, 0);
  const debtCommitment = avgIncome > 0 ? (debtInstallments / avgIncome) * 100 : 0;
  const liquidBalance = accounts.filter(a => !isCreditLikeAccountType(a.type)).reduce((s, a) => s + a.balance, 0);
  const reserveMonths = avgExpense > 0 ? liquidBalance / avgExpense : 0;

  if (monthlyBalance < 0) {
    alerts.push({
      level: 'danger',
      title: 'O mês médio está fechando negativo',
      body: `Pela média recente, faltam ${formatCurrency(Math.abs(monthlyBalance))} para a renda cobrir as despesas.`,
      action: 'Revise categorias variáveis e use o Plano mensal para recuperar margem.',
      icon: 'ti-trending-down',
    });
  }

  if (debtCommitment > 35) {
    alerts.push({
      level: 'danger',
      title: 'Dívidas comprometem parte alta da renda',
      body: `${debtCommitment.toFixed(0)}% da renda média está comprometida com parcelas.`,
      action: 'Abra o Plano de saída e simule pagamento extra ou renegociação.',
      icon: 'ti-receipt',
    });
  } else if (debtCommitment > 20) {
    alerts.push({
      level: 'warning',
      title: 'Comprometimento com dívidas em atenção',
      body: `${debtCommitment.toFixed(0)}% da renda média está indo para parcelas.`,
      action: 'Evite novas dívidas e acompanhe a evolução mensal.',
      icon: 'ti-alert-circle',
    });
  }

  if (reserveMonths < 1 && avgExpense > 0) {
    alerts.push({
      level: 'warning',
      title: 'Reserva de emergência baixa',
      body: `O saldo em meios de pagamento cobre cerca de ${reserveMonths.toFixed(1)} mês de despesas.`,
      action: 'Use a tela Reserva para definir uma contribuição mensal.',
      icon: 'ti-shield',
    });
  }

  for (const budget of budgets) {
    if (budget.percentage >= 100) {
      alerts.push({
        level: 'danger',
        title: `Orçamento excedido em ${budget.category_name}`,
        body: `${formatCurrency(budget.spent)} gastos de ${formatCurrency(budget.limit_amount)} planejados.`,
        action: 'Revise os lançamentos da categoria ou ajuste o limite se o gasto for recorrente.',
        icon: 'ti-target-off',
      });
    } else if (budget.percentage >= 80) {
      alerts.push({
        level: 'warning',
        title: `Orçamento quase no limite em ${budget.category_name}`,
        body: `${budget.percentage.toFixed(0)}% do limite mensal já foi usado.`,
        action: 'Reduza novos gastos nessa categoria até o próximo mês.',
        icon: 'ti-target',
      });
    }
  }

  const prevMap = new Map(prevCats.map(c => [c.name, c.total]));
  for (const cat of currentCats) {
    const previous = prevMap.get(cat.name) ?? 0;
    if (previous <= 0 || cat.total < previous * 1.5 || cat.total - previous < 100) continue;
    alerts.push({
      level: 'info',
      title: `Gasto em ${cat.name} cresceu`,
      body: `Subiu de ${formatCurrency(previous)} para ${formatCurrency(cat.total)} em relação ao mês anterior.`,
      action: 'Verifique se foi um gasto pontual ou uma nova tendência.',
      icon: 'ti-chart-line',
    });
  }

  if (alerts.length === 0 && monthlyBalance > 0) {
    alerts.push({
      level: 'info',
      title: 'Há margem positiva no orçamento',
      body: `A sobra média recente é de ${formatCurrency(monthlyBalance)}.`,
      action: 'Considere direcionar parte para reserva, quitação de dívidas ou investimentos.',
      icon: 'ti-pig-money',
    });
  }

  return alerts;
}

function alertCard(alert: FinancialAlert): string {
  const color = alert.level === 'danger' ? 'var(--danger)' : alert.level === 'warning' ? 'var(--warning)' : 'var(--accent)';
  return `
    <div class="card" style="border-color:${color}55">
      <div class="card-body" style="display:flex;align-items:flex-start;gap:14px">
        <div style="width:38px;height:38px;border-radius:9px;background:${color}18;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i class="ti ${alert.icon}" style="color:${color};font-size:1.2rem"></i>
        </div>
        <div style="flex:1">
          <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:4px">
            <strong style="font-size:0.96rem">${esc(alert.title)}</strong>
            <span class="badge" style="background:${color}18;color:${color}">${label(alert.level)}</span>
          </div>
          <div style="color:var(--text-2);line-height:1.55;margin-bottom:8px">${esc(alert.body)}</div>
          <div style="font-size:0.8rem;color:var(--text-3)"><strong style="color:var(--text-2)">Ação:</strong> ${esc(alert.action)}</div>
        </div>
      </div>
    </div>
  `;
}

function metricCard(label: string, value: string, sub: string, icon: string, color: string): string {
  return `
    <div class="stat-card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div class="stat-label" style="margin:0">${label}</div>
        <i class="ti ${icon}" style="color:${color};font-size:1.1rem"></i>
      </div>
      <div class="stat-value" style="color:${color}">${value}</div>
      <div class="stat-sub">${sub}</div>
    </div>
  `;
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function label(level: AlertLevel): string {
  return level === 'danger' ? 'Crítico' : level === 'warning' ? 'Atenção' : 'Oportunidade';
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
