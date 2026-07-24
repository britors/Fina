import { invoke } from '../api';
import { formatCurrency, formatDate, getDaysUntilDue, isPixEligibleAccountType } from '../../shared/utils';
import { openModal } from '../components/modal';
import { attachMoneyMask, formatMoneyValue, moneyInputValue } from '../components/moneyMask';
import { showAlert, showConfirm } from '../components/alertDialog';
import { setTopbarActions } from '../components/topbar';
import { aiDraftNotice, openAICreateDraft } from '../components/aiCreateDraft';
import type { Account, AIBillDraft, Bill, BillInterval, BillStatus, BillWithCategory, Category, CategorySplit, CategorySplitWithCategory, CreditCardInvoiceWithAccount, PaymentSplit, PaymentSplitWithAccount } from '../../shared/types';
import { categoryOptions } from '../components/categorySelect';

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

  // Filtros de/até (vencimento) e categoria — padrão sempre limpo (sem filtro).
  let filterFrom = '';
  let filterTo = '';
  let filterCategory = '';

  setTopbarActions(`
    <button class="btn btn-secondary" id="btn-ai-create-bill"><i class="ti ti-sparkles"></i> Criar com IA</button>
    <button class="btn btn-primary" id="btn-new-bill"><i class="ti ti-plus"></i> Nova conta à pagar</button>
  `);

  async function renderPage(): Promise<void> {
    const bills = await invoke<BillWithCategory[]>('bills:list', {
      dateFrom: filterFrom || undefined,
      dateTo: filterTo || undefined,
      category_id: filterCategory || undefined,
    });
    const upcomingInvoices = await invoke<CreditCardInvoiceWithAccount[]>('invoices:listUpcoming');
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const overdue  = bills.filter(b => b.status === 'overdue');
    const upcoming = bills.filter(b => b.status === 'pending');
    const paid     = bills.filter(b => b.status === 'paid' && b.due_date.slice(0, 7) === currentMonth);

    el.innerHTML = `
      <div class="filters" style="margin-bottom:16px">
        <span style="font-size:0.8rem;color:var(--text-2)">De</span>
        <input class="form-ctrl" id="bill-from" type="date" value="${filterFrom}" style="width:auto">
        <span style="color:var(--text-3)">até</span>
        <input class="form-ctrl" id="bill-to" type="date" value="${filterTo}" style="width:auto">
        <select class="form-ctrl" id="bill-category" style="width:auto">
          <option value="">Todas as categorias</option>
          ${categoryOptions(expenseCategories, filterCategory, { emptyLabel: 'Todas as categorias' })}
        </select>
        <button class="btn btn-ghost btn-sm" id="bill-filter-reset">Limpar filtros</button>
      </div>

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

      ${invoiceSection(upcomingInvoices)}
      ${billSection('Vencidas', overdue, true)}
      ${billSection('A pagar', upcoming, false)}
      ${billSection('Pagas', paid, false)}
    `;

    el.querySelector<HTMLInputElement>('#bill-from')?.addEventListener('change', e => {
      filterFrom = (e.target as HTMLInputElement).value;
      renderPage();
    });
    el.querySelector<HTMLInputElement>('#bill-to')?.addEventListener('change', e => {
      filterTo = (e.target as HTMLInputElement).value;
      renderPage();
    });
    el.querySelector<HTMLSelectElement>('#bill-category')?.addEventListener('change', e => {
      filterCategory = (e.target as HTMLSelectElement).value;
      renderPage();
    });
    el.querySelector('#bill-filter-reset')?.addEventListener('click', () => {
      filterFrom = ''; filterTo = ''; filterCategory = '';
      renderPage();
    });

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
        if (!await showConfirm('Remover esta conta à pagar?', { danger: true, okLabel: 'Remover' })) return;
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
  document.getElementById('btn-ai-create-bill')?.addEventListener('click', () => {
    openAICreateDraft<AIBillDraft>({
      target: 'bill',
      title: 'Criar conta a pagar com IA',
      placeholder: 'Ex: aluguel de R$ 1200 todo dia 10',
      onDraft: draft => openBillModal(null, renderPage, draft),
    });
  });
  await renderPage();
}

// Fatura não-paga mais próxima de cada cartão com fatura ativada — só
// leitura, sem coluna de ações (fechar/pagar acontece no card do cartão em
// Contas e Cartões, não aqui).
function invoiceSection(invoices: CreditCardInvoiceWithAccount[]): string {
  if (invoices.length === 0) return '';
  return `
    <div style="margin-bottom:20px">
      <h3 style="font-size:13px;font-weight:600;color:var(--text-2);margin-bottom:10px">Próximas faturas</h3>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>CARTÃO</th>
              <th>STATUS</th>
              <th>VENCIMENTO</th>
              <th style="text-align:right">VALOR</th>
            </tr>
          </thead>
          <tbody>
            ${invoices.map(inv => {
              const days = getDaysUntilDue(inv.due_date);
              const badgeCls = inv.status === 'closed' ? (days <= 3 ? 'badge-overdue' : 'badge-pending') : 'badge-ok';
              const statusLabel = inv.status === 'closed' ? 'Fechada' : 'Aberta';
              return `<tr>
                <td><div class="desc-main">${esc(inv.account_name)}</div></td>
                <td><span class="badge ${badgeCls}">${statusLabel}</span></td>
                <td style="color:var(--text-2)">${formatDate(inv.due_date)}</td>
                <td style="text-align:right;font-weight:500">${formatCurrency(inv.amount)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function billSection(title: string, bills: BillWithCategory[], isOverdue: boolean): string {
  if (bills.length === 0) return '';
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
            ${bills.map(b => {
              const days = getDaysUntilDue(b.due_date);
              const statusLabel = b.status === 'paid' ? 'Pago' : b.status === 'overdue' ? 'Vencido' : days === 0 ? 'Hoje' : `Em ${days}d`;
              const badgeCls = b.status === 'paid' ? 'badge-confirmed' : b.status === 'overdue' ? 'badge-overdue' : days <= 3 ? 'badge-pending' : 'badge-ok';
              return `<tr>
                <td><div class="desc-main">${esc(b.description)}</div></td>
                <td>${b.category_name ? `<span class="badge" style="background:${alpha(b.category_color!,0.12)};color:${b.category_color}">${esc(b.category_name)}</span>` : '<span style="color:var(--text-3)">—</span>'}</td>
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

function openBillModal(b: Bill | null, onDone: () => void, draft?: AIBillDraft): void {
  const today = new Date().toISOString().split('T')[0];
  const initialPayments = initialPaymentSplits((b as BillWithCategory | null)?.payments, b?.account_id ?? draft?.account_id ?? undefined, b?.amount ?? draft?.amount);
  const initialCategories = initialCategorySplits((b as BillWithCategory | null)?.categories, b?.category_id ?? draft?.category_id, b?.amount ?? draft?.amount);
  const overlay = openModal({
    title: b ? 'Editar conta à pagar' : 'Nova conta à pagar',
    body: `
      ${!b && draft?.explanation ? aiDraftNotice(draft) : ''}
      <div class="form-group">
        <label class="form-label">Descrição</label>
        <input class="form-ctrl" id="f-desc" value="${esc(b?.description ?? draft?.description)}" placeholder="Ex: Aluguel">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Valor (R$)</label>
          <input class="form-ctrl" id="f-amount" type="text" inputmode="decimal" placeholder="0,00" value="${formatMoneyValue(b?.amount ?? draft?.amount)}">
        </div>
        <div class="form-group">
          <label class="form-label">Vencimento</label>
          <input class="form-ctrl" id="f-due" type="date" value="${b?.due_date ?? draft?.due_date ?? today}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Cartão ou conta</label>
        <div id="bill-payments" style="display:flex;flex-direction:column;gap:8px">
          ${paymentRowsHtml(initialPayments)}
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" type="button" id="btn-add-bill-payment"><i class="ti ti-plus"></i> Adicionar conta</button>
          <div id="bill-payment-summary" style="font-size:0.78rem;color:var(--text-3)"></div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Categorias</label>
        <div id="category-splits" style="display:flex;flex-direction:column;gap:8px">
          ${categoryRowsHtml(initialCategories)}
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" type="button" id="btn-add-category"><i class="ti ti-plus"></i> Adicionar categoria</button>
          <div id="category-summary" style="font-size:0.78rem;color:var(--text-3)"></div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Status</label>
        <select class="form-ctrl" id="f-status">
          ${(['pending','paid','overdue'] as BillStatus[]).map(st =>
            `<option value="${st}" ${(b?.status ?? draft?.status)===st?'selected':''}>${st==='pending'?'Pendente':st==='paid'?'Pago':'Vencido'}</option>`
          ).join('')}
        </select>
      </div>
    `,
    onSave: async () => {
      const desc   = (document.getElementById('f-desc')    as HTMLInputElement).value.trim();
      const amount = moneyInputValue(document.getElementById('f-amount') as HTMLInputElement);
      const due    = (document.getElementById('f-due')     as HTMLInputElement).value;
      const status = (document.getElementById('f-status')  as HTMLSelectElement).value as BillStatus;
      if (!desc || isNaN(amount) || !due) { showAlert('Preencha todos os campos.'); return false; }
      const payments = collectPayments('bill', amount, true);
      if (!payments) return false;
      const billCategories = collectCategories(amount, true);
      if (!billCategories) return false;

      // Editar e mudar o status para "Pago" segue o mesmo caminho do botão
      // "Pagar": gera o lançamento de despesa e remove a conta de contas a
      // pagar (bills:markAsPaid), em vez de só trocar o campo status.
      const markingAsPaid = !!b && b.status !== 'paid' && status === 'paid';
      const finalCategories = billCategories.length ? billCategories : (markingAsPaid ? (b as BillWithCategory).categories?.map(c => ({ category_id: c.category_id, amount: c.amount })) ?? [] : []);
      if (markingAsPaid && finalCategories.length === 0) { showAlert('Selecione uma categoria para o lançamento.'); return false; }
      if (markingAsPaid && payments.length === 0) { showAlert('Defina pelo menos uma conta.'); return false; }

      const payload = { description: desc, amount, due_date: due, status: markingAsPaid ? b!.status : status, account_id: payments[0]?.account_id ?? null, category_id: billCategories[0]?.category_id ?? null, recurring: 0 as const, payments, categories: billCategories };
      if (b) {
        await invoke('bills:update', { id: b.id, ...payload });
        if (markingAsPaid) {
          try {
            await invoke('bills:markAsPaid', { id: b.id, categories: finalCategories, date: due, payments });
          } catch (err) {
            showAlert(err instanceof Error ? err.message : 'Não foi possível marcar como paga.');
            return false;
          }
        }
      } else {
        await invoke('bills:create', payload);
      }
      onDone();
    },
  });
  overlay.dataset.syncFirstPaymentAmount = b ? 'false' : 'true';
  overlay.dataset.syncFirstCategoryAmount = b ? 'false' : 'true';
  attachMoneyMask(overlay.querySelector('#f-amount'));
  bindPaymentRows(overlay, 'bill');
  bindCategoryRows(overlay);
  overlay.querySelector('#f-amount')?.addEventListener('input', () => {
    syncFirstPaymentAmount(overlay, 'bill');
    updatePaymentSummary(overlay, 'bill');
    syncFirstCategoryAmount(overlay);
    updateCategorySummary(overlay);
  });
  overlay.querySelector('#btn-add-bill-payment')?.addEventListener('click', () => {
    overlay.dataset.syncFirstPaymentAmount = 'false';
    overlay.querySelector<HTMLElement>('#bill-payments')!.insertAdjacentHTML('beforeend', paymentRowHtml('', remainingAmount(overlay, 'bill'), 'bill'));
    bindPaymentRows(overlay, 'bill');
    updatePaymentSummary(overlay, 'bill');
  });
  overlay.querySelector('#btn-add-category')?.addEventListener('click', () => {
    overlay.dataset.syncFirstCategoryAmount = 'false';
    overlay.querySelector<HTMLElement>('#category-splits')!.insertAdjacentHTML('beforeend', categoryRowHtml('', remainingCategoryAmount(overlay)));
    bindCategoryRows(overlay);
    updateCategorySummary(overlay);
  });
  syncFirstPaymentAmount(overlay, 'bill');
  updatePaymentSummary(overlay, 'bill');
  syncFirstCategoryAmount(overlay);
  updateCategorySummary(overlay);
}

async function openPayBillModal(b: BillWithCategory, onDone: () => void): Promise<void> {
  // Se a conta já tem categoria definida, ela é reaproveitada automaticamente
  // no lançamento — só pedimos para escolher quando não há uma.
  if (!b.category_id && expenseCategories.length === 0) {
    await showAlert('Cadastre uma categoria de despesa antes de marcar contas como pagas.');
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  const initialPayments = initialPaymentSplits(b.payments, b.account_id ?? undefined, b.amount);

  const overlay = openModal({
    title: 'Confirmar pagamento',
    saveLabel: 'Marcar como paga',
    body: `
      <p style="margin-bottom:14px;color:var(--text-2)">
        <strong>${esc(b.description)}</strong> — ${formatCurrency(b.amount)}
      </p>
      <input type="hidden" id="pay-total" value="${b.amount}">
      <div class="form-group">
        <label class="form-label">Cartão ou conta</label>
        <div id="pay-payments" style="display:flex;flex-direction:column;gap:8px">
          ${paymentRowsHtml(initialPayments, 'pay')}
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" type="button" id="btn-add-pay-payment"><i class="ti ti-plus"></i> Adicionar conta</button>
          <div id="pay-payment-summary" style="font-size:0.78rem;color:var(--text-3)"></div>
        </div>
      </div>
      <div class="form-row">
        ${b.category_id
          ? `<div class="form-group">
               <label class="form-label">Categoria</label>
               <div style="padding:8px 0;color:var(--text)">${esc((b.categories && b.categories.length > 1) ? b.categories.map(c => c.category_name).join(' + ') : b.category_name)}</div>
             </div>`
          : `<div class="form-group">
               <label class="form-label">Categoria</label>
               <select class="form-ctrl" id="f-pay-category">
                 ${categoryOptions(expenseCategories)}
               </select>
             </div>`
        }
        <div class="form-group">
          <label class="form-label">Data do pagamento</label>
          <input class="form-ctrl" id="f-pay-date" type="date" value="${today}">
        </div>
      </div>
    `,
    onSave: async () => {
      const categories: CategorySplit[] = b.category_id
        ? (b.categories ?? []).map(c => ({ category_id: c.category_id, amount: c.amount }))
        : [{ category_id: (document.getElementById('f-pay-category') as HTMLSelectElement).value, amount: b.amount }];
      const date = (document.getElementById('f-pay-date') as HTMLInputElement).value;
      const payments = collectPayments('pay', b.amount, false);
      if (!payments) return false;
      try {
        await invoke('bills:markAsPaid', { id: b.id, categories, date, payments });
      } catch (err) {
        showAlert(err instanceof Error ? err.message : 'Não foi possível marcar como paga.');
        return false;
      }
      onDone();
    },
  });
  bindPaymentRows(overlay, 'pay');
  overlay.querySelector('#btn-add-pay-payment')?.addEventListener('click', () => {
    overlay.querySelector<HTMLElement>('#pay-payments')!.insertAdjacentHTML('beforeend', paymentRowHtml('', remainingAmount(overlay, 'pay'), 'pay'));
    bindPaymentRows(overlay, 'pay');
    updatePaymentSummary(overlay, 'pay');
  });
  updatePaymentSummary(overlay, 'pay');
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
      if (!Number.isInteger(times) || times < 1) { showAlert('Informe um número de repetições válido.'); return false; }
      try {
        await invoke('bills:duplicate', { id: b.id, times, interval });
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

function paymentRowsHtml(payments: PaymentSplit[], prefix = 'bill'): string {
  return payments.length
    ? payments.map(payment => paymentRowHtml(payment.account_id, payment.amount, prefix, !!payment.is_pix)).join('')
    : paymentRowHtml('', 0, prefix);
}

function paymentRowHtml(accountId: string, amount: number, prefix = 'bill', isPix = false): string {
  const pixEligible = accountId ? isPixEligibleAccountType(accounts.find(a => a.id === accountId)?.type ?? '') : false;
  return `
    <div class="${prefix}-payment-row" style="display:grid;grid-template-columns:minmax(0,1fr) 150px 64px 34px;gap:8px;align-items:center">
      <select class="form-ctrl ${prefix}-payment-account">
        <option value="">— Selecione —</option>
        ${accounts.map(a => `<option value="${a.id}" ${accountId === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
      </select>
      <input class="form-ctrl ${prefix}-payment-amount" type="text" inputmode="decimal" value="${amount ? formatMoneyValue(amount) : ''}" placeholder="Valor">
      <label class="${prefix}-payment-pix-label" style="display:${pixEligible ? 'flex' : 'none'};align-items:center;gap:4px;font-size:11px;color:var(--text-2)" title="Pago via Pix">
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
      showAlert('Preencha todas as contas com valores válidos.');
      return null;
    }
    if (seen.has(payment.account_id)) {
      showAlert('Não repita a mesma conta.');
      return null;
    }
    seen.add(payment.account_id);
    sum += payment.amount;
  }
  if (Math.abs(sum - total) > 0.005) {
    showAlert('A soma das contas deve ser igual ao valor total.');
    return null;
  }
  return payments;
}

function remainingAmount(overlay: HTMLElement, prefix: string): number {
  const total = prefix === 'pay'
    ? parseFloat(overlay.querySelector<HTMLInputElement>('#pay-total')?.value ?? '0') || 0
    : moneyInputValue(overlay.querySelector<HTMLInputElement>('#f-amount')) || 0;
  const used = [...overlay.querySelectorAll<HTMLInputElement>(`.${prefix}-payment-amount`)]
    .reduce((sum, input) => sum + (moneyInputValue(input) || 0), 0);
  return Math.max(0, Math.round((total - used) * 100) / 100);
}

function initialCategorySplits(categorySplits: CategorySplitWithCategory[] | undefined, categoryId: string | null | undefined, amount: number | undefined): CategorySplit[] {
  if (categorySplits?.length) return categorySplits.map(c => ({ category_id: c.category_id, amount: c.amount }));
  return categoryId ? [{ category_id: categoryId, amount: amount ?? 0 }] : [];
}

function categoryRowsHtml(categorySplits: CategorySplit[]): string {
  return categorySplits.length
    ? categorySplits.map(c => categoryRowHtml(c.category_id, c.amount)).join('')
    : categoryRowHtml('', 0);
}

function categoryRowHtml(categoryId: string, amount: number): string {
  return `
    <div class="category-row" style="display:grid;grid-template-columns:minmax(0,1fr) 150px 34px;gap:8px;align-items:center">
      <select class="form-ctrl category-select">
        ${categoryOptions(expenseCategories, categoryId, { emptyLabel: '— Sem categoria —' })}
      </select>
      <input class="form-ctrl category-amount" type="text" inputmode="decimal" value="${amount ? formatMoneyValue(amount) : ''}" placeholder="Valor">
      <button class="btn btn-ghost btn-sm category-remove" type="button" title="Remover"><i class="ti ti-x"></i></button>
    </div>
  `;
}

function bindCategoryRows(overlay: HTMLElement): void {
  overlay.querySelectorAll<HTMLElement>('.category-row').forEach(row => {
    if (row.dataset.bound === 'true') return;
    row.dataset.bound = 'true';
    attachMoneyMask(row.querySelector<HTMLInputElement>('.category-amount'));
    row.querySelectorAll('input, select').forEach(ctrl => {
      ctrl.addEventListener('input', () => {
        if ((ctrl as HTMLElement).classList.contains('category-amount')) {
          overlay.dataset.syncFirstCategoryAmount = 'false';
        }
        updateCategorySummary(overlay);
      });
      ctrl.addEventListener('change', () => updateCategorySummary(overlay));
    });
    row.querySelector<HTMLElement>('.category-remove')?.addEventListener('click', () => {
      if (overlay.querySelectorAll('.category-row').length <= 1) return;
      row.remove();
      updateCategorySummary(overlay);
    });
  });
}

function syncFirstCategoryAmount(overlay: HTMLElement): void {
  if (overlay.dataset.syncFirstCategoryAmount !== 'true') return;
  const rows = [...overlay.querySelectorAll<HTMLElement>('.category-row')];
  if (rows.length !== 1) return;
  const totalInput = overlay.querySelector<HTMLInputElement>('#f-amount');
  const firstInput = rows[0].querySelector<HTMLInputElement>('.category-amount');
  if (!totalInput || !firstInput) return;
  firstInput.value = totalInput.value;
}

function collectCategories(total: number, allowEmpty: boolean): CategorySplit[] | null {
  const rows = [...document.querySelectorAll<HTMLElement>('.category-row')];
  const cats = rows
    .map(row => ({
      category_id: row.querySelector<HTMLSelectElement>('.category-select')!.value,
      amount: moneyInputValue(row.querySelector<HTMLInputElement>('.category-amount')),
    }))
    .filter(cat => cat.category_id || Number.isFinite(cat.amount));

  if (allowEmpty && cats.length === 0) return [];
  const seen = new Set<string>();
  let sum = 0;
  for (const cat of cats) {
    if (!cat.category_id || !Number.isFinite(cat.amount) || cat.amount <= 0) {
      showAlert('Preencha todas as categorias com valores válidos.');
      return null;
    }
    if (seen.has(cat.category_id)) {
      showAlert('Não repita a mesma categoria.');
      return null;
    }
    seen.add(cat.category_id);
    sum += cat.amount;
  }
  if (Math.abs(sum - total) > 0.005) {
    showAlert('A soma das categorias deve ser igual ao valor total.');
    return null;
  }
  return cats;
}

function remainingCategoryAmount(overlay: HTMLElement): number {
  const total = moneyInputValue(overlay.querySelector<HTMLInputElement>('#f-amount')) || 0;
  const used = [...overlay.querySelectorAll<HTMLInputElement>('.category-amount')]
    .reduce((sum, input) => sum + (moneyInputValue(input) || 0), 0);
  return Math.max(0, Math.round((total - used) * 100) / 100);
}

function updateCategorySummary(overlay: HTMLElement): void {
  const summary = overlay.querySelector<HTMLElement>('#category-summary');
  if (!summary) return;
  const total = moneyInputValue(overlay.querySelector<HTMLInputElement>('#f-amount')) || 0;
  const used = [...overlay.querySelectorAll<HTMLInputElement>('.category-amount')]
    .reduce((sum, input) => sum + (moneyInputValue(input) || 0), 0);
  const rest = Math.round((total - used) * 100) / 100;
  summary.innerHTML = `Total: <strong>${formatCurrency(total)}</strong> · Distribuído: <strong>${formatCurrency(used)}</strong> · Restante: <strong style="color:${Math.abs(rest) < 0.005 ? 'var(--accent)' : 'var(--danger)'}">${formatCurrency(rest)}</strong>`;
}

function updatePaymentSummary(overlay: HTMLElement, prefix: string): void {
  const summary = overlay.querySelector<HTMLElement>(`#${prefix}-payment-summary`);
  if (!summary) return;
  const total = prefix === 'pay'
    ? parseFloat(overlay.querySelector<HTMLInputElement>('#pay-total')?.value ?? '0') || 0
    : moneyInputValue(overlay.querySelector<HTMLInputElement>('#f-amount')) || 0;
  const used = [...overlay.querySelectorAll<HTMLInputElement>(`.${prefix}-payment-amount`)]
    .reduce((sum, input) => sum + (moneyInputValue(input) || 0), 0);
  const rest = Math.round((total - used) * 100) / 100;
  summary.innerHTML = `Total: <strong>${formatCurrency(total)}</strong> · Distribuído: <strong>${formatCurrency(used)}</strong> · Restante: <strong style="color:${Math.abs(rest) < 0.005 ? 'var(--accent)' : 'var(--danger)'}">${formatCurrency(rest)}</strong>`;
}
