import { invoke } from '../api';
import { formatCurrency, formatDate, getDaysUntilDue } from '../../shared/utils';
import { openModal } from '../components/modal';
import { setTopbarActions } from '../components/topbar';
import type { Account, Bill, BillInterval, BillStatus, Category } from '../../shared/types';

const INTERVAL_LABELS: Record<BillInterval, string> = {
  weekly:     'Semanal',
  biweekly:   'Quinzenal',
  monthly:    'Mensal',
  bimonthly:  'Bimestral',
  quarterly:  'Trimestral',
  semiannual: 'Semestral',
  annual:     'Anual',
};

let accounts: Account[] = [];
let expenseCategories: Category[] = [];

export async function render(el: HTMLElement): Promise<void> {
  accounts = await invoke<Account[]>('accounts:list');
  expenseCategories = await invoke<Category[]>('categories:list', 'expense');

  setTopbarActions(`
    <button class="btn btn-primary" id="btn-new-bill"><i class="ti ti-plus"></i> Nova conta à pagar</button>
  `);

  async function renderPage(): Promise<void> {
    const bills = await invoke<Bill[]>('bills:list');
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const overdue  = bills.filter(b => b.status === 'overdue');
    const upcoming = bills.filter(b => b.status === 'pending');
    const paid     = bills.filter(b => b.status === 'paid' && b.due_date.slice(0, 7) === currentMonth);

    el.innerHTML = `
      <div class="grid-3" style="margin-bottom:20px">
        <div class="stat-card">
          <div class="stat-label">Pendentes</div>
          <div class="stat-value">${formatCurrency(upcoming.reduce((s,b) => s+b.amount, 0))}</div>
          <div class="stat-sub">${upcoming.length} conta${upcoming.length!==1?'s':''}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Vencidas</div>
          <div class="stat-value stat-red">${formatCurrency(overdue.reduce((s,b) => s+b.amount, 0))}</div>
          <div class="stat-sub">${overdue.length} conta${overdue.length!==1?'s':''}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Pagas (mês)</div>
          <div class="stat-value stat-green">${formatCurrency(paid.reduce((s,b) => s+b.amount, 0))}</div>
          <div class="stat-sub">${paid.length} conta${paid.length!==1?'s':''}</div>
        </div>
      </div>

      ${billSection('Vencidas', overdue, true)}
      ${billSection('A pagar', upcoming, false)}
      ${billSection('Pagas', paid, false)}
    `;

    el.querySelectorAll<HTMLElement>('[data-pay]').forEach(btn => {
      btn.addEventListener('click', () => {
        const bill = bills.find(x => x.id === btn.dataset.pay);
        if (bill) openPayBillModal(bill, renderPage);
      });
    });
    el.querySelectorAll<HTMLElement>('[data-edit-bill]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.editBill!;
        const b  = bills.find(x => x.id === id);
        if (b) openBillModal(b, renderPage);
      });
    });
    el.querySelectorAll<HTMLElement>('[data-del-bill]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Remover esta conta à pagar ')) return;
        await invoke('bills:delete', btn.dataset.delBill);
        renderPage();
      });
    });
    el.querySelectorAll<HTMLElement>('[data-dup-bill]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.dupBill!;
        const b  = bills.find(x => x.id === id);
        if (b) openDuplicateBillModal(b, renderPage);
      });
    });
  }

  document.getElementById('btn-new-bill')?.addEventListener('click', () => openBillModal(null, renderPage));
  await renderPage();
}

function billSection(title: string, bills: Bill[], isOverdue: boolean): string {
  if (bills.length === 0) return '';
  return `
    <div style="margin-bottom:20px">
      <h3 style="font-size:13px;font-weight:600;color:${isOverdue ? 'var(--danger)' : 'var(--text-2)'};margin-bottom:10px">${title}</h3>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>DESCRIÇÃO</th>
              <th>VENCIMENTO</th>
              <th>STATUS</th>
              <th style="text-align:right">VALOR</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${bills.map(b => {
              const days = getDaysUntilDue(b.due_date);
              const statusLabel = b.status === 'paid' ? 'Pago' : b.status === 'overdue' ? 'Vencido' : days === 0 ? 'Hoje' : `Em ${days}d`;
              const badgeCls = b.status === 'paid' ? 'badge-confirmed' : b.status === 'overdue' ? 'badge-overdue' : days <= 3 ? 'badge-pending' : 'badge-ok';
              return `<tr>
                <td><div class="desc-main">${esc(b.description)}</div></td>
                <td style="color:var(--text-2)">${formatDate(b.due_date)}</td>
                <td><span class="badge ${badgeCls}">${statusLabel}</span></td>
                <td style="text-align:right;font-weight:500;color:${b.status==='overdue'?'var(--danger)':'var(--text)'}">
                  ${formatCurrency(b.amount)}
                </td>
                <td>
                  <div style="display:flex;gap:6px">
                    ${b.status !== 'paid' ? `<button class="btn btn-primary btn-sm" data-pay="${b.id}">Pagar</button>` : ''}
                    <button class="btn btn-ghost btn-sm" data-edit-bill="${b.id}">Editar</button>
                    <button class="btn btn-ghost btn-sm" data-dup-bill="${b.id}">Duplicar</button>
                    <button class="btn btn-danger btn-sm" data-del-bill="${b.id}">✕</button>
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function openBillModal(b: Bill | null, onDone: () => void): void {
  const today = new Date().toISOString().split('T')[0];
  openModal({
    title: b ? 'Editar conta à pagar' : 'Nova conta à pagar',
    body: `
      <div class="form-group">
        <label class="form-label">Descrição</label>
        <input class="form-ctrl" id="f-desc" value="${esc(b?.description)}" placeholder="Ex: Aluguel">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Valor (R$)</label>
          <input class="form-ctrl" id="f-amount" type="number" step="0.01" value="${b?.amount ?? ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Vencimento</label>
          <input class="form-ctrl" id="f-due" type="date" value="${b?.due_date ?? today}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Conta</label>
          <select class="form-ctrl" id="f-account">
            <option value="">— Sem conta —</option>
            ${accounts.map(a => `<option value="${a.id}" ${b?.account_id===a.id?'selected':''}>${esc(a.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select class="form-ctrl" id="f-status">
            ${(['pending','paid','overdue'] as BillStatus[]).map(st =>
              `<option value="${st}" ${b?.status===st?'selected':''}>${st==='pending'?'Pendente':st==='paid'?'Pago':'Vencido'}</option>`
            ).join('')}
          </select>
        </div>
      </div>
    `,
    onSave: async () => {
      const desc   = (document.getElementById('f-desc')    as HTMLInputElement).value.trim();
      const amount = parseFloat((document.getElementById('f-amount') as HTMLInputElement).value);
      const due    = (document.getElementById('f-due')     as HTMLInputElement).value;
      const acc    = (document.getElementById('f-account') as HTMLSelectElement).value;
      const status = (document.getElementById('f-status')  as HTMLSelectElement).value as BillStatus;
      if (!desc || isNaN(amount) || !due) { alert('Preencha todos os campos.'); return false; }
      const payload = { description: desc, amount, due_date: due, status, account_id: acc || null, recurring: 0 as const };
      if (b) { await invoke('bills:update', { id: b.id, ...payload }); }
      else   { await invoke('bills:create', payload); }
      onDone();
    },
  });
}

function openPayBillModal(b: Bill, onDone: () => void): void {
  if (!b.account_id) {
    alert('Defina uma conta para esta despesa (em "Editar") antes de marcá-la como paga.');
    return;
  }
  if (expenseCategories.length === 0) {
    alert('Cadastre uma categoria de despesa antes de marcar contas como pagas.');
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  const account = accounts.find(a => a.id === b.account_id);

  openModal({
    title: 'Confirmar pagamento',
    saveLabel: 'Marcar como paga',
    body: `
      <p style="margin-bottom:14px;color:var(--text-2)">
        <strong>${esc(b.description)}</strong> — ${formatCurrency(b.amount)}${account ? ` · ${esc(account.name)}` : ''}
      </p>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Categoria</label>
          <select class="form-ctrl" id="f-pay-category">
            ${expenseCategories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Data do pagamento</label>
          <input class="form-ctrl" id="f-pay-date" type="date" value="${today}">
        </div>
      </div>
    `,
    onSave: async () => {
      const category_id = (document.getElementById('f-pay-category') as HTMLSelectElement).value;
      const date = (document.getElementById('f-pay-date') as HTMLInputElement).value;
      try {
        await invoke('bills:markAsPaid', { id: b.id, category_id, date });
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Não foi possível marcar como paga.');
        return false;
      }
      onDone();
    },
  });
}

function openDuplicateBillModal(b: Bill, onDone: () => void): void {
  openModal({
    title: 'Duplicar conta à pagar',
    saveLabel: 'Duplicar',
    body: `
      <p style="margin-bottom:14px;color:var(--text-2)">
        <strong>${esc(b.description)}</strong> — ${formatCurrency(b.amount)}
      </p>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Quantas vezes</label>
          <input class="form-ctrl" id="f-dup-times" type="number" min="1" step="1" value="1">
        </div>
        <div class="form-group">
          <label class="form-label">Intervalo</label>
          <select class="form-ctrl" id="f-dup-interval">
            ${(Object.keys(INTERVAL_LABELS) as BillInterval[]).map(k =>
              `<option value="${k}" ${k === 'monthly' ? 'selected' : ''}>${INTERVAL_LABELS[k]}</option>`
            ).join('')}
          </select>
        </div>
      </div>
    `,
    onSave: async () => {
      const times    = parseInt((document.getElementById('f-dup-times') as HTMLInputElement).value, 10);
      const interval = (document.getElementById('f-dup-interval') as HTMLSelectElement).value as BillInterval;
      if (!Number.isInteger(times) || times < 1) { alert('Informe um número de repetições válido.'); return false; }
      try {
        await invoke('bills:duplicate', { id: b.id, times, interval });
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Não foi possível duplicar a conta.');
        return false;
      }
      onDone();
    },
  });
}

function esc(s?: string | null): string {
  return (s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
