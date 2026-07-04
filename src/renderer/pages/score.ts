import { invoke } from '../api';
import { formatCurrency, isCreditLikeAccountType } from '../../shared/utils';
import type { Account, BudgetWithProgress, Category, Debt } from '../../shared/types';

type MonthRow = { label: string; income: number; expense: number };
type CategoryExpense = { name: string; color: string; total: number; kind?: string };

interface ScoreItem {
  label: string;
  value: number;
  max: number;
  detail: string;
}

export async function render(el: HTMLElement): Promise<void> {
  el.innerHTML = '<div class="loading"><i class="ti ti-loader-2"></i> Calculando score...</div>';

  const now = new Date();
  const current = { month: now.getMonth() + 1, year: now.getFullYear() };
  const [history, accounts, debts, budgets, categories, expenses] = await Promise.all([
    invoke<MonthRow[]>('transactions:getMonthlyHistory', 3),
    invoke<Account[]>('accounts:list'),
    invoke<Debt[]>('debts:list'),
    invoke<BudgetWithProgress[]>('budgets:list', current),
    invoke<Category[]>('categories:list'),
    invoke<CategoryExpense[]>('transactions:getExpensesByCategory', current),
  ]);

  const avgIncome = avg(history.map(h => h.income));
  const avgExpense = avg(history.map(h => h.expense));
  const monthlyBalance = avgIncome - avgExpense;
  const liquidBalance = accounts.filter(a => !isCreditLikeAccountType(a.type)).reduce((sum, a) => sum + a.balance, 0);
  const reserveMonths = avgExpense > 0 ? liquidBalance / avgExpense : 0;
  const activeDebts = debts.filter(d => d.status !== 'quitada');
  const debtInstallments = activeDebts.reduce((sum, d) => sum + d.installment_amount, 0);
  const debtCommitment = avgIncome > 0 ? debtInstallments / avgIncome : 0;
  const savingsRate = avgIncome > 0 ? monthlyBalance / avgIncome : 0;
  const overBudgets = budgets.filter(b => b.percentage >= 100).length;
  const categoryKind = new Map(categories.map(c => [c.name, c.kind]));
  const essential = expenses.filter(e => categoryKind.get(e.name) === 'essential').reduce((sum, e) => sum + e.total, 0);
  const variable = expenses.filter(e => categoryKind.get(e.name) !== 'essential').reduce((sum, e) => sum + e.total, 0);
  const variableShare = avgExpense > 0 ? variable / avgExpense : 0;

  const items: ScoreItem[] = [
    {
      label: 'Sobra mensal',
      value: clampScore(savingsRate / 0.2, 25),
      max: 25,
      detail: `${(savingsRate * 100).toFixed(0)}% da renda média`,
    },
    {
      label: 'Reserva',
      value: clampScore(reserveMonths / 6, 25),
      max: 25,
      detail: `${reserveMonths.toFixed(1)} meses de despesas`,
    },
    {
      label: 'Dívidas',
      value: clampScore(1 - debtCommitment / 0.35, 20),
      max: 20,
      detail: `${(debtCommitment * 100).toFixed(0)}% da renda em parcelas`,
    },
    {
      label: 'Orçamento',
      value: clampScore(1 - overBudgets / Math.max(1, budgets.length), 15),
      max: 15,
      detail: overBudgets === 0 ? 'sem orçamento excedido' : `${overBudgets} orçamento${overBudgets !== 1 ? 's' : ''} excedido${overBudgets !== 1 ? 's' : ''}`,
    },
    {
      label: 'Flexibilidade',
      value: clampScore(variableShare / 0.35, 15),
      max: 15,
      detail: `${formatCurrency(variable)} em despesas variáveis`,
    },
  ];

  const total = Math.round(items.reduce((sum, item) => sum + item.value, 0));
  const level = total >= 80 ? 'Forte' : total >= 60 ? 'Estável' : total >= 40 ? 'Atenção' : 'Crítico';
  const color = total >= 80 ? 'var(--accent)' : total >= 60 ? 'var(--warning)' : 'var(--danger)';

  el.innerHTML = `
    <div class="card" style="margin-bottom:20px">
      <div class="card-body" style="display:flex;align-items:center;justify-content:space-between;gap:20px">
        <div>
          <div style="font-size:0.78rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.08em">Score financeiro</div>
          <div style="font-size:3rem;font-weight:800;color:${color};line-height:1">${total}</div>
          <div style="font-size:1rem;font-weight:600;margin-top:6px">${level}</div>
        </div>
        <div style="flex:1;max-width:520px">
          <div class="prog-track" style="height:14px">
            <div class="prog-fill" style="width:${total}%;background:${color}"></div>
          </div>
          <div style="margin-top:10px;color:var(--text-2);font-size:0.86rem;line-height:1.6">
            O score combina sobra mensal, reserva, dívidas, orçamento e flexibilidade entre gastos essenciais e variáveis.
          </div>
        </div>
      </div>
    </div>

    <div class="grid-2">
      ${items.map(item => `
        <div class="card">
          <div class="card-body">
            <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:8px">
              <div>
                <div style="font-weight:600">${item.label}</div>
                <div style="font-size:0.78rem;color:var(--text-3);margin-top:2px">${item.detail}</div>
              </div>
              <strong>${Math.round(item.value)}/${item.max}</strong>
            </div>
            <div class="prog-track">
              <div class="prog-fill" style="width:${((item.value / item.max) * 100).toFixed(0)}%"></div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function avg(values: number[]): number {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
}

function clampScore(ratio: number, max: number): number {
  return Math.max(0, Math.min(max, ratio * max));
}
