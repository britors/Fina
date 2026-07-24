import { invoke } from '../api';
import { formatCurrency, isCreditLikeAccountType } from '../../shared/utils';
import { runAIAction } from '../components/aiConsent';
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

    ${renderDecisionSimulator({ available, reserveMonths, avgExpense, activeDebts, openGoals })}

    ${decisions.length === 0 ? `
      <div class="empty">
        <i class="ti ti-circle-check"></i>
        <div class="empty-title">Nenhuma decisão urgente</div>
        <p>Continue acompanhando score, orçamento e metas.</p>
      </div>
    ` : `
      <div style="display:flex;flex-direction:column;gap:12px">
        ${decisions.map((d, i) => decisionCard(d, i)).join('')}
      </div>
    `}
  `;

  el.querySelectorAll<HTMLButtonElement>('.btn-explain-decision').forEach(btn => {
    btn.addEventListener('click', () => {
      const decision = decisions[Number(btn.dataset.index)];
      runAIAction({
        title: `Detalhar: ${decision.title}`,
        consentText: `O Fina vai enviar o título, a descrição e o impacto desta decisão junto com o resumo financeiro agregado (o mesmo já usado no Assistente IA) para gerar um passo a passo prático.`,
        channel: 'ai:explainDecision',
        payload: { title: decision.title, body: decision.body, impact: decision.impact },
      });
    });
  });

  const simulator = el.querySelector<HTMLElement>('[data-decision-simulator]');
  const amountInput = simulator?.querySelector<HTMLInputElement>('[data-simulator-amount]');
  const refreshSimulation = (): void => {
    if (!simulator || !amountInput) return;
    const amount = Math.max(0, Number(amountInput.value) || 0);
    const selected = simulator.querySelector<HTMLInputElement>('input[name="decision-scenario"]:checked')?.value ?? 'reserve';
    const result = scenarioResult({ reserveMonths, avgExpense, activeDebts, openGoals }, amount, selected);
    const output = simulator.querySelector<HTMLElement>('[data-simulator-result]');
    if (output) output.innerHTML = `<strong>${result.title}</strong><div style="margin-top:4px;color:var(--text-2)">${result.body}</div>`;
  };
  amountInput?.addEventListener('input', refreshSimulation);
  simulator?.querySelectorAll('input[name="decision-scenario"]').forEach(input => input.addEventListener('change', refreshSimulation));
  refreshSimulation();
}

function renderDecisionSimulator(data: { available: number; reserveMonths: number; avgExpense: number; activeDebts: Debt[]; openGoals: Goal[] }): string {
  const suggested = Math.max(0, Math.round(data.available * 100) / 100);
  return `<div class="card" data-decision-simulator style="margin-bottom:20px">
    <div class="card-header"><i class="ti ti-git-compare"></i> Simulador de decisões</div>
    <div class="card-hr"></div>
    <div class="card-body">
      <p style="font-size:0.82rem;color:var(--text-3);margin:0 0 14px">Compare o efeito de direcionar uma sobra mensal. A simulação não altera seus dados.</p>
      <div style="display:flex;gap:12px;align-items:end;flex-wrap:wrap">
        <label style="min-width:190px;flex:1">Valor mensal
          <input class="form-ctrl" type="number" min="0" step="0.01" value="${suggested.toFixed(2)}" data-simulator-amount>
        </label>
        <label class="radio-label"><input type="radio" name="decision-scenario" value="reserve" checked> Reserva</label>
        <label class="radio-label"><input type="radio" name="decision-scenario" value="debt"> Dívidas</label>
        <label class="radio-label"><input type="radio" name="decision-scenario" value="goal"> Metas</label>
      </div>
      <div data-simulator-result style="margin-top:16px;padding:12px;border-radius:8px;background:var(--surface-2);font-size:0.86rem"></div>
    </div>
  </div>`;
}

function scenarioResult(data: { reserveMonths: number; avgExpense: number; activeDebts: Debt[]; openGoals: Goal[] }, amount: number, scenario: string): { title: string; body: string } {
  if (scenario === 'debt') {
    const debt = [...data.activeDebts].sort((a, b) => b.interest_rate - a.interest_rate)[0];
    if (!debt) return { title: 'Sem dívidas ativas', body: 'Direcione esse valor para reserva ou metas.' };
    const months = debt.installment_amount + amount > 0 ? Math.ceil(debt.outstanding_balance / (debt.installment_amount + amount)) : 0;
    return { title: `Priorizar ${debt.description}`, body: `${formatCurrency(amount)} extras por mês reduzem o saldo de ${formatCurrency(debt.outstanding_balance)} em aproximadamente ${months} meses, antes dos juros.` };
  }
  if (scenario === 'goal') {
    const goal = [...data.openGoals].sort((a, b) => (a.target_date ?? '9999').localeCompare(b.target_date ?? '9999'))[0];
    if (!goal) return { title: 'Nenhuma meta aberta', body: 'Crie uma meta para simular seu próximo objetivo.' };
    const remaining = Math.max(0, goal.target_amount - goal.current_amount);
    const months = amount > 0 ? Math.ceil(remaining / amount) : 0;
    return { title: `Acelerar ${goal.name}`, body: `${formatCurrency(amount)} por mês completa ${formatCurrency(remaining)} restantes em aproximadamente ${months || '—'} meses.` };
  }
  const addedMonths = data.avgExpense > 0 ? amount / data.avgExpense : 0;
  return { title: 'Fortalecer a reserva', body: `${formatCurrency(amount)} mensais adicionam ${addedMonths.toFixed(1)} mês de despesas por aporte e levam a reserva estimada para ${(data.reserveMonths + addedMonths).toFixed(1)} meses após um ano.` };
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

function decisionCard(d: Decision, index: number): string {
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
        <button type="button" class="btn btn-secondary btn-sm btn-explain-decision" data-index="${index}"><i class="ti ti-sparkles"></i> Detalhar com IA</button>
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
