import { invoke } from '../api';
import { formatCurrency } from '../../shared/utils';
import type { Account, Debt, InvestmentSummary } from '../../shared/types';

type MonthRow = { label: string; income: number; expense: number };

type DiagnosisLevel = 'critical' | 'warning' | 'stable' | 'growth';

interface Diagnosis {
  level: DiagnosisLevel;
  title: string;
  description: string;
  color: string;
}

export async function render(el: HTMLElement): Promise<void> {
  el.innerHTML = '<div class="loading"><i class="ti ti-loader-2"></i> Calculando diagnóstico...</div>';

  const [accounts, history, debts, investments, assets] = await Promise.all([
    invoke<Account[]>('accounts:list'),
    invoke<MonthRow[]>('transactions:getMonthlyHistory', 3),
    invoke<Debt[]>('debts:list'),
    invoke<InvestmentSummary>('investments:getSummary'),
    invoke<{ total: number }>('assets:getSummary'),
  ]);

  const avgIncome = avg(history.map(r => r.income));
  const avgExpense = avg(history.map(r => r.expense));
  const monthlyBalance = avgIncome - avgExpense;
  const liquidBalance = accounts.filter(a => a.type !== 'credit_card').reduce((s, a) => s + a.balance, 0);
  const creditCardDebt = accounts.filter(a => a.type === 'credit_card').reduce((s, a) => s + a.balance, 0);
  const activeDebts = debts.filter(d => d.status !== 'quitada');
  const debtBalance = activeDebts.reduce((s, d) => s + d.outstanding_balance, 0) + creditCardDebt;
  const debtInstallments = activeDebts.reduce((s, d) => s + d.installment_amount, 0);
  const debtCommitment = avgIncome > 0 ? (debtInstallments / avgIncome) * 100 : 0;
  const savingsRate = avgIncome > 0 ? (monthlyBalance / avgIncome) * 100 : 0;
  const reserveMonths = avgExpense > 0 ? liquidBalance / avgExpense : 0;
  const netWorth = liquidBalance + investments.total_current + (assets.total ?? 0) - debtBalance;
  const diagnosis = diagnose(avgIncome, monthlyBalance, debtCommitment, savingsRate, reserveMonths);
  const recommendations = buildRecommendations({
    avgIncome,
    avgExpense,
    monthlyBalance,
    debtCommitment,
    debtBalance,
    savingsRate,
    reserveMonths,
    liquidBalance,
    investmentsTotal: investments.total_current,
  });

  el.innerHTML = `
    <div class="card" style="margin-bottom:20px;overflow:hidden">
      <div style="display:grid;grid-template-columns:1.1fr 1.4fr;min-height:180px">
        <div style="padding:24px;background:${diagnosis.color}18;border-right:0.5px solid var(--border)">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
            <div style="width:42px;height:42px;border-radius:10px;background:${diagnosis.color}22;display:flex;align-items:center;justify-content:center">
              <i class="ti ${diagnosisIcon(diagnosis.level)}" style="font-size:1.3rem;color:${diagnosis.color}"></i>
            </div>
            <div>
              <div style="font-size:0.75rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.08em">Diagnóstico</div>
              <div style="font-size:1.35rem;font-weight:700;color:${diagnosis.color}">${diagnosis.title}</div>
            </div>
          </div>
          <p style="font-size:0.9rem;color:var(--text-2);line-height:1.6;margin:0">${diagnosis.description}</p>
        </div>
        <div style="padding:24px">
          <div style="font-size:0.78rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px">Próximos passos sugeridos</div>
          <div style="display:flex;flex-direction:column;gap:10px">
            ${recommendations.slice(0, 4).map((r, i) => `
              <div style="display:flex;gap:10px;align-items:flex-start">
                <div style="width:22px;height:22px;border-radius:50%;background:var(--bg);border:0.5px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:0.72rem;color:var(--text-2);flex-shrink:0">${i + 1}</div>
                <div>
                  <div style="font-weight:600;font-size:0.88rem">${esc(r.title)}</div>
                  <div style="font-size:0.78rem;color:var(--text-3);line-height:1.5">${esc(r.body)}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>

    <div class="grid-3" style="margin-bottom:20px">
      ${metricCard('Renda média', formatCurrency(avgIncome), 'Últimos 3 meses', 'ti-arrow-up-right', 'var(--accent)')}
      ${metricCard('Despesa média', formatCurrency(avgExpense), 'Últimos 3 meses', 'ti-arrow-down-right', 'var(--danger)')}
      ${metricCard('Saldo mensal', `${monthlyBalance >= 0 ? '+' : ''}${formatCurrency(monthlyBalance)}`, 'Renda menos despesas', 'ti-scale', monthlyBalance >= 0 ? 'var(--accent)' : 'var(--danger)')}
    </div>

    <div class="grid-3" style="margin-bottom:20px">
      ${metricCard('Comprometido com dívidas', `${debtCommitment.toFixed(0)}%`, `${formatCurrency(debtInstallments)}/mês`, 'ti-receipt', debtCommitment > 35 ? 'var(--danger)' : debtCommitment > 20 ? 'var(--warning)' : 'var(--accent)')}
      ${metricCard('Reserva estimada', `${reserveMonths.toFixed(1)} meses`, `${formatCurrency(liquidBalance)} em contas`, 'ti-shield', reserveMonths < 1 ? 'var(--danger)' : reserveMonths < 3 ? 'var(--warning)' : 'var(--accent)')}
      ${metricCard('Patrimônio líquido', formatCurrency(netWorth), 'Contas + bens + investimentos - dívidas', 'ti-building-bank', netWorth >= 0 ? 'var(--accent)' : 'var(--danger)')}
    </div>

    <div class="grid-2" style="grid-template-columns:1.2fr .8fr">
      <div class="card">
        <div class="card-header">Indicadores do diagnóstico</div>
        <div class="card-hr"></div>
        <div class="card-body" style="display:flex;flex-direction:column;gap:14px">
          ${progressRow('Taxa de sobra mensal', savingsRate, savingsRate >= 20 ? 'var(--accent)' : savingsRate >= 5 ? 'var(--warning)' : 'var(--danger)', 'Quanto da renda sobra após despesas.')}
          ${progressRow('Comprometimento com dívidas', debtCommitment, debtCommitment <= 20 ? 'var(--accent)' : debtCommitment <= 35 ? 'var(--warning)' : 'var(--danger)', 'Quanto da renda vai para parcelas de dívidas.')}
          ${progressRow('Reserva sobre 3 meses', Math.min((reserveMonths / 3) * 100, 100), reserveMonths >= 3 ? 'var(--accent)' : reserveMonths >= 1 ? 'var(--warning)' : 'var(--danger)', 'Quanto você já cobre de uma reserva mínima de 3 meses.')}
        </div>
      </div>

      <div class="card">
        <div class="card-header">Resumo patrimonial</div>
        <div class="card-hr"></div>
        <div class="card-body" style="display:flex;flex-direction:column;gap:12px">
          ${summaryLine('Saldo em contas', liquidBalance, 'var(--accent)')}
          ${summaryLine('Investimentos', investments.total_current, 'var(--accent)')}
          ${summaryLine('Bens', assets.total ?? 0, 'var(--accent)')}
          ${summaryLine('Dívidas', debtBalance, 'var(--danger)', true)}
          <div style="height:0.5px;background:var(--border);margin:2px 0"></div>
          ${summaryLine('Patrimônio líquido', netWorth, netWorth >= 0 ? 'var(--accent)' : 'var(--danger)')}
        </div>
      </div>
    </div>
  `;
}

function diagnose(
  avgIncome: number,
  monthlyBalance: number,
  debtCommitment: number,
  savingsRate: number,
  reserveMonths: number,
): Diagnosis {
  if (avgIncome <= 0) {
    return {
      level: 'warning',
      title: 'Atenção',
      description: 'Ainda não há renda suficiente registrada para um diagnóstico completo. Comece mantendo receitas e despesas atualizadas.',
      color: 'var(--warning)',
    };
  }

  if (monthlyBalance < 0 || debtCommitment > 50) {
    return {
      level: 'critical',
      title: 'Crítico',
      description: 'Sua situação exige ação imediata: as despesas superam a renda ou as dívidas estão consumindo uma parte alta demais do orçamento.',
      color: 'var(--danger)',
    };
  }

  if (debtCommitment > 35 || savingsRate < 5 || reserveMonths < 1) {
    return {
      level: 'warning',
      title: 'Atenção',
      description: 'Há margem para melhorar. O foco deve ser reduzir riscos, criar sobra mensal e proteger o orçamento contra imprevistos.',
      color: 'var(--warning)',
    };
  }

  if (savingsRate >= 20 && reserveMonths >= 3 && debtCommitment <= 20) {
    return {
      level: 'growth',
      title: 'Crescimento',
      description: 'Você tem boa sobra mensal, reserva mais sólida e dívidas controladas. O próximo passo é acelerar metas e patrimônio.',
      color: 'var(--accent)',
    };
  }

  return {
    level: 'stable',
    title: 'Estável',
    description: 'Sua situação está controlada, mas ainda existe espaço para fortalecer reserva, reduzir dívidas ou aumentar investimentos.',
    color: 'var(--accent)',
  };
}

function buildRecommendations(data: {
  avgIncome: number;
  avgExpense: number;
  monthlyBalance: number;
  debtCommitment: number;
  debtBalance: number;
  savingsRate: number;
  reserveMonths: number;
  liquidBalance: number;
  investmentsTotal: number;
}): { title: string; body: string }[] {
  const recs: { title: string; body: string }[] = [];

  if (data.avgIncome <= 0) {
    recs.push({
      title: 'Registre suas receitas',
      body: 'Cadastre salários, freelas ou outras entradas para o Fina entender sua renda real.',
    });
  }

  if (data.monthlyBalance < 0) {
    recs.push({
      title: 'Corrija o saldo mensal',
      body: `Você está gastando cerca de ${formatCurrency(Math.abs(data.monthlyBalance))} a mais do que recebe. Revise despesas variáveis primeiro.`,
    });
  }

  if (data.debtCommitment > 35) {
    recs.push({
      title: 'Priorize dívidas caras',
      body: 'As parcelas estão consumindo uma parte alta da renda. Use a tela Dívidas para simular pagamentos extras.',
    });
  }

  if (data.reserveMonths < 1 && data.avgExpense > 0) {
    recs.push({
      title: 'Comece uma reserva mínima',
      body: `Busque pelo menos 1 mês de despesas guardado. Pela sua média, isso equivale a ${formatCurrency(data.avgExpense)}.`,
    });
  } else if (data.reserveMonths < 3 && data.avgExpense > 0) {
    recs.push({
      title: 'Fortaleça sua reserva',
      body: `Para chegar a 3 meses de despesas, a reserva estimada deveria estar perto de ${formatCurrency(data.avgExpense * 3)}.`,
    });
  }

  if (data.savingsRate >= 10 && data.debtBalance <= 0 && data.investmentsTotal <= 0) {
    recs.push({
      title: 'Comece a investir',
      body: 'Você tem sobra mensal e não há dívidas relevantes registradas. Avalie criar uma rotina de aportes.',
    });
  }

  if (recs.length === 0) {
    recs.push({
      title: 'Mantenha a consistência',
      body: 'Continue registrando transações e acompanhando orçamento para preservar sua evolução financeira.',
    });
  }

  recs.push({
    title: 'Revise este diagnóstico todo mês',
    body: 'O diagnóstico fica mais útil quando receitas, despesas, dívidas e investimentos estão atualizados.',
  });

  return recs;
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function diagnosisIcon(level: DiagnosisLevel): string {
  const icons: Record<DiagnosisLevel, string> = {
    critical: 'ti-alert-triangle',
    warning: 'ti-alert-circle',
    stable: 'ti-circle-check',
    growth: 'ti-trending-up',
  };
  return icons[level];
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

function progressRow(label: string, value: number, color: string, help: string): string {
  const pct = Math.max(0, Math.min(value, 100));
  return `
    <div>
      <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:6px">
        <div>
          <div style="font-weight:500">${label}</div>
          <div style="font-size:0.75rem;color:var(--text-3)">${help}</div>
        </div>
        <div style="font-weight:600;color:${color}">${value.toFixed(0)}%</div>
      </div>
      <div class="prog-track" style="margin:0">
        <div class="prog-fill" style="width:${pct.toFixed(0)}%;background:${color}"></div>
      </div>
    </div>
  `;
}

function summaryLine(label: string, value: number, color: string, negative = false): string {
  return `
    <div style="display:flex;justify-content:space-between;gap:12px">
      <span style="color:var(--text-3)">${label}</span>
      <strong style="color:${color}">${negative ? '-' : ''}${formatCurrency(value)}</strong>
    </div>
  `;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
