import { invoke } from '../api';
import { formatCurrency } from '../../shared/utils';
import { attachMoneyMask, formatMoneyValue, moneyInputValue } from '../components/moneyMask';
import type { Account, InvestmentSummary } from '../../shared/types';

interface ProjectionPoint {
  month: number;
  value: number;
}

export async function render(el: HTMLElement): Promise<void> {
  const [accounts, investments, assets] = await Promise.all([
    invoke<Account[]>('accounts:list'),
    invoke<InvestmentSummary>('investments:getSummary'),
    invoke<{ total: number }>('assets:getSummary'),
  ]);

  let currentAge = 30;
  let retirementAge = 65;
  let lifeExpectancy = 90;
  let initial = accounts.reduce((s, a) => s + a.balance, 0) + investments.total_current + (assets.total ?? 0);
  let monthly = 500;
  let accumRate = 8;
  let retirementRate = 4;
  let desiredIncome = 5000;

  function renderPage(): void {
    const yearsToRetire = Math.max(0, retirementAge - currentAge);
    const yearsInRetirement = Math.max(1, lifeExpectancy - retirementAge);

    const points = project(initial, monthly, accumRate, yearsToRetire);
    const balanceAtRetirement = points[points.length - 1]?.value ?? initial;
    const sustainableIncome = monthlyIncomeFromBalance(balanceAtRetirement, retirementRate, yearsInRetirement);
    const gap = desiredIncome - sustainableIncome;
    const extraMonthly = gap > 0
      ? extraContributionNeeded(desiredIncome, balanceAtRetirement, accumRate, retirementRate, yearsToRetire, yearsInRetirement)
      : 0;

    el.innerHTML = `
      <div class="grid-3" style="margin-bottom:20px">
        ${metricCard('Patrimônio na aposentadoria', formatCurrency(balanceAtRetirement), `aos ${retirementAge} anos`, 'ti-building-bank', 'var(--accent)')}
        ${metricCard('Renda mensal sustentável', formatCurrency(sustainableIncome), `por ${yearsInRetirement} anos, ${retirementRate.toFixed(1)}% a.a.`, 'ti-cash', gap > 0 ? 'var(--danger)' : 'var(--accent)')}
        ${metricCard(gap > 0 ? 'Falta por mês' : 'Margem acima da meta', formatCurrency(Math.abs(gap)), gap > 0 ? 'para atingir a renda desejada' : 'sobre a renda desejada', gap > 0 ? 'ti-alert-triangle' : 'ti-check', gap > 0 ? 'var(--danger)' : 'var(--accent)')}
      </div>

      <div class="grid-2" style="grid-template-columns:.8fr 1.2fr">
        <div class="card">
          <div class="card-header">Cenário</div>
          <div class="card-hr"></div>
          <div class="card-body">
            <div class="form-row">
              ${inputField('Idade atual', 'current-age', currentAge, 1)}
              ${inputField('Idade de aposentadoria', 'retirement-age', retirementAge, 1)}
            </div>
            ${inputField('Expectativa de vida (anos)', 'life-expectancy', lifeExpectancy, 1)}
            ${moneyField('Patrimônio atual', 'initial', initial)}
            ${moneyField('Aporte mensal', 'monthly', monthly)}
            ${inputField('Rendimento anual até se aposentar (%)', 'accum-rate', accumRate, 0.5)}
            ${inputField('Rendimento anual na aposentadoria (%)', 'retirement-rate', retirementRate, 0.5)}
            ${moneyField('Renda mensal desejada', 'desired-income', desiredIncome)}
            <button class="btn btn-primary" id="btn-simulate" style="width:100%;justify-content:center;margin-top:4px">
              <i class="ti ti-calculator"></i> Simular
            </button>
          </div>
        </div>

        <div class="card">
          <div class="card-header">Acúmulo até a aposentadoria</div>
          <div class="card-hr"></div>
          <div class="card-body">
            ${chart(points)}
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px">
              ${miniMetric('Hoje', initial)}
              ${miniMetric(`Metade (${Math.round(yearsToRetire / 2)} anos)`, valueAt(points, Math.round(yearsToRetire * 6)))}
              ${miniMetric(`Aposentadoria (${yearsToRetire} anos)`, balanceAtRetirement)}
            </div>
            ${gap > 0 ? `
              <div class="empty" style="margin-top:16px;padding:16px">
                <p style="margin:0">Para chegar a ${formatCurrency(desiredIncome)}/mês na aposentadoria, aumente o aporte mensal em <strong>${formatCurrency(extraMonthly)}</strong>, chegando a ${formatCurrency(monthly + extraMonthly)}/mês.</p>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;

    attachMoneyMask(el.querySelector('#initial'));
    attachMoneyMask(el.querySelector('#monthly'));
    attachMoneyMask(el.querySelector('#desired-income'));

    el.querySelector('#btn-simulate')?.addEventListener('click', () => {
      currentAge = Math.max(0, Math.round(readNumber(el, 'current-age', currentAge)));
      retirementAge = Math.max(currentAge, Math.round(readNumber(el, 'retirement-age', retirementAge)));
      lifeExpectancy = Math.max(retirementAge + 1, Math.round(readNumber(el, 'life-expectancy', lifeExpectancy)));
      initial = readMoney(el, 'initial', initial);
      monthly = readMoney(el, 'monthly', monthly);
      accumRate = readNumber(el, 'accum-rate', accumRate);
      retirementRate = readNumber(el, 'retirement-rate', retirementRate);
      desiredIncome = readMoney(el, 'desired-income', desiredIncome);
      renderPage();
    });
  }

  renderPage();
}

function project(initial: number, monthly: number, annualRate: number, years: number): ProjectionPoint[] {
  const monthlyRate = Math.pow(1 + annualRate / 100, 1 / 12) - 1;
  const points: ProjectionPoint[] = [{ month: 0, value: initial }];
  let value = initial;
  for (let month = 1; month <= years * 12; month++) {
    value = value * (1 + monthlyRate) + monthly;
    points.push({ month, value });
  }
  return points;
}

// Renda mensal que um saldo sustenta ao longo de `years`, considerando que o
// saldo remanescente continua rendendo `annualRate` ao ano (amortização tipo
// "Price"), até se esgotar no fim do período — não é uma renda perpétua.
function monthlyIncomeFromBalance(balance: number, annualRate: number, years: number): number {
  const monthlyRate = Math.pow(1 + annualRate / 100, 1 / 12) - 1;
  const months = years * 12;
  if (monthlyRate <= 0) return balance / months;
  return (balance * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));
}

// Aporte mensal extra necessário durante o acúmulo para que o patrimônio na
// aposentadoria sustente a renda mensal desejada.
function extraContributionNeeded(
  desiredIncome: number,
  currentProjectedBalance: number,
  accumRate: number,
  retirementRate: number,
  yearsToRetire: number,
  yearsInRetirement: number,
): number {
  const retirementMonthlyRate = Math.pow(1 + retirementRate / 100, 1 / 12) - 1;
  const retirementMonths = yearsInRetirement * 12;
  const requiredBalance = retirementMonthlyRate <= 0
    ? desiredIncome * retirementMonths
    : desiredIncome * (1 - Math.pow(1 + retirementMonthlyRate, -retirementMonths)) / retirementMonthlyRate;

  const shortfall = requiredBalance - currentProjectedBalance;
  if (shortfall <= 0 || yearsToRetire <= 0) return 0;

  const accumMonthlyRate = Math.pow(1 + accumRate / 100, 1 / 12) - 1;
  const accumMonths = yearsToRetire * 12;
  const fvAnnuityFactor = accumMonthlyRate <= 0
    ? accumMonths
    : (Math.pow(1 + accumMonthlyRate, accumMonths) - 1) / accumMonthlyRate;

  return shortfall / fvAnnuityFactor;
}

function chart(points: ProjectionPoint[]): string {
  const width = 720;
  const height = 220;
  const pad = 18;
  const max = Math.max(...points.map(p => p.value), 1);
  const lastMonth = Math.max(points[points.length - 1]?.month ?? 1, 1);
  const path = points.map((p, i) => {
    const x = pad + (p.month / lastMonth) * (width - pad * 2);
    const y = height - pad - (p.value / max) * (height - pad * 2);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return `
    <svg viewBox="0 0 ${width} ${height}" style="width:100%;height:auto;display:block">
      <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="var(--border)" />
      <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="var(--border)" />
      <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="${width - pad}" cy="${height - pad - ((points[points.length - 1]?.value ?? 0) / max) * (height - pad * 2)}" r="4" fill="var(--accent)" />
    </svg>
  `;
}

function inputField(label: string, id: string, value: number, step: number): string {
  return `
    <div class="form-group">
      <label class="form-label">${label}</label>
      <input class="form-ctrl" id="${id}" type="number" step="${step}" value="${value}">
    </div>
  `;
}

function moneyField(label: string, id: string, value: number): string {
  return `
    <div class="form-group">
      <label class="form-label">${label}</label>
      <input class="form-ctrl" id="${id}" type="text" inputmode="decimal" value="${formatMoneyValue(value)}">
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

function miniMetric(label: string, value: number): string {
  return `
    <div style="background:var(--bg);border:0.5px solid var(--border);border-radius:8px;padding:10px">
      <div style="font-size:0.72rem;color:var(--text-3);margin-bottom:3px">${label}</div>
      <div style="font-weight:700">${formatCurrency(value)}</div>
    </div>
  `;
}

function valueAt(points: ProjectionPoint[], month: number): number {
  return points[Math.min(Math.max(month, 0), points.length - 1)]?.value ?? 0;
}

function readNumber(root: HTMLElement, id: string, fallback: number): number {
  const value = parseFloat(root.querySelector<HTMLInputElement>(`#${id}`)?.value ?? '');
  return isNaN(value) ? fallback : value;
}

function readMoney(root: HTMLElement, id: string, fallback: number): number {
  const value = moneyInputValue(root.querySelector<HTMLInputElement>(`#${id}`));
  return isNaN(value) ? fallback : value;
}
