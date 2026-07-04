import { invoke } from '../api';
import { formatCurrency, isCreditLikeAccountType } from '../../shared/utils';
import type { Account, BudgetWithProgress, Debt, Goal } from '../../shared/types';

type MonthRow = { label: string; income: number; expense: number };

interface Decision {
  title: string;
  body: string;
  impact: string;
  route: string;
  priority: 'Alta' | 'Média' | 'Baixa';
}

export async function render(el: HTMLElement): Promise<void> {
  el.innerHTML = '<div class="loading"><i class="ti ti-loader-2"></i> Montando decisões...</div>';

  const now = new Date();
  const current = { month: now.getMonth() + 1, year: now.getFullYear() };
  const [history, accounts, debts, budgets, goals] = await Promise.all([
    invoke<MonthRow[]>('transactions:getMonthlyHistory', 3),
    invoke<Account[]>('accounts:list'),
    invoke<Debt[]>('debts:list'),
    invoke<BudgetWithProgress[]>('budgets:list', current),
    invoke<Goal[]>('goals:list'),
  ]);

  const avgIncome = avg(history.map(h => h.income));
  const avgExpense = avg(history.map(h => h.expense));
  const available = avgIncome - avgExpense;
  const liquidBalance = accounts.filter(a => !isCreditLikeAccountType(a.type)).reduce((sum, a) => sum + a.balance, 0);
  const reserveMonths = avgExpense > 0 ? liquidBalance / avgExpense : 0;
  const activeDebts = debts.filter(d => d.status !== 'quitada');
  const debtInstallments = activeDebts.reduce((sum, d) => sum + d.installment_amount, 0);
  const debtCommitment = avgIncome > 0 ? debtInstallments / avgIncome : 0;
  const overBudgets = budgets.filter(b => b.percentage >= 100);
  const openGoals = goals.filter(g => g.current_amount < g.target_amount);
  const decisions = buildDecisions({ available, reserveMonths, debtCommitment, activeDebts, overBudgets, openGoals });

  el.innerHTML = `
    <div class="grid-3" style="margin-bottom:20px">
      <div class="stat-card">
        <div class="stat-label">Margem média</div>
        <div class="stat-value" style="color:${available >= 0 ? 'var(--accent)' : 'var(--danger)'}">${formatCurrency(available)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Reserva</div>
        <div class="stat-value">${reserveMonths.toFixed(1)} meses</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Dívidas</div>
        <div class="stat-value">${(debtCommitment * 100).toFixed(0)}%</div>
        <div class="stat-sub">da renda em parcelas</div>
      </div>
    </div>

    ${decisions.length === 0 ? `
      <div class="empty">
        <i class="ti ti-circle-check"></i>
        <div class="empty-title">Nenhuma decisão urgente</div>
        <p>Continue acompanhando score, orçamento e metas.</p>
      </div>
    ` : `
      <div style="display:flex;flex-direction:column;gap:12px">
        ${decisions.map(decisionCard).join('')}
      </div>
    `}
  `;
}

function buildDecisions(data: {
  available: number;
  reserveMonths: number;
  debtCommitment: number;
  activeDebts: Debt[];
  overBudgets: BudgetWithProgress[];
  openGoals: Goal[];
}): Decision[] {
  const decisions: Decision[] = [];
  if (data.available < 0) {
    decisions.push({
      title: 'Recuperar margem mensal',
      body: `A média recente está negativa em ${formatCurrency(Math.abs(data.available))}.`,
      impact: 'Evita consumir reserva ou ampliar dívidas.',
      route: 'plano-mensal',
      priority: 'Alta',
    });
  }
  if (data.debtCommitment > 0.35) {
    decisions.push({
      title: 'Priorizar renegociação de dívidas',
      body: `${(data.debtCommitment * 100).toFixed(0)}% da renda está comprometida com parcelas.`,
      impact: 'Reduz pressão mensal e risco de atraso.',
      route: 'renegociacao',
      priority: 'Alta',
    });
  }
  if (data.reserveMonths < 3) {
    decisions.push({
      title: 'Fortalecer reserva de emergência',
      body: `A reserva cobre ${data.reserveMonths.toFixed(1)} meses de despesas.`,
      impact: 'Aumenta proteção contra imprevistos.',
      route: 'reserva',
      priority: data.reserveMonths < 1 ? 'Alta' : 'Média',
    });
  }
  if (data.overBudgets.length > 0) {
    decisions.push({
      title: 'Ajustar orçamentos excedidos',
      body: `${data.overBudgets.length} categoria${data.overBudgets.length !== 1 ? 's' : ''} acima do limite.`,
      impact: 'Melhora previsibilidade do mês atual.',
      route: 'budget',
      priority: 'Média',
    });
  }
  if (data.available > 0 && data.openGoals.length > 0) {
    decisions.push({
      title: 'Direcionar sobra para metas',
      body: `${data.openGoals.length} meta${data.openGoals.length !== 1 ? 's' : ''} ainda em aberto.`,
      impact: 'Transforma sobra em avanço concreto.',
      route: 'goals',
      priority: 'Baixa',
    });
  }
  return decisions.sort((a, b) => priorityWeight(a.priority) - priorityWeight(b.priority));
}

function decisionCard(d: Decision): string {
  const color = d.priority === 'Alta' ? 'var(--danger)' : d.priority === 'Média' ? 'var(--warning)' : 'var(--accent)';
  return `
    <div class="card">
      <div class="card-body" style="display:flex;align-items:center;gap:14px">
        <div style="width:40px;height:40px;border-radius:9px;background:${color}22;color:${color};display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i class="ti ti-route"></i>
        </div>
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
            <strong>${d.title}</strong>
            <span class="badge" style="color:${color};background:${color}18">${d.priority}</span>
          </div>
          <div style="font-size:0.82rem;color:var(--text-2)">${d.body}</div>
          <div style="font-size:0.76rem;color:var(--text-3);margin-top:4px">${d.impact}</div>
        </div>
        <a href="#${d.route}" class="btn btn-primary btn-sm">Abrir</a>
      </div>
    </div>
  `;
}

function priorityWeight(priority: Decision['priority']): number {
  return priority === 'Alta' ? 0 : priority === 'Média' ? 1 : 2;
}

function avg(values: number[]): number {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
}
