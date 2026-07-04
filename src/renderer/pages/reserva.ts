import { invoke } from '../api';
import { formatCurrency, isCreditLikeAccountType } from '../../shared/utils';
import type { Account } from '../../shared/types';

type MonthRow = { label: string; income: number; expense: number };

export async function render(el: HTMLElement): Promise<void> {
  let targetMonths = 6;
  const [accounts, history] = await Promise.all([
    invoke<Account[]>('accounts:list'),
    invoke<MonthRow[]>('transactions:getMonthlyHistory', 3),
  ]);

  const liquidBalance = accounts.filter(a => !isCreditLikeAccountType(a.type)).reduce((s, a) => s + a.balance, 0);
  const avgExpense = avg(history.map(r => r.expense));

  function renderPage(): void {
    const targetAmount = avgExpense * targetMonths;
    const missing = Math.max(0, targetAmount - liquidBalance);
    const progress = targetAmount > 0 ? Math.min(100, (liquidBalance / targetAmount) * 100) : 0;
    const monthly3 = missing / 3;
    const monthly6 = missing / 6;
    const monthly12 = missing / 12;

    el.innerHTML = `
      <div class="grid-3" style="margin-bottom:20px">
        ${metricCard('Despesa média', formatCurrency(avgExpense), 'Últimos 3 meses', 'ti-arrow-down-right', 'var(--danger)')}
        ${metricCard('Saldo em meios de pagamento', formatCurrency(liquidBalance), 'Meios sem crédito/vales', 'ti-wallet', 'var(--accent)')}
        ${metricCard('Reserva ideal', formatCurrency(targetAmount), `${targetMonths} meses de despesas`, 'ti-shield', 'var(--warning)')}
      </div>

      <div class="card" style="margin-bottom:20px">
        <div class="card-header">Objetivo de reserva</div>
        <div class="card-hr"></div>
        <div class="card-body">
          <div class="filters" style="margin-bottom:18px">
            ${[3, 6, 12].map(months => `
              <span class="chip ${targetMonths === months ? 'active' : ''}" data-months="${months}">
                ${months} meses
              </span>
            `).join('')}
          </div>

          <div style="display:flex;justify-content:space-between;gap:16px;margin-bottom:8px">
            <div>
              <div style="font-size:1.05rem;font-weight:600">${progress.toFixed(0)}% concluído</div>
              <div style="font-size:0.8rem;color:var(--text-3)">Faltam ${formatCurrency(missing)} para a reserva de ${targetMonths} meses.</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:0.78rem;color:var(--text-3)">Atual / Ideal</div>
              <div style="font-weight:700">${formatCurrency(liquidBalance)} / ${formatCurrency(targetAmount)}</div>
            </div>
          </div>
          <div class="prog-track" style="height:12px;margin-top:0">
            <div class="prog-fill" style="width:${progress.toFixed(0)}%;background:${progress >= 100 ? 'var(--accent)' : progress >= 50 ? 'var(--warning)' : 'var(--danger)'}"></div>
          </div>
        </div>
      </div>

      <div class="grid-2" style="grid-template-columns:1fr 1fr">
        <div class="card">
          <div class="card-header">Contribuição necessária</div>
          <div class="card-hr"></div>
          <div class="card-body" style="display:flex;flex-direction:column;gap:12px">
            ${contributionRow('Em 3 meses', monthly3)}
            ${contributionRow('Em 6 meses', monthly6)}
            ${contributionRow('Em 12 meses', monthly12)}
          </div>
        </div>

        <div class="card">
          <div class="card-header">Como interpretar</div>
          <div class="card-hr"></div>
          <div class="card-body" style="color:var(--text-2);line-height:1.7;font-size:0.88rem">
            ${avgExpense <= 0 ? `
              <p style="margin:0 0 10px">Ainda não há despesas suficientes para calcular uma reserva realista.</p>
              <p style="margin:0">Registre suas despesas por algumas semanas e volte a consultar esta tela.</p>
            ` : `
              <p style="margin:0 0 10px">A reserva é calculada a partir da sua média de despesas dos últimos 3 meses.</p>
              <p style="margin:0 0 10px">Use 3 meses como ponto de partida, 6 meses como objetivo equilibrado e 12 meses para uma proteção mais conservadora.</p>
              <p style="margin:0">O saldo em meios de pagamento é usado como aproximação do dinheiro disponível para emergências.</p>
            `}
          </div>
        </div>
      </div>
    `;

    el.querySelectorAll<HTMLElement>('[data-months]').forEach(chip => {
      chip.addEventListener('click', () => {
        targetMonths = parseInt(chip.dataset.months!, 10);
        renderPage();
      });
    });
  }

  renderPage();
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

function contributionRow(label: string, value: number): string {
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;background:var(--bg);border:0.5px solid var(--border);border-radius:8px;padding:12px 14px">
      <span style="color:var(--text-2)">${label}</span>
      <strong style="color:${value > 0 ? 'var(--accent)' : 'var(--text-3)'}">${formatCurrency(Math.max(0, value))}/mês</strong>
    </div>
  `;
}
