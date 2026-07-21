import { invoke } from '../api';
import { formatCurrency, formatDate, getDaysUntilDue, isPixEligibleAccountType } from '../../shared/utils';
import { openModal } from '../components/modal';
import { attachMoneyMask, formatMoneyValue, moneyInputValue } from '../components/moneyMask';
import { showAlert, showConfirm } from '../components/alertDialog';
import { setTopbarActions } from '../components/topbar';
import { aiDraftNotice, openAICreateDraft } from '../components/aiCreateDraft';
import type { Account, AIReceivableDraft, Receivable, ReceivableInterval, ReceivableStatus, ReceivableWithCategory, Category, PaymentSplit, PaymentSplitWithAccount } from '../../shared/types';
import { categoryOptions } from '../components/categorySelect';

const INTERVAL_LABELS: Record<ReceivableInterval, string> = {
  weekly:     'Semanal',
  biweekly:   'Quinzenal',
  monthly:    'Mensal',
  bimonthly:  'Bimestral',
  quarterly:  'Trimestral',
  semiannual: 'Semestral',
  annual:     'Anual',
};

let accounts: Account[] = [];
let incomeCategories: Category[] = [];

export async function render(el: HTMLElement): Promise<void> {
  accounts = await invoke<Account[]>('accounts:list');
  incomeCategories = await invoke<Category[]>('categories:list', 'income');

  // Filtros de/até (vencimento) e categoria — padrão sempre limpo (sem filtro).
  let filterFrom = '';
  let filterTo = '';
  let filterCategory = '';

  setTopbarActions(`
    <button class="btn btn-secondary" id="btn-ai-create-receivable"><i class="ti ti-sparkles"></i> Criar com IA</button>
    <button class="btn btn-primary" id="btn-new-receivable"><i class="ti ti-plus"></i> Nova conta a receber</button>
  `);

  async function renderPage(): Promise<void> {
    const receivables = await invoke<ReceivableWithCategory[]>('receivables:list', {
      dateFrom: filterFrom || undefined,
      dateTo: filterTo || undefined,
      category_id: filterCategory || undefined,
    });
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const overdue  = receivables.filter(r => r.status === 'overdue');
    const upcoming = receivables.filter(r => r.status === 'pending');
    const received = receivables.filter(r => r.status === 'received' && r.due_date.slice(0, 7) === currentMonth);

    el.innerHTML = `
      <div class="filters" style="margin-bottom:16px">
        <span style="font-size:0.8rem;color:var(--text-2)">De</span>
        <input class="form-ctrl" id="receivable-from" type="date" value="${filterFrom}" style="width:auto">
        <span style="color:var(--text-3)">até</span>
        <input class="form-ctrl" id="receivable-to" type="date" value="${filterTo}" style="width:auto">
        <select class="form-ctrl" id="receivable-category" style="width:auto">
          <option value="">Todas as categorias</option>
          ${categoryOptions(incomeCategories, filterCategory, { emptyLabel: 'Todas as categorias' })}
        </select>
        <button class="btn btn-ghost btn-sm" id="receivable-filter-reset">Limpar filtros</button>
      </div>

      <div class="grid-3" style="margin-bottom:20px">
        <div class="stat-card">
          <div class="stat-label">Pendentes</div>
          <div class="stat-value">${formatCurrency(upcoming.reduce((s,r) => s+r.amount, 0))}</div>
          <div class="stat-sub">${upcoming.length} conta${upcoming.length!==1?'s':''}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Vencidas</div>
          <div class="stat-value stat-red">${formatCurrency(overdue.reduce((s,r) => s+r.amount, 0))}</div>
          <div class="stat-sub">${overdue.length} conta${overdue.length!==1?'s':''}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Recebidas (mês)</div>
          <div class="stat-value stat-green">${formatCurrency(received.reduce((s,r) => s+r.amount, 0))}</div>
          <div class="stat-sub">${received.length} conta${received.length!==1?'s':''}</div>
        </div>
      </div>

      ${receivableSection('Vencidas', overdue, true)}
      ${receivableSection('A receber', upcoming, false)}
      ${receivableSection('Recebidas', received, false)}
    `;

    el.querySelector<HTMLInputElement>('#receivable-from')?.addEventListener('change', e => {
      filterFrom = (e.target as HTMLInputElement).value;
      renderPage();
    });
    el.querySelector<HTMLInputElement>('#receivable-to')?.addEventListener('change', e => {
      filterTo = (e.target as HTMLInputElement).value;
      renderPage();
    });
    el.querySelector<HTMLSelectElement>('#receivable-category')?.addEventListener('change', e => {
      filterCategory = (e.target as HTMLSelectElement).value;
      renderPage();
    });
    el.querySelector('#receivable-filter-reset')?.addEventListener('click', () => {
      filterFrom = ''; filterTo = ''; filterCategory = '';
      renderPage();
    });

    el.querySelectorAll<HTMLElement>('[data-receive]').forEach(btn => {
      btn.addEventListener('click', () => {
        const receivable = receivables.find(x => x.id === btn.dataset.receive);
        if (receivable) openReceiveModal(receivable, renderPage);
      });
    });
    el.querySelectorAll<HTMLElement>('[data-edit-receivable]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.editReceivable!;
        const r  = receivables.find(x => x.id === id);
        if (r) openReceivableModal(r, renderPage);
      });
    });
    el.querySelectorAll<HTMLElement>('[data-del-receivable]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!await showConfirm('Remover esta conta a receber?', { danger: true, okLabel: 'Remover' })) return;
        await invoke('receivables:delete', btn.dataset.delReceivable);
        renderPage();
      });
    });
    el.querySelectorAll<HTMLElement>('[data-dup-receivable]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.dupReceivable!;
        const r  = receivables.find(x => x.id === id);
        if (r) openDuplicateReceivableModal(r, renderPage);
      });
    });
  }

  document.getElementById('btn-new-receivable')?.addEventListener('click', () => openReceivableModal(null, renderPage));
  document.getElementById('btn-ai-create-receivable')?.addEventListener('click', () => {
    openAICreateDraft<AIReceivableDraft>({
      target: 'receivable',
      title: 'Criar conta a receber com IA',
      placeholder: 'Ex: mensalidade de cliente de R$ 800 todo dia 5',
      onDraft: draft => openReceivableModal(null, renderPage, draft),
    });
  });
  await renderPage();
}

function receivableSection(title: string, receivables: ReceivableWithCategory[], isOverdue: boolean): string {
  if (receivables.length === 0) return '';
  return `
    <div style="margin-bottom:20px">
      <h3 style="font-size:13px;font-weight:600;color:${isOverdue ? 'var(--danger)' : 'var(--text-2)'};margin-bottom:10px">${title}</h3>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>DESCRIÇÃO</th>
              <th>CATEGORIA</th>
              <th>VENCIMENTO</th>
              <th>STATUS</th>
              <th style="text-align:right">VALOR</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${receivables.map(r => {
              const days = getDaysUntilDue(r.due_date);
              const statusLabel = r.status === 'received' ? 'Recebido' : r.status === 'overdue' ? 'Vencido' : days === 0 ? 'Hoje' : `Em ${days}d`;
              const badgeCls = r.status === 'received' ? 'badge-confirmed' : r.status === 'overdue' ? 'badge-overdue' : days <= 3 ? 'badge-pending' : 'badge-ok';
              return `<tr>
                <td><div class="desc-main">${esc(r.description)}</div></td>
                <td>${r.category_name ? `<span class="badge" style="background:${alpha(r.category_color!,0.12)};color:${r.category_color}">${esc(r.category_name)}</span>` : '<span style="color:var(--text-3)">—</span>'}</td>
                <td style="color:var(--text-2)">${formatDate(r.due_date)}</td>
                <td><span class="badge ${badgeCls}">${statusLabel}</span></td>
                <td style="text-align:right;font-weight:500;color:${r.status==='overdue'?'var(--danger)':'var(--accent)'}">
                  ${formatCurrency(r.amount)}
                </td>
                <td>
                  <div style="display:flex;gap:6px">
                    ${r.status !== 'received' ? `<button class="btn btn-primary btn-sm" data-receive="${r.id}">Receber</button>` : ''}
                    <button class="btn btn-ghost btn-sm" data-edit-receivable="${r.id}">Editar</button>
                    <button class="btn btn-ghost btn-sm" data-dup-receivable="${r.id}">Duplicar</button>
                    <button class="btn btn-danger btn-sm" data-del-receivable="${r.id}">✕</button>
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

function openReceivableModal(r: Receivable | null, onDone: () => void, draft?: AIReceivableDraft): void {
  const today = new Date().toISOString().split('T')[0];
  const initialPayments = initialPaymentSplits((r as ReceivableWithCategory | null)?.payments, r?.account_id ?? draft?.account_id ?? undefined, r?.amount ?? draft?.amount);
  const overlay = openModal({
    title: r ? 'Editar conta a receber' : 'Nova conta a receber',
    body: `
      ${!r && draft?.explanation ? aiDraftNotice(draft) : ''}
      <div class="form-group">
        <label class="form-label">Descrição</label>
        <input class="form-ctrl" id="f-desc" value="${esc(r?.description ?? draft?.description)}" placeholder="Ex: Cliente XPTO">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Valor (R$)</label>
          <input class="form-ctrl" id="f-amount" type="text" inputmode="decimal" placeholder="0,00" value="${formatMoneyValue(r?.amount ?? draft?.amount)}">
        </div>
        <div class="form-group">
          <label class="form-label">Vencimento</label>
          <input class="form-ctrl" id="f-due" type="date" value="${r?.due_date ?? draft?.due_date ?? today}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Meios de recebimento</label>
        <div id="receivable-payments" style="display:flex;flex-direction:column;gap:8px">
          ${paymentRowsHtml(initialPayments)}
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" type="button" id="btn-add-receivable-payment"><i class="ti ti-plus"></i> Adicionar meio</button>
          <div id="receivable-payment-summary" style="font-size:0.78rem;color:var(--text-3)"></div>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Categoria</label>
          <select class="form-ctrl" id="f-category">
            ${categoryOptions(incomeCategories, r?.category_id ?? draft?.category_id, { emptyLabel: '— Sem categoria —' })}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select class="form-ctrl" id="f-status">
            ${(['pending','received','overdue'] as ReceivableStatus[]).map(st =>
              `<option value="${st}" ${(r?.status ?? draft?.status)===st?'selected':''}>${st==='pending'?'Pendente':st==='received'?'Recebido':'Vencido'}</option>`
            ).join('')}
          </select>
        </div>
      </div>
    `,
    onSave: async () => {
      const desc   = (document.getElementById('f-desc')    as HTMLInputElement).value.trim();
      const amount = moneyInputValue(document.getElementById('f-amount') as HTMLInputElement);
      const due    = (document.getElementById('f-due')     as HTMLInputElement).value;
      const cat    = (document.getElementById('f-category') as HTMLSelectElement).value;
      const status = (document.getElementById('f-status')  as HTMLSelectElement).value as ReceivableStatus;
      if (!desc || isNaN(amount) || !due) { showAlert('Preencha todos os campos.'); return false; }
      const payments = collectPayments('receivable', amount, true);
      if (!payments) return false;

      // Editar e mudar o status para "Recebido" segue o mesmo caminho do
      // botão "Receber": gera o lançamento de receita e remove a conta de
      // contas a receber (receivables:markAsReceived), em vez de só trocar
      // o campo status.
      const markingAsReceived = !!r && r.status !== 'received' && status === 'received';
      const finalCategoryId = cat || (markingAsReceived ? r!.category_id : null) || null;
      if (markingAsReceived && !finalCategoryId) { showAlert('Selecione uma categoria para o lançamento.'); return false; }
      if (markingAsReceived && payments.length === 0) { showAlert('Defina pelo menos um meio de recebimento.'); return false; }

      const payload = { description: desc, amount, due_date: due, status: markingAsReceived ? r!.status : status, account_id: payments[0]?.account_id ?? null, category_id: cat || null, recurring: 0 as const, payments };
      if (r) {
        await invoke('receivables:update', { id: r.id, ...payload });
        if (markingAsReceived) {
          try {
            await invoke('receivables:markAsReceived', { id: r.id, category_id: finalCategoryId, date: due, payments });
          } catch (err) {
            showAlert(err instanceof Error ? err.message : 'Não foi possível marcar como recebida.');
            return false;
          }
        }
      } else {
        await invoke('receivables:create', payload);
      }
      onDone();
    },
  });
  overlay.dataset.syncFirstPaymentAmount = r ? 'false' : 'true';
  attachMoneyMask(overlay.querySelector('#f-amount'));
  bindPaymentRows(overlay, 'receivable');
  overlay.querySelector('#f-amount')?.addEventListener('input', () => {
    syncFirstPaymentAmount(overlay, 'receivable');
    updatePaymentSummary(overlay, 'receivable');
  });
  overlay.querySelector('#btn-add-receivable-payment')?.addEventListener('click', () => {
    overlay.dataset.syncFirstPaymentAmount = 'false';
    overlay.querySelector<HTMLElement>('#receivable-payments')!.insertAdjacentHTML('beforeend', paymentRowHtml('', remainingAmount(overlay, 'receivable'), 'receivable'));
    bindPaymentRows(overlay, 'receivable');
    updatePaymentSummary(overlay, 'receivable');
  });
  syncFirstPaymentAmount(overlay, 'receivable');
  updatePaymentSummary(overlay, 'receivable');
}

async function openReceiveModal(r: ReceivableWithCategory, onDone: () => void): Promise<void> {
  // Se a conta já tem categoria definida, ela é reaproveitada automaticamente
  // no lançamento — só pedimos para escolher quando não há uma.
  if (!r.category_id && incomeCategories.length === 0) {
    await showAlert('Cadastre uma categoria de receita antes de marcar contas como recebidas.');
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  const initialPayments = initialPaymentSplits(r.payments, r.account_id ?? undefined, r.amount);

  const overlay = openModal({
    title: 'Confirmar recebimento',
    saveLabel: 'Marcar como recebida',
    body: `
      <p style="margin-bottom:14px;color:var(--text-2)">
        <strong>${esc(r.description)}</strong> — ${formatCurrency(r.amount)}
      </p>
      <input type="hidden" id="receive-total" value="${r.amount}">
      <div class="form-group">
        <label class="form-label">Meios de recebimento</label>
        <div id="receive-payments" style="display:flex;flex-direction:column;gap:8px">
          ${paymentRowsHtml(initialPayments, 'receive')}
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" type="button" id="btn-add-receive-payment"><i class="ti ti-plus"></i> Adicionar meio</button>
          <div id="receive-payment-summary" style="font-size:0.78rem;color:var(--text-3)"></div>
        </div>
      </div>
      <div class="form-row">
        ${r.category_id
          ? `<div class="form-group">
               <label class="form-label">Categoria</label>
               <div style="padding:8px 0;color:var(--text)">${esc(r.category_name)}</div>
             </div>`
          : `<div class="form-group">
               <label class="form-label">Categoria</label>
               <select class="form-ctrl" id="f-receive-category">
                 ${categoryOptions(incomeCategories)}
               </select>
             </div>`
        }
        <div class="form-group">
          <label class="form-label">Data do recebimento</label>
          <input class="form-ctrl" id="f-receive-date" type="date" value="${today}">
        </div>
      </div>
    `,
    onSave: async () => {
      const category_id = r.category_id ?? (document.getElementById('f-receive-category') as HTMLSelectElement).value;
      const date = (document.getElementById('f-receive-date') as HTMLInputElement).value;
      const payments = collectPayments('receive', r.amount, false);
      if (!payments) return false;
      try {
        await invoke('receivables:markAsReceived', { id: r.id, category_id, date, payments });
      } catch (err) {
        showAlert(err instanceof Error ? err.message : 'Não foi possível marcar como recebida.');
        return false;
      }
      onDone();
    },
  });
  bindPaymentRows(overlay, 'receive');
  overlay.querySelector('#btn-add-receive-payment')?.addEventListener('click', () => {
    overlay.querySelector<HTMLElement>('#receive-payments')!.insertAdjacentHTML('beforeend', paymentRowHtml('', remainingAmount(overlay, 'receive'), 'receive'));
    bindPaymentRows(overlay, 'receive');
    updatePaymentSummary(overlay, 'receive');
  });
  updatePaymentSummary(overlay, 'receive');
}

function openDuplicateReceivableModal(r: Receivable, onDone: () => void): void {
  openModal({
    title: 'Duplicar conta a receber',
    saveLabel: 'Duplicar',
    body: `
      <p style="margin-bottom:14px;color:var(--text-2)">
        <strong>${esc(r.description)}</strong> — ${formatCurrency(r.amount)}
      </p>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Quantas vezes</label>
          <input class="form-ctrl" id="f-dup-times" type="number" min="1" step="1" value="1">
        </div>
        <div class="form-group">
          <label class="form-label">Intervalo</label>
          <select class="form-ctrl" id="f-dup-interval">
            ${(Object.keys(INTERVAL_LABELS) as ReceivableInterval[]).map(k =>
              `<option value="${k}" ${k === 'monthly' ? 'selected' : ''}>${INTERVAL_LABELS[k]}</option>`
            ).join('')}
          </select>
        </div>
      </div>
    `,
    onSave: async () => {
      const times    = parseInt((document.getElementById('f-dup-times') as HTMLInputElement).value, 10);
      const interval = (document.getElementById('f-dup-interval') as HTMLSelectElement).value as ReceivableInterval;
      if (!Number.isInteger(times) || times < 1) { showAlert('Informe um número de repetições válido.'); return false; }
      try {
        await invoke('receivables:duplicate', { id: r.id, times, interval });
      } catch (err) {
        showAlert(err instanceof Error ? err.message : 'Não foi possível duplicar a conta.');
        return false;
      }
      onDone();
    },
  });
}

function alpha(hex: string, a: number): string {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

function esc(s?: string | null): string {
  return (s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function initialPaymentSplits(payments: PaymentSplitWithAccount[] | undefined, accountId: string | undefined, amount: number | undefined): PaymentSplit[] {
  if (payments?.length) return payments.map(p => ({ account_id: p.account_id, amount: p.amount, is_pix: p.is_pix }));
  return accountId ? [{ account_id: accountId, amount: amount ?? 0 }] : [];
}

function paymentRowsHtml(payments: PaymentSplit[], prefix = 'receivable'): string {
  return payments.length
    ? payments.map(payment => paymentRowHtml(payment.account_id, payment.amount, prefix, !!payment.is_pix)).join('')
    : paymentRowHtml('', 0, prefix);
}

function paymentRowHtml(accountId: string, amount: number, prefix = 'receivable', isPix = false): string {
  const pixEligible = accountId ? isPixEligibleAccountType(accounts.find(a => a.id === accountId)?.type ?? '') : false;
  return `
    <div class="${prefix}-payment-row" style="display:grid;grid-template-columns:minmax(0,1fr) 150px 64px 34px;gap:8px;align-items:center">
      <select class="form-ctrl ${prefix}-payment-account">
        <option value="">— Selecione —</option>
        ${accounts.map(a => `<option value="${a.id}" ${accountId === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
      </select>
      <input class="form-ctrl ${prefix}-payment-amount" type="text" inputmode="decimal" value="${amount ? formatMoneyValue(amount) : ''}" placeholder="Valor">
      <label class="${prefix}-payment-pix-label" style="display:${pixEligible ? 'flex' : 'none'};align-items:center;gap:4px;font-size:11px;color:var(--text-2)" title="Recebido via Pix">
        <input type="checkbox" class="${prefix}-payment-pix" ${isPix ? 'checked' : ''}> Pix
      </label>
      <button class="btn btn-ghost btn-sm ${prefix}-payment-remove" type="button" title="Remover"><i class="ti ti-x"></i></button>
    </div>
  `;
}

function updatePaymentPixVisibility(row: HTMLElement, prefix: string): void {
  const accountId = row.querySelector<HTMLSelectElement>(`.${prefix}-payment-account`)!.value;
  const pixEligible = accountId ? isPixEligibleAccountType(accounts.find(a => a.id === accountId)?.type ?? '') : false;
  const label = row.querySelector<HTMLElement>(`.${prefix}-payment-pix-label`)!;
  const checkbox = row.querySelector<HTMLInputElement>(`.${prefix}-payment-pix`)!;
  label.style.display = pixEligible ? 'flex' : 'none';
  if (!pixEligible) checkbox.checked = false;
}

function bindPaymentRows(overlay: HTMLElement, prefix: string): void {
  overlay.querySelectorAll<HTMLElement>(`.${prefix}-payment-row`).forEach(row => {
    if (row.dataset.bound === 'true') return;
    row.dataset.bound = 'true';
    attachMoneyMask(row.querySelector<HTMLInputElement>(`.${prefix}-payment-amount`));
    row.querySelector<HTMLSelectElement>(`.${prefix}-payment-account`)?.addEventListener('change', () => updatePaymentPixVisibility(row, prefix));
    row.querySelectorAll('input, select').forEach(ctrl => {
      ctrl.addEventListener('input', () => {
        if ((ctrl as HTMLElement).classList.contains(`${prefix}-payment-amount`)) {
          overlay.dataset.syncFirstPaymentAmount = 'false';
        }
        updatePaymentSummary(overlay, prefix);
      });
      ctrl.addEventListener('change', () => updatePaymentSummary(overlay, prefix));
    });
    row.querySelector<HTMLElement>(`.${prefix}-payment-remove`)?.addEventListener('click', () => {
      if (overlay.querySelectorAll(`.${prefix}-payment-row`).length <= 1) return;
      row.remove();
      updatePaymentSummary(overlay, prefix);
    });
  });
}

function syncFirstPaymentAmount(overlay: HTMLElement, prefix: string): void {
  if (overlay.dataset.syncFirstPaymentAmount !== 'true') return;
  const rows = [...overlay.querySelectorAll<HTMLElement>(`.${prefix}-payment-row`)];
  if (rows.length !== 1) return;
  const totalInput = overlay.querySelector<HTMLInputElement>('#f-amount');
  const firstPaymentInput = rows[0].querySelector<HTMLInputElement>(`.${prefix}-payment-amount`);
  if (!totalInput || !firstPaymentInput) return;
  firstPaymentInput.value = totalInput.value;
}

function collectPayments(prefix: string, total: number, allowEmpty: boolean): PaymentSplit[] | null {
  const rows = [...document.querySelectorAll<HTMLElement>(`.${prefix}-payment-row`)];
  const payments = rows
    .map(row => ({
      account_id: row.querySelector<HTMLSelectElement>(`.${prefix}-payment-account`)!.value,
      amount: moneyInputValue(row.querySelector<HTMLInputElement>(`.${prefix}-payment-amount`)),
      is_pix: (row.querySelector<HTMLInputElement>(`.${prefix}-payment-pix`)?.checked ? 1 : 0) as 0 | 1,
    }))
    .filter(payment => payment.account_id || Number.isFinite(payment.amount));

  if (allowEmpty && payments.length === 0) return [];
  const seen = new Set<string>();
  let sum = 0;
  for (const payment of payments) {
    if (!payment.account_id || !Number.isFinite(payment.amount) || payment.amount <= 0) {
      showAlert('Preencha todos os meios de recebimento com valores válidos.');
      return null;
    }
    if (seen.has(payment.account_id)) {
      showAlert('Não repita o mesmo meio de recebimento.');
      return null;
    }
    seen.add(payment.account_id);
    sum += payment.amount;
  }
  if (Math.abs(sum - total) > 0.005) {
    showAlert('A soma dos meios de recebimento deve ser igual ao valor total.');
    return null;
  }
  return payments;
}

function remainingAmount(overlay: HTMLElement, prefix: string): number {
  const total = prefix === 'receive'
    ? parseFloat(overlay.querySelector<HTMLInputElement>('#receive-total')?.value ?? '0') || 0
    : moneyInputValue(overlay.querySelector<HTMLInputElement>('#f-amount')) || 0;
  const used = [...overlay.querySelectorAll<HTMLInputElement>(`.${prefix}-payment-amount`)]
    .reduce((sum, input) => sum + (moneyInputValue(input) || 0), 0);
  return Math.max(0, Math.round((total - used) * 100) / 100);
}

function updatePaymentSummary(overlay: HTMLElement, prefix: string): void {
  const summary = overlay.querySelector<HTMLElement>(`#${prefix}-payment-summary`);
  if (!summary) return;
  const total = prefix === 'receive'
    ? parseFloat(overlay.querySelector<HTMLInputElement>('#receive-total')?.value ?? '0') || 0
    : moneyInputValue(overlay.querySelector<HTMLInputElement>('#f-amount')) || 0;
  const used = [...overlay.querySelectorAll<HTMLInputElement>(`.${prefix}-payment-amount`)]
    .reduce((sum, input) => sum + (moneyInputValue(input) || 0), 0);
  const rest = Math.round((total - used) * 100) / 100;
  summary.innerHTML = `Total: <strong>${formatCurrency(total)}</strong> · Distribuído: <strong>${formatCurrency(used)}</strong> · Restante: <strong style="color:${Math.abs(rest) < 0.005 ? 'var(--accent)' : 'var(--danger)'}">${formatCurrency(rest)}</strong>`;
}
