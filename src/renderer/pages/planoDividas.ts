import { invoke } from '../api';
import { formatCurrency } from '../../shared/utils';
import { attachMoneyMask, formatMoneyValue, moneyInputValue } from '../components/moneyMask';
import type { Debt } from '../../shared/types';

type Strategy = 'avalanche' | 'snowball';

interface SimDebt {
  id: string;
  description: string;
  balance: number;
  rate: number;
  minPayment: number;
}

interface Simulation {
  strategy: Strategy;
  months: number;
  totalPaid: number;
  totalInterest: number;
  order: SimDebt[];
  possible: boolean;
}

export async function render(el: HTMLElement): Promise<void> {
  const debts = (await invoke<Debt[]>('debts:list')).filter(d => d.status !== 'quitada' && d.outstanding_balance > 0);
  let extraPayment = 0;

  async function renderPage(): Promise<void> {
    if (debts.length === 0) {
      el.innerHTML = `
        <div class="empty">
          <i class="ti ti-circle-check"></i>
          <div class="empty-title">Nenhuma dívida ativa</div>
          <p>Quando houver dívidas cadastradas, o Fina poderá montar um plano de quitação.</p>
          <a class="btn btn-primary" href="#debts"><i class="ti ti-plus"></i> Cadastrar dívida</a>
        </div>
      `;
      return;
    }

    const base = simulate(debts, 0, 'avalanche');
    const avalanche = simulate(debts, extraPayment, 'avalanche');
    const snowball = simulate(debts, extraPayment, 'snowball');
    const best = pickBest(avalanche, snowball);
    const totalDebt = debts.reduce((s, d) => s + d.outstanding_balance, 0);
    const monthlyMinimum = debts.reduce((s, d) => s + Math.max(0, d.installment_amount), 0);
    const interestSavings = base.possible && best.possible ? Math.max(0, base.totalInterest - best.totalInterest) : 0;
    const monthsSaved = base.possible && best.possible ? Math.max(0, base.months - best.months) : 0;

    el.innerHTML = `
      <div class="grid-3" style="margin-bottom:20px">
        ${metricCard('Total em dívidas', formatCurrency(totalDebt), `${debts.length} dívida${debts.length !== 1 ? 's' : ''} ativa${debts.length !== 1 ? 's' : ''}`, 'ti-receipt', 'var(--danger)')}
        ${metricCard('Parcelas mínimas', formatCurrency(monthlyMinimum), 'Compromisso mensal atual', 'ti-calendar-dollar', 'var(--warning)')}
        ${metricCard('Economia projetada', formatCurrency(interestSavings), `${monthsSaved} mês${monthsSaved !== 1 ? 'es' : ''} antes`, 'ti-pig-money', 'var(--accent)')}
      </div>

      <div class="card" style="margin-bottom:20px">
        <div class="card-header">Pagamento extra mensal</div>
        <div class="card-hr"></div>
        <div class="card-body" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <input class="form-ctrl" id="extra-payment" type="text" inputmode="decimal" value="${formatMoneyValue(extraPayment)}" style="max-width:180px">
          <button class="btn btn-primary" id="btn-recalc"><i class="ti ti-calculator"></i> Recalcular</button>
          <span style="font-size:0.82rem;color:var(--text-3)">Esse valor é direcionado para a dívida prioritária de cada estratégia.</span>
        </div>
      </div>

      <div class="grid-2" style="grid-template-columns:1fr 1fr;margin-bottom:20px">
        ${strategyCard(avalanche, base)}
        ${strategyCard(snowball, base)}
      </div>

      <div class="card">
        <div class="card-header">
          <span>Ordem recomendada</span>
          <span class="badge badge-confirmed">${best.strategy === 'avalanche' ? 'Maior juros primeiro' : 'Menor dívida primeiro'}</span>
        </div>
        <div class="card-hr"></div>
        <table class="table">
          <thead>
            <tr>
              <th>PRIORIDADE</th>
              <th>DÍVIDA</th>
              <th style="text-align:right">SALDO</th>
              <th style="text-align:right">JUROS/MÊS</th>
              <th style="text-align:right">PARCELA</th>
            </tr>
          </thead>
          <tbody>
            ${best.order.map((d, i) => `
              <tr>
                <td><span class="badge badge-ok">${i + 1}</span></td>
                <td style="font-weight:500">${esc(d.description)}</td>
                <td style="text-align:right;color:var(--danger)">${formatCurrency(d.balance)}</td>
                <td style="text-align:right;color:var(--warning)">${d.rate.toFixed(2)}%</td>
                <td style="text-align:right">${formatCurrency(d.minPayment)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    attachMoneyMask(el.querySelector('#extra-payment'));
    el.querySelector('#btn-recalc')?.addEventListener('click', () => {
      const value = moneyInputValue(el.querySelector<HTMLInputElement>('#extra-payment'));
      extraPayment = isNaN(value) ? 0 : Math.max(0, value);
      renderPage();
    });
    el.querySelector<HTMLInputElement>('#extra-payment')?.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const value = moneyInputValue(e.target as HTMLInputElement);
      extraPayment = isNaN(value) ? 0 : Math.max(0, value);
      renderPage();
    });
  }

  await renderPage();
}

function simulate(source: Debt[], extraPayment: number, strategy: Strategy): Simulation {
  const order = normalize(source).sort((a, b) => {
    if (strategy === 'avalanche') return b.rate - a.rate || a.balance - b.balance;
    return a.balance - b.balance || b.rate - a.rate;
  });
  const debts = order.map(d => ({ ...d }));
  let months = 0;
  let totalPaid = 0;
  let totalInterest = 0;
  const maxMonths = 600;

  while (debts.some(d => d.balance > 0.01) && months < maxMonths) {
    months++;

    for (const debt of debts) {
      if (debt.balance <= 0.01) continue;
      const interest = debt.balance * (debt.rate / 100);
      debt.balance += interest;
      totalInterest += interest;
    }

    for (const debt of debts) {
      if (debt.balance <= 0.01) continue;
      const payment = Math.min(debt.balance, debt.minPayment);
      debt.balance -= payment;
      totalPaid += payment;
    }

    let remainingExtra = extraPayment;
    for (const debt of debts) {
      if (remainingExtra <= 0.01) break;
      if (debt.balance <= 0.01) continue;
      const payment = Math.min(debt.balance, remainingExtra);
      debt.balance -= payment;
      totalPaid += payment;
      remainingExtra -= payment;
      if (debt.balance > 0.01) break;
    }

    if (debts.some(d => d.balance > 0.01 && d.minPayment <= 0 && extraPayment <= 0)) {
      return { strategy, months, totalPaid, totalInterest, order, possible: false };
    }
  }

  return {
    strategy,
    months,
    totalPaid,
    totalInterest,
    order,
    possible: months < maxMonths,
  };
}

function normalize(debts: Debt[]): SimDebt[] {
  return debts.map(d => ({
    id: d.id,
    description: d.description,
    balance: Math.max(0, d.outstanding_balance),
    rate: Math.max(0, d.interest_rate),
    minPayment: Math.max(0, d.installment_amount),
  }));
}

function pickBest(a: Simulation, b: Simulation): Simulation {
  if (!a.possible) return b;
  if (!b.possible) return a;
  if (a.totalInterest !== b.totalInterest) return a.totalInterest < b.totalInterest ? a : b;
  return a.months <= b.months ? a : b;
}

function strategyCard(sim: Simulation, base: Simulation): string {
  const title = sim.strategy === 'avalanche' ? 'Maior juros primeiro' : 'Menor dívida primeiro';
  const icon = sim.strategy === 'avalanche' ? 'ti-percentage' : 'ti-list-numbers';
  const sub = sim.strategy === 'avalanche'
    ? 'Prioriza a dívida com maior taxa para reduzir juros.'
    : 'Prioriza menor saldo para gerar vitórias rápidas.';
  const savings = base.possible && sim.possible ? Math.max(0, base.totalInterest - sim.totalInterest) : 0;
  const months = sim.possible ? `${sim.months} meses` : 'Não quitada';

  return `
    <div class="card">
      <div class="card-header">
        <span style="display:flex;align-items:center;gap:8px"><i class="ti ${icon}" style="color:var(--accent)"></i> ${title}</span>
      </div>
      <div class="card-hr"></div>
      <div class="card-body">
        <div style="font-size:0.82rem;color:var(--text-3);line-height:1.5;margin-bottom:16px">${sub}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          ${miniMetric('Prazo', months, 'var(--text)')}
          ${miniMetric('Juros', formatCurrency(sim.totalInterest), 'var(--danger)')}
          ${miniMetric('Total pago', formatCurrency(sim.totalPaid), 'var(--text)')}
          ${miniMetric('Economia', formatCurrency(savings), 'var(--accent)')}
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

function miniMetric(label: string, value: string, color: string): string {
  return `
    <div style="background:var(--bg);border:0.5px solid var(--border);border-radius:8px;padding:12px">
      <div style="font-size:0.72rem;color:var(--text-3);margin-bottom:4px">${label}</div>
      <div style="font-size:1rem;font-weight:700;color:${color}">${value}</div>
    </div>
  `;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
