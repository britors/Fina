import { invoke } from '../api';
import { formatCurrency } from '../../shared/utils';
import type { BillWithCategory, ReceivableWithCategory, TransactionWithDetails } from '../../shared/types';

const STORAGE_KEY = 'fina.weeklyReview.completed';

const ITEMS = [
  { id: 'transactions', label: 'Conferir lançamentos da semana', route: 'transactions' },
  { id: 'bills', label: 'Ver contas a pagar a vencer e atrasadas', route: 'agenda' },
  { id: 'receivables', label: 'Ver contas a receber a vencer e atrasadas', route: 'contas-receber' },
  { id: 'budget', label: 'Revisar orçamento do mês', route: 'budget' },
  { id: 'score', label: 'Checar score financeiro', route: 'score' },
  { id: 'plan', label: 'Ajustar plano mensal', route: 'plano-mensal' },
];

export async function render(el: HTMLElement): Promise<void> {
  const today = new Date();
  const from = new Date();
  from.setDate(today.getDate() - 6);
  const dateFrom = from.toISOString().slice(0, 10);
  const dateTo = today.toISOString().slice(0, 10);
  const [txs, bills, receivables] = await Promise.all([
    invoke<TransactionWithDetails[]>('transactions:list', { dateFrom, dateTo, limit: 500 }),
    invoke<BillWithCategory[]>('bills:list', { dateFrom, dateTo }),
    invoke<ReceivableWithCategory[]>('receivables:list', { dateFrom, dateTo }),
  ]);

  const completed = readCompleted();
  const income = txs.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const expense = txs.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const pendingBills = bills.filter(b => b.status !== 'paid').reduce((sum, b) => sum + b.amount, 0);
  const pendingReceivables = receivables.filter(r => r.status !== 'received').reduce((sum, r) => sum + r.amount, 0);
  const doneCount = ITEMS.filter(item => completed.has(item.id)).length;

  el.innerHTML = `
    <div class="grid-3" style="margin-bottom:20px;grid-template-columns:repeat(4,1fr)">
      <div class="stat-card">
        <div class="stat-label">Saldo da semana</div>
        <div class="stat-value" style="color:${income - expense >= 0 ? 'var(--accent)' : 'var(--danger)'}">${formatCurrency(income - expense)}</div>
        <div class="stat-sub">${dateFrom.split('-').reverse().join('/')} a ${dateTo.split('-').reverse().join('/')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Despesas lançadas</div>
        <div class="stat-value stat-red">${formatCurrency(expense)}</div>
        <div class="stat-sub">${txs.length} lançamento${txs.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Contas a pagar no período</div>
        <div class="stat-value">${formatCurrency(pendingBills)}</div>
        <div class="stat-sub">pendentes ou vencidas</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Contas a receber no período</div>
        <div class="stat-value">${formatCurrency(pendingReceivables)}</div>
        <div class="stat-sub">pendentes ou vencidas</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px">
      <div class="card-body">
        <div style="display:flex;justify-content:space-between;gap:16px;margin-bottom:10px">
          <div>
            <div style="font-size:1.05rem;font-weight:700">Revisão semanal</div>
            <div style="font-size:0.82rem;color:var(--text-3);margin-top:3px">Feche a semana com dados conferidos e prioridades claras.</div>
          </div>
          <strong style="color:var(--accent)">${doneCount}/${ITEMS.length}</strong>
        </div>
        <div class="prog-track" style="height:10px">
          <div class="prog-fill" style="width:${((doneCount / ITEMS.length) * 100).toFixed(0)}%"></div>
        </div>
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:10px">
      ${ITEMS.map(item => `
        <label class="card" style="display:flex;align-items:center;gap:12px;padding:14px 16px;cursor:pointer">
          <input type="checkbox" data-item="${item.id}" ${completed.has(item.id) ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--accent)">
          <span style="flex:1;font-weight:500">${item.label}</span>
          <a href="#${item.route}" class="btn btn-ghost btn-sm">Abrir</a>
        </label>
      `).join('')}
    </div>
  `;

  el.querySelectorAll<HTMLInputElement>('[data-item]').forEach(input => {
    input.addEventListener('change', () => {
      if (input.checked) completed.add(input.dataset.item!);
      else completed.delete(input.dataset.item!);
      writeCompleted(completed);
      render(el);
    });
  });
}

function weekKey(): string {
  const d = new Date();
  const start = new Date(d);
  start.setDate(d.getDate() - d.getDay());
  return start.toISOString().slice(0, 10);
}

function readCompleted(): Set<string> {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    const list = data[weekKey()];
    return Array.isArray(list) ? new Set(list) : new Set();
  } catch {
    return new Set();
  }
}

function writeCompleted(completed: Set<string>): void {
  let data: Record<string, string[]> = {};
  try {
    data = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch { /* noop */ }
  data[weekKey()] = [...completed];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
