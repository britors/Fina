import { invoke } from '../api';
import { formatCurrency } from '../../shared/utils';
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

  let initial = accounts.reduce((s, a) => s + a.balance, 0) + investments.total_current + (assets.total ?? 0);
  let monthly = 500;
  let annualRate = 8;
  let years = 10;

  function renderPage(): void {
    const points = project(initial, monthly, annualRate, years);
    const finalValue = points[points.length - 1]?.value ?? initial;
    const totalContributed = initial + monthly * years * 12;
    const gain = finalValue - totalContributed;

    el.innerHTML = `
      <div class="grid-3" style="margin-bottom:20px">
        ${metricCard('Patrimônio projetado', formatCurrency(finalValue), `${years} anos`, 'ti-trending-up', 'var(--accent)')}
        ${metricCard('Aportes totais', formatCurrency(monthly * years * 12), `${formatCurrency(monthly)}/mês`, 'ti-pig-money', 'var(--warning)')}
        ${metricCard('Ganho estimado', `${gain >= 0 ? '+' : ''}${formatCurrency(gain)}`, `${annualRate.toFixed(1)}% ao ano`, 'ti-chart-line', gain >= 0 ? 'var(--accent)' : 'var(--danger)')}
      </div>

      <div class="grid-2" style="grid-template-columns:.8fr 1.2fr">
        <div class="card">
          <div class="card-header">Cenário</div>
          <div class="card-hr"></div>
          <div class="card-body">
            ${inputField('Patrimônio inicial', 'initial', initial, 100)}
            ${inputField('Aporte mensal', 'monthly', monthly, 50)}
            ${inputField('Rendimento anual (%)', 'rate', annualRate, 0.5)}
            ${inputField('Prazo (anos)', 'years', years, 1)}
            <button class="btn btn-primary" id="btn-simulate" style="width:100%;justify-content:center;margin-top:4px">
              <i class="ti ti-calculator"></i> Simular
            </button>
          </div>
        </div>

        <div class="card">
          <div class="card-header">Evolução projetada</div>
          <div class="card-hr"></div>
          <div class="card-body">
            ${chart(points)}
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px">
              ${miniMetric('Ano 1', valueAt(points, 12))}
              ${miniMetric('Metade', valueAt(points, Math.round(years * 6)))}
              ${miniMetric('Final', finalValue)}
            </div>
          </div>
        </div>
      </div>
    `;

    el.querySelector('#btn-simulate')?.addEventListener('click', () => {
      initial = readNumber(el, 'initial', initial);
      monthly = readNumber(el, 'monthly', monthly);
      annualRate = readNumber(el, 'rate', annualRate);
      years = Math.max(1, Math.round(readNumber(el, 'years', years)));
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
