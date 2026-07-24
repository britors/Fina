import { invoke } from '../api';
import { formatCurrency } from '../../shared/utils';
import { setTopbarActions } from '../components/topbar';
import type { BillWithCategory, ReceivableWithCategory, TransactionWithDetails } from '../../shared/types';

type DayEvent = {
  kind: 'tx' | 'bill' | 'receivable';
  title: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer' | 'bill' | 'receivable';
  status: string;
};

export async function render(el: HTMLElement): Promise<void> {
  const now = new Date();
  let month = now.getMonth() + 1;
  let year = now.getFullYear();

  setTopbarActions('');

  async function renderPage(): Promise<void> {
    const dateFrom = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const dateTo = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const [txs, bills, receivables] = await Promise.all([
      invoke<TransactionWithDetails[]>('transactions:list', { dateFrom, dateTo, limit: 500 }),
      invoke<BillWithCategory[]>('bills:list', { dateFrom, dateTo }),
      invoke<ReceivableWithCategory[]>('receivables:list', { dateFrom, dateTo }),
    ]);

    const events = new Map<string, DayEvent[]>();
    for (const tx of txs) {
      addEvent(events, tx.date, {
        kind: 'tx',
        title: tx.description,
        amount: tx.amount,
        type: tx.type,
        status: tx.status,
      });
    }
    for (const bill of bills) {
      addEvent(events, bill.due_date, {
        kind: 'bill',
        title: bill.description,
        amount: bill.amount,
        type: 'bill',
        status: bill.status,
      });
    }
    for (const receivable of receivables) {
      addEvent(events, receivable.due_date, {
        kind: 'receivable',
        title: receivable.description,
        amount: receivable.amount,
        type: 'receivable',
        status: receivable.status,
      });
    }

    const totalIncome = txs.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = txs.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const totalBills = bills.filter(b => b.status !== 'paid').reduce((sum, b) => sum + b.amount, 0);
    const totalReceivables = receivables.filter(r => r.status !== 'received').reduce((sum, r) => sum + r.amount, 0);
    const label = new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    el.innerHTML = `
      <div class="filters" style="margin-bottom:16px">
        <button class="btn btn-secondary btn-sm" id="cal-prev"><i class="ti ti-chevron-left"></i></button>
        <strong style="min-width:180px;text-transform:capitalize">${label}</strong>
        <button class="btn btn-secondary btn-sm" id="cal-next"><i class="ti ti-chevron-right"></i></button>
        <button class="btn btn-ghost btn-sm" id="cal-today">Mês atual</button>
      </div>

      <div class="grid-3" style="margin-bottom:16px;grid-template-columns:repeat(4,1fr)">
        <div class="stat-card">
          <div class="stat-label">Receitas no mês</div>
          <div class="stat-value stat-green">${formatCurrency(totalIncome)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Despesas lançadas</div>
          <div class="stat-value stat-red">${formatCurrency(totalExpense)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Contas a pagar pendentes</div>
          <div class="stat-value">${formatCurrency(totalBills)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Contas a receber pendentes</div>
          <div class="stat-value">${formatCurrency(totalReceivables)}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-body" style="padding:0">
          <div style="display:grid;grid-template-columns:repeat(7,1fr);border-bottom:0.5px solid var(--border)">
            ${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d => `<div style="padding:10px 12px;color:var(--text-3);font-size:0.75rem;font-weight:600">${d}</div>`).join('')}
          </div>
          <div style="display:grid;grid-template-columns:repeat(7,1fr)">
            ${calendarCells(year, month, events)}
          </div>
        </div>
      </div>
    `;

    el.querySelector('#cal-prev')?.addEventListener('click', () => {
      month--;
      if (month < 1) { month = 12; year--; }
      renderPage();
    });
    el.querySelector('#cal-next')?.addEventListener('click', () => {
      month++;
      if (month > 12) { month = 1; year++; }
      renderPage();
    });
    el.querySelector('#cal-today')?.addEventListener('click', () => {
      month = now.getMonth() + 1;
      year = now.getFullYear();
      renderPage();
    });
  }

  await renderPage();
}

function addEvent(events: Map<string, DayEvent[]>, date: string, event: DayEvent): void {
  const list = events.get(date) ?? [];
  list.push(event);
  events.set(date, list);
}

function calendarCells(year: number, month: number, events: Map<string, DayEvent[]>): string {
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const lastDay = new Date(year, month, 0).getDate();
  const cells: string[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(emptyCell());
  for (let day = 1; day <= lastDay; day++) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const items = events.get(iso) ?? [];
    const income = items.filter(e => e.type === 'income' || e.type === 'receivable').reduce((sum, e) => sum + e.amount, 0);
    const out = items.filter(e => e.type === 'expense' || e.type === 'bill').reduce((sum, e) => sum + e.amount, 0);
    cells.push(`
      <div style="min-height:128px;border-right:0.5px solid var(--border);border-bottom:0.5px solid var(--border);padding:8px;overflow:hidden">
        <div style="display:flex;justify-content:space-between;gap:6px;margin-bottom:6px">
          <strong style="font-size:0.85rem">${day}</strong>
          <span style="font-size:0.7rem;color:${out > income ? 'var(--danger)' : 'var(--accent)'}">${formatCurrency(income - out)}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          ${items.slice(0, 4).map(eventChip).join('')}
          ${items.length > 4 ? `<div style="font-size:0.7rem;color:var(--text-3)">+${items.length - 4} itens</div>` : ''}
        </div>
      </div>
    `);
  }
  while (cells.length % 7 !== 0) cells.push(emptyCell());
  return cells.join('');
}

function emptyCell(): string {
  return `<div style="min-height:128px;border-right:0.5px solid var(--border);border-bottom:0.5px solid var(--border);background:rgba(255,255,255,.015)"></div>`;
}

function eventChip(event: DayEvent): string {
  const color = event.type === 'income' || event.type === 'receivable' ? 'var(--accent)' : event.type === 'transfer' ? 'var(--text-3)' : 'var(--danger)';
  const icon = event.kind === 'bill' || event.kind === 'receivable' ? 'ti-calendar-dollar' : event.type === 'income' ? 'ti-arrow-up-right' : event.type === 'transfer' ? 'ti-transfer' : 'ti-arrow-down-right';
  return `
    <div title="${esc(event.title)}" style="display:flex;align-items:center;gap:5px;min-width:0;font-size:0.72rem;color:${color};background:var(--bg);border:0.5px solid var(--border);border-radius:6px;padding:4px 6px">
      <i class="ti ${icon}" style="flex-shrink:0"></i>
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(event.title)}</span>
    </div>
  `;
}

function esc(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
