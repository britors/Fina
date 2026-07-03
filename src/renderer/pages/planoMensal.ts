import { invoke } from '../api';
import { formatCurrency } from '../../shared/utils';
import type { Account, Debt, Goal, InvestmentSummary } from '../../shared/types';

type MonthRow = { label: string; income: number; expense: number };

interface PlanItem {
  label: string;
  value: number;
  color: string;
  icon: string;
  description: string;
}

export async function render(el: HTMLElement): Promise<void> {
  el.innerHTML = '<div class="loading"><i class="ti ti-loader-2"></i> Montando plano mensal...</div>';

  const [accounts, history, debts, goals, investments] = await Promise.all([
    invoke<Account[]>('accounts:list'),
    invoke<MonthRow[]>('transactions:getMonthlyHistory', 3),
    invoke<Debt[]>('debts:list'),
    invoke<Goal[]>('goals:list'),
    invoke<InvestmentSummary>('investments:getSummary'),
  ]);

  const avgIncome = avg(history.map(r => r.income));
  const avgExpense = avg(history.map(r => r.expense));
  const activeDebts = debts.filter(d => d.status !== 'quitada');
  const debtInstallments = activeDebts.reduce((s, d) => s + d.installment_amount, 0);
  const debtBalance = activeDebts.reduce((s, d) => s + d.outstanding_balance, 0);
  const liquidBalance = accounts.filter(a => a.type !== 'credit_card').reduce((s, a) => s + a.balance, 0);
  const reserveMonths = avgExpense > 0 ? liquidBalance / avgExpense : 0;
  const openGoals = goals.filter(g => g.current_amount < g.target_amount);
  const available = avgIncome - avgExpense;
  const plan = buildPlan({
    avgIncome,
    avgExpense,
    available,
    debtBalance,
    debtInstallments,
    reserveMonths,
    openGoals: openGoals.length,
    investmentsTotal: investments.total_current,
  });
  const totalSuggested = plan.reduce((s, p) => s + p.value, 0);
  const isDeficit = avgIncome > 0 && available < 0;

  el.innerHTML = `
    ${isDeficit ? `
      <div class="alert alert-error">
        <strong>Atenção:</strong> sua média de despesas supera a renda em ${formatCurrency(Math.abs(available))}. O plano prioriza recuperar saldo antes de distribuir valores.
      </div>
    ` : ''}

    <div class="grid-3" style="margin-bottom:20px">
      ${metricCard('Renda média', formatCurrency(avgIncome), 'Últimos 3 meses', 'ti-arrow-up-right', 'var(--accent)')}
      ${metricCard('Despesas médias', formatCurrency(avgExpense), 'Últimos 3 meses', 'ti-arrow-down-right', 'var(--danger)')}
      ${metricCard('Margem mensal', `${available >= 0 ? '+' : ''}${formatCurrency(available)}`, 'Renda menos despesas', 'ti-wallet', available >= 0 ? 'var(--accent)' : 'var(--danger)')}
    </div>

    <div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <span>Plano sugerido para a margem mensal</span>
        <span style="font-size:0.8rem;color:var(--text-3)">Total sugerido: ${formatCurrency(totalSuggested)}</span>
      </div>
      <div class="card-hr"></div>
      <div class="card-body" style="display:flex;flex-direction:column;gap:14px">
        ${plan.map(item => planRow(item, totalSuggested)).join('')}
      </div>
    </div>

    <div class="grid-2" style="grid-template-columns:1fr 1fr">
      <div class="card">
        <div class="card-header">Leitura do plano</div>
        <div class="card-hr"></div>
        <div class="card-body" style="display:flex;flex-direction:column;gap:12px">
          ${insightLine('Dívidas ativas', activeDebts.length === 0 ? 'Nenhuma' : `${activeDebts.length} dívida${activeDebts.length !== 1 ? 's' : ''}`, debtBalance > 0 ? formatCurrency(debtBalance) : 'Sem saldo devedor')}
          ${insightLine('Reserva estimada', `${reserveMonths.toFixed(1)} meses`, reserveMonths < 3 ? 'Abaixo de 3 meses' : 'Boa cobertura inicial')}
          ${insightLine('Metas em aberto', String(openGoals.length), openGoals.length > 0 ? 'Considere aporte mensal' : 'Nenhuma meta pendente')}
          ${insightLine('Investimentos atuais', formatCurrency(investments.total_current), investments.total_current > 0 ? 'Carteira iniciada' : 'Ainda sem investimentos')}
        </div>
      </div>

      <div class="card">
        <div class="card-header">Como usar este plano</div>
        <div class="card-hr"></div>
        <div class="card-body" style="color:var(--text-2);line-height:1.7;font-size:0.88rem">
          <p style="margin:0 0 10px">Use os valores como referência para o próximo mês. O plano não bloqueia lançamentos; ele orienta decisões.</p>
          <p style="margin:0 0 10px">Se a margem estiver negativa, o primeiro objetivo é reduzir despesas variáveis ou renegociar dívidas até voltar a sobrar dinheiro.</p>
          <p style="margin:0">Revise o plano mensalmente, depois de atualizar transações, dívidas, metas e investimentos.</p>
        </div>
      </div>
    </div>
  `;
}

function buildPlan(data: {
  avgIncome: number;
  avgExpense: number;
  available: number;
  debtBalance: number;
  debtInstallments: number;
  reserveMonths: number;
  openGoals: number;
  investmentsTotal: number;
}): PlanItem[] {
  if (data.avgIncome <= 0) {
    return [
      {
        label: 'Registrar renda',
        value: 0,
        color: 'var(--warning)',
        icon: 'ti-pencil',
        description: 'Cadastre receitas para que o Fina consiga sugerir valores mensais.',
      },
    ];
  }

  if (data.available <= 0) {
    return [
      {
        label: 'Cortar ou renegociar',
        value: Math.abs(data.available),
        color: 'var(--danger)',
        icon: 'ti-alert-triangle',
        description: 'Valor aproximado que precisa ser recuperado para o mês fechar sem déficit.',
      },
      {
        label: 'Proteger contas essenciais',
        value: Math.max(data.avgIncome * 0.5, 0),
        color: 'var(--warning)',
        icon: 'ti-home',
        description: 'Priorize moradia, alimentação, transporte e saúde enquanto reorganiza o orçamento.',
      },
    ];
  }

  const available = data.available;

  if (data.debtBalance > 0 && data.debtInstallments / data.avgIncome > 0.2) {
    return [
      planItem('Pagamento extra de dívidas', available * 0.6, 'var(--danger)', 'ti-receipt', 'Acelere a quitação para reduzir juros e liberar renda futura.'),
      planItem('Reserva de emergência', available * 0.25, 'var(--warning)', 'ti-shield', 'Mesmo com dívidas, mantenha algum caixa para evitar novos atrasos.'),
      planItem('Metas ou investimentos', available * 0.15, 'var(--accent)', 'ti-target', 'Use uma parte menor para manter progresso sem prejudicar a quitação.'),
    ];
  }

  if (data.reserveMonths < 3) {
    return [
      planItem('Reserva de emergência', available * 0.5, 'var(--warning)', 'ti-shield', 'Priorize chegar a pelo menos 3 meses de despesas cobertas.'),
      planItem('Dívidas ou antecipações', data.debtBalance > 0 ? available * 0.3 : 0, 'var(--danger)', 'ti-receipt', 'Use esta parte para reduzir saldo devedor, se houver.'),
      planItem(data.openGoals > 0 ? 'Metas financeiras' : 'Investimentos', available * (data.debtBalance > 0 ? 0.2 : 0.5), 'var(--accent)', 'ti-trending-up', 'Direcione o restante para objetivos de crescimento.'),
    ].filter(item => item.value > 0);
  }

  return [
    planItem('Investimentos', available * 0.5, 'var(--accent)', 'ti-trending-up', 'Acelere construção de patrimônio com aportes consistentes.'),
    planItem('Metas financeiras', data.openGoals > 0 ? available * 0.3 : available * 0.2, 'var(--warning)', 'ti-target', 'Reserve parte da margem para objetivos definidos.'),
    planItem('Flexibilidade do mês', data.openGoals > 0 ? available * 0.2 : available * 0.3, 'var(--text-2)', 'ti-wallet', 'Mantenha uma margem para imprevistos, lazer ou oportunidades.'),
  ];
}

function planItem(label: string, value: number, color: string, icon: string, description: string): PlanItem {
  return { label, value, color, icon, description };
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
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

function planRow(item: PlanItem, total: number): string {
  const pct = total > 0 ? (item.value / total) * 100 : 0;
  return `
    <div>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
        <div style="width:34px;height:34px;border-radius:8px;background:${item.color}18;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i class="ti ${item.icon}" style="color:${item.color};font-size:1.05rem"></i>
        </div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;justify-content:space-between;gap:12px">
            <strong>${esc(item.label)}</strong>
            <strong style="color:${item.color}">${formatCurrency(item.value)}</strong>
          </div>
          <div style="font-size:0.78rem;color:var(--text-3);line-height:1.5">${esc(item.description)}</div>
        </div>
      </div>
      <div class="prog-track" style="margin-left:46px;margin-top:0">
        <div class="prog-fill" style="width:${Math.min(pct, 100).toFixed(0)}%;background:${item.color}"></div>
      </div>
    </div>
  `;
}

function insightLine(label: string, value: string, sub: string): string {
  return `
    <div style="display:flex;justify-content:space-between;gap:16px">
      <div>
        <div style="font-weight:500">${label}</div>
        <div style="font-size:0.75rem;color:var(--text-3)">${sub}</div>
      </div>
      <strong style="text-align:right">${value}</strong>
    </div>
  `;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
