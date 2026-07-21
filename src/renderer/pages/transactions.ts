import { invoke } from '../api';
import { formatCurrency, formatDate, calculateMonthlySummary, isPixEligibleAccountType } from '../../shared/utils';
import { openModal } from '../components/modal';
import { attachMoneyMask, formatMoneyValue, moneyInputValue } from '../components/moneyMask';
import { showAlert, showConfirm } from '../components/alertDialog';
import { setTopbarActions } from '../components/topbar';
import { aiDraftNotice, openAICreateDraft } from '../components/aiCreateDraft';
import type { Account, AITransactionBatchDraft, AITransactionDraft, Category, CategorySuggestion, CreditCardInvoice, PaymentSplit, PaymentSplitWithAccount, TransactionStatus, TransactionWithDetails, TransactionType } from '../../shared/types';
import { categoryOptions } from '../components/categorySelect';
import { consumePendingTransactionFilter } from '../navigation';

let accounts: Account[]  = [];
let categories: Category[] = [];
let familyEnabled = false;
let familyMembers: string[] = [];

interface OcrResult {
  amount: number | null;
  date: string | null;
  merchant: string | null;
}

function monthLabel(month: number, year: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
}

export async function render(el: HTMLElement): Promise<void> {
  const now = new Date();
  let fromMonth = now.getMonth() + 1;
  let fromYear  = now.getFullYear();
  let toMonth   = now.getMonth() + 1;
  let toYear    = now.getFullYear();
  let typeFilter: TransactionType | '' = '';
  let ownerFilter = '';
  let categoryFilter = '';
  let accountFilter = '';
  let statusFilter: TransactionStatus | '' = '';
  let weekdayFilter: number | null = null;

  const pending = consumePendingTransactionFilter();
  if (pending) {
    if (pending.dateFrom) {
      const [y, m] = pending.dateFrom.split('-').map(Number);
      fromYear = y; fromMonth = m;
    }
    if (pending.dateTo) {
      const [y, m] = pending.dateTo.split('-').map(Number);
      toYear = y; toMonth = m;
    }
    if (pending.type) typeFilter = pending.type;
    if (pending.categoryId) categoryFilter = pending.categoryId;
    if (pending.accountId) accountFilter = pending.accountId;
    if (pending.owner) ownerFilter = pending.owner;
    if (pending.status) statusFilter = pending.status as TransactionStatus;
    if (pending.weekday != null) weekdayFilter = pending.weekday;
  }

  const [loadedAccounts, loadedCategories, settings] = await Promise.all([
    invoke<Account[]>('accounts:list'),
    invoke<Category[]>('categories:list'),
    invoke<Record<string, string>>('settings:getAll'),
  ]);
  accounts = loadedAccounts;
  categories = loadedCategories;
  familyEnabled = settings.family_mode === 'true';
  familyMembers = (settings.family_members ?? '').split(',').map(v => v.trim()).filter(Boolean);

  setTopbarActions(`
    <details class="topbar-dropdown">
      <summary class="btn btn-secondary"><i class="ti ti-upload"></i> Importar <i class="ti ti-chevron-down" style="font-size:11px"></i></summary>
      <div class="topbar-dropdown-menu">
        <button class="dd-item" id="btn-scan-receipt"><i class="ti ti-scan"></i> Escanear comprovante</button>
        <button class="dd-item" id="btn-import"><i class="ti ti-upload"></i> Importar extrato</button>
      </div>
    </details>
    <button class="btn btn-secondary" id="btn-export-csv">
      <i class="ti ti-download"></i> Exportar CSV
    </button>
    <details class="topbar-dropdown">
      <summary class="btn btn-secondary"><i class="ti ti-sparkles"></i> Criar com IA <i class="ti ti-chevron-down" style="font-size:11px"></i></summary>
      <div class="topbar-dropdown-menu">
        <button class="dd-item" id="btn-ai-create-tx"><i class="ti ti-sparkles"></i> Lançamento único</button>
        <button class="dd-item" id="btn-ai-batch-tx"><i class="ti ti-list-plus"></i> Lote de lançamentos</button>
      </div>
    </details>
    <button class="btn btn-primary" id="btn-new-tx">
      <i class="ti ti-plus"></i> Novo lançamento
    </button>
  `);
  document.getElementById('btn-new-tx')?.addEventListener('click', () => openTxModal(null, () => renderPage()));
  document.getElementById('btn-ai-create-tx')?.addEventListener('click', () => {
    openAICreateDraft<AITransactionDraft>({
      target: 'transaction',
      title: 'Criar lançamento com IA',
      placeholder: 'Ex: R$ 50 de Uber hoje no cartão',
      onDraft: draft => openTxModal(null, () => renderPage(), draft),
    });
  });
  document.getElementById('btn-ai-batch-tx')?.addEventListener('click', () => openBatchPromptModal(() => renderPage()));
  document.getElementById('btn-scan-receipt')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-scan-receipt') as HTMLButtonElement;
    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-loader-2"></i> Lendo comprovante...';
    try {
      const result = await invoke<OcrResult | null>('ocr:scanReceipt');
      if (result) {
        openTxModal(null, () => renderPage(), {
          description: result.merchant ?? undefined,
          amount: result.amount ?? undefined,
          date: result.date ?? undefined,
        });
      }
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Não foi possível ler o comprovante.');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-scan"></i> Escanear comprovante';
    }
  });
  document.getElementById('btn-export-csv')?.addEventListener('click', async () => {
    const dateFrom = `${fromYear}-${String(fromMonth).padStart(2, '0')}-01`;
    const lastDay  = new Date(toYear, toMonth, 0).getDate();
    const dateTo   = `${toYear}-${String(toMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    await invoke('export:csv', { dateFrom, dateTo, type: typeFilter || undefined });
  });
  document.getElementById('btn-import')?.addEventListener('click', () => openImportModal());

  async function renderPage(): Promise<void> {
    const dateFrom = `${fromYear}-${String(fromMonth).padStart(2, '0')}-01`;
    const lastDay  = new Date(toYear, toMonth, 0).getDate();
    const dateTo   = `${toYear}-${String(toMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const periodLabel = (fromMonth === toMonth && fromYear === toYear)
      ? monthLabel(fromMonth, fromYear)
      : `${monthLabel(fromMonth, fromYear)} – ${monthLabel(toMonth, toYear)}`;

    const weekdayLabels = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
    const fetched = await invoke<TransactionWithDetails[]>('transactions:list', {
      dateFrom, dateTo, type: typeFilter || undefined, owner: ownerFilter || undefined,
      category_id: categoryFilter || undefined, account_id: accountFilter || undefined,
      status: statusFilter || undefined, limit: 200,
    });
    const txs = weekdayFilter == null ? fetched : fetched.filter(t => new Date(`${t.date}T12:00:00`).getDay() === weekdayFilter);
    const summary = calculateMonthlySummary(txs);

    el.innerHTML = `
      <!-- Chips -->
      <div class="filters" style="margin-bottom:16px">
        <span class="chip ${!typeFilter ? 'active' : ''}" data-type="">Todos</span>
        <span class="chip ${typeFilter === 'income' ? 'active' : ''}" data-type="income">Receitas</span>
        <span class="chip ${typeFilter === 'expense' ? 'active' : ''}" data-type="expense">Despesas</span>
        <select class="form-ctrl" id="tx-category-filter" style="width:auto;max-width:200px">
          ${categoryOptions(categories, categoryFilter, { emptyLabel: 'Todas categorias' })}
        </select>
        <select class="form-ctrl" id="tx-account-filter" style="width:auto;max-width:170px">
          <option value="">Todos meios</option>
          ${accounts.map(a => `<option value="${a.id}" ${accountFilter === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
        </select>
        <select class="form-ctrl" id="tx-status-filter" style="width:auto">
          <option value="" ${!statusFilter ? 'selected' : ''}>Todos status</option>
          <option value="confirmed" ${statusFilter === 'confirmed' ? 'selected' : ''}>Confirmados</option>
          <option value="pending" ${statusFilter === 'pending' ? 'selected' : ''}>Pendentes</option>
        </select>
        ${familyEnabled && familyMembers.length ? `
          <select class="form-ctrl" id="tx-owner-filter" style="width:auto">
            <option value="">Todos responsáveis</option>
            ${familyMembers.map(m => `<option value="${esc(m)}" ${ownerFilter === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}
          </select>
        ` : ''}
        ${weekdayFilter != null ? `<span class="chip active" id="tx-weekday-chip" style="cursor:pointer" title="Clique para remover">${esc(weekdayLabels[weekdayFilter])} ✕</span>` : ''}
        <div style="flex:1"></div>
        <!-- Period filter -->
        <span style="font-size:0.8rem;color:var(--text-2)">Período</span>
        <input class="form-ctrl" id="tx-from" type="month" value="${fromYear}-${String(fromMonth).padStart(2, '0')}" style="width:auto">
        <span style="color:var(--text-3)">até</span>
        <input class="form-ctrl" id="tx-to" type="month" value="${toYear}-${String(toMonth).padStart(2, '0')}" style="width:auto">
        <button class="btn btn-ghost btn-sm" id="tx-reset">Mês atual</button>
      </div>

      <!-- Summary -->
      <div class="grid-3" style="margin-bottom:16px">
        <div class="stat-card">
          <div class="stat-label">Total de receitas (${periodLabel})</div>
          <div class="stat-value stat-green">+${formatCurrency(summary.income)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total de despesas (${periodLabel})</div>
          <div class="stat-value stat-red">-${formatCurrency(summary.expense)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Saldo do período</div>
          <div class="stat-value" style="color:${summary.balance >= 0 ? 'var(--accent)' : 'var(--danger)'}">
            ${summary.balance >= 0 ? '+' : ''}${formatCurrency(summary.balance)}
          </div>
        </div>
      </div>

      <!-- Table -->
      ${txs.length === 0
        ? `<div class="empty"><i class="ti ti-receipt-off"></i><div class="empty-title">Nenhuma transação encontrada</div></div>`
        : `<div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>DESCRIÇÃO</th>
                  <th>CATEGORIA</th>
                  <th>DATA</th>
                  <th style="text-align:right">VALOR</th>
                  <th>STATUS</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${txs.map(t => `
                  <tr>
                    <td>
                      <div style="display:flex;align-items:center;gap:10px">
                        <div class="cat-dot" style="background:${alpha(t.category_color,0.15)}">
                          <i class="ti ${t.category_icon}" style="color:${t.category_color};font-size:13px"></i>
                        </div>
                        <div>
                          <div class="desc-main">${esc(t.description)}</div>
                          <div class="desc-sub">${esc(t.account_name)}${t.owner ? ` · ${esc(t.owner)}` : ''}</div>
                        </div>
                      </div>
                    </td>
                    <td><span class="badge" style="background:${alpha(t.category_color,0.12)};color:${t.category_color}">${esc(t.category_name)}</span></td>
                    <td style="color:var(--text-2)">${formatDate(t.date)}</td>
                    <td style="text-align:right;font-weight:500;color:${t.type === 'income' ? 'var(--accent)' : 'var(--danger)'}">
                      ${t.type === 'income' ? '+' : '-'}${formatCurrency(t.amount)}
                    </td>
                    <td><span class="badge badge-${t.status}">${t.status === 'confirmed' ? 'Confirmado' : 'Pendente'}</span></td>
                    <td>
                      <div style="display:flex;gap:6px">
                        <button class="btn btn-ghost btn-sm" data-edit="${t.id}">Editar</button>
                        <button class="btn btn-danger btn-sm" data-del="${t.id}">✕</button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>`
      }
    `;

    // Chip filter
    el.querySelectorAll<HTMLElement>('.chip[data-type]').forEach(chip => {
      chip.addEventListener('click', () => {
        typeFilter = (chip.dataset.type ?? '') as TransactionType | '';
        renderPage();
      });
    });

    // Period filter
    el.querySelector<HTMLInputElement>('#tx-from')?.addEventListener('change', e => {
      const [y, m] = (e.target as HTMLInputElement).value.split('-').map(Number);
      if (y && m) { fromYear = y; fromMonth = m; renderPage(); }
    });
    el.querySelector<HTMLInputElement>('#tx-to')?.addEventListener('change', e => {
      const [y, m] = (e.target as HTMLInputElement).value.split('-').map(Number);
      if (y && m) { toYear = y; toMonth = m; renderPage(); }
    });
    el.querySelector<HTMLSelectElement>('#tx-owner-filter')?.addEventListener('change', e => {
      ownerFilter = (e.target as HTMLSelectElement).value;
      renderPage();
    });
    el.querySelector<HTMLSelectElement>('#tx-category-filter')?.addEventListener('change', e => {
      categoryFilter = (e.target as HTMLSelectElement).value;
      renderPage();
    });
    el.querySelector<HTMLSelectElement>('#tx-account-filter')?.addEventListener('change', e => {
      accountFilter = (e.target as HTMLSelectElement).value;
      renderPage();
    });
    el.querySelector<HTMLSelectElement>('#tx-status-filter')?.addEventListener('change', e => {
      statusFilter = (e.target as HTMLSelectElement).value as TransactionStatus | '';
      renderPage();
    });
    el.querySelector('#tx-weekday-chip')?.addEventListener('click', () => {
      weekdayFilter = null;
      renderPage();
    });
    el.querySelector('#tx-reset')?.addEventListener('click', () => {
      fromMonth = now.getMonth() + 1; fromYear = now.getFullYear();
      toMonth   = now.getMonth() + 1; toYear   = now.getFullYear();
      renderPage();
    });

    // Edit / delete
    el.querySelectorAll<HTMLElement>('[data-edit]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.edit!;
        const tx = await invoke<TransactionWithDetails>('transactions:get', id);
        if (tx) openTxModal(tx, () => renderPage());
      });
    });
    el.querySelectorAll<HTMLElement>('[data-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!await showConfirm('Excluir esta transação?', { danger: true, okLabel: 'Excluir' })) return;
        await invoke('transactions:delete', btn.dataset.del);
        renderPage();
      });
    });
  }

  await renderPage();
}

interface TxDraft {
  description?: string;
  amount?: number;
  date?: string;
  type?: TransactionType;
  status?: TransactionStatus;
  account_id?: string;
  category_id?: string;
  notes?: string | null;
  toAccountId?: string;
  explanation?: string;
  warnings?: string[];
}

// Abre o cadastro de lançamento já como Transferência para o cartão
// informado — pagar uma fatura é dinheiro mudando de bolso, não uma
// despesa nova (a compra original já virou despesa/fatura quando foi
// feita), e transferências já ficam de fora dos totais de receita/despesa.
// Quando `invoice` é informado (fatura fechada aguardando pagamento), o
// valor já vem pré-preenchido e, ao salvar com sucesso, a fatura é marcada
// como paga.
export async function openPayInvoiceModal(cardAccountId: string, onDone: () => void, invoice?: CreditCardInvoice): Promise<void> {
  if (accounts.length === 0) accounts = await invoke<Account[]>('accounts:list');
  if (categories.length === 0) categories = await invoke<Category[]>('categories:list');
  const handleDone = invoice
    ? async () => { await invoke('invoices:markPaid', invoice.id); onDone(); }
    : onDone;
  openTxModal(null, handleDone, {
    type: 'transfer',
    toAccountId: cardAccountId,
    description: 'Pagamento de fatura',
    amount: invoice?.amount,
  });
}

function openTxModal(tx: TransactionWithDetails | null, onDone: () => void, draft?: TxDraft): void {
  const today = new Date().toISOString().split('T')[0];
  const initialPayments = initialPaymentSplits(tx?.payments, tx?.account_id ?? draft?.account_id, tx?.amount ?? draft?.amount);
  const initialType = tx ? tx.type : (draft?.type ?? 'expense');
  const showInitialInstallments = !tx && initialType === 'expense' && initialPayments.length === 1 && isCreditCardAccount(initialPayments[0].account_id);
  const overlay = openModal({
    title: tx ? 'Editar transação' : draft?.toAccountId ? 'Pagar fatura' : 'Nova transação',
    body: `
      ${!tx && draft?.explanation ? aiDraftNotice(draft as AITransactionDraft) : ''}
      <div class="form-group">
        <label class="form-label">Descrição</label>
        <input class="form-ctrl" id="f-desc" value="${esc(tx?.description ?? draft?.description ?? '')}" placeholder="Ex: Supermercado">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Valor (R$)</label>
          <input class="form-ctrl" id="f-amount" type="text" inputmode="decimal" placeholder="0,00" value="${formatMoneyValue(tx?.amount ?? draft?.amount)}">
        </div>
        <div class="form-group">
          <label class="form-label">Tipo</label>
          <select class="form-ctrl" id="f-type">
            <option value="expense"  ${initialType === 'expense'  ? 'selected' : ''}>Despesa</option>
            <option value="income"   ${initialType === 'income'   ? 'selected' : ''}>Receita</option>
            <option value="transfer" ${initialType === 'transfer' ? 'selected' : ''}>Transferência</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group" id="single-account-group" style="display:${initialType === 'transfer' ? '' : 'none'}">
          <label class="form-label">Meio de pagamento origem</label>
          <select class="form-ctrl" id="f-account">
            ${accounts.map(a => `<option value="${a.id}" ${(tx?.account_id ?? draft?.account_id) === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Categoria</label>
          <select class="form-ctrl" id="f-category">
            ${categoryOptions(categories, tx?.category_id ?? draft?.category_id, { type: initialType === 'income' ? 'income' : 'expense' })}
          </select>
        </div>
      </div>
      <div id="f-category-hint"></div>
      <div class="form-group" id="payment-splits-group" style="display:${initialType === 'transfer' ? 'none' : ''}">
        <label class="form-label">Meios de pagamento</label>
        <div id="payment-splits" style="display:flex;flex-direction:column;gap:8px">
          ${paymentRowsHtml(initialPayments)}
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" type="button" id="btn-add-payment"><i class="ti ti-plus"></i> Adicionar meio</button>
          <div id="payment-summary" style="font-size:0.78rem;color:var(--text-3)"></div>
        </div>
      </div>
      <div class="form-group" id="installments-group" style="display:${showInitialInstallments ? '' : 'none'}">
        <label class="form-label">Parcelas</label>
        <input class="form-ctrl" id="f-installments" type="number" min="1" max="60" step="1" value="1">
      </div>
      <div class="form-group" id="f-to-account-group" style="display:${initialType === 'transfer' ? '' : 'none'}">
        <label class="form-label">Meio de pagamento destino</label>
        <select class="form-ctrl" id="f-to-account">
          <option value="">— Selecione —</option>
          ${accounts.map(a => `<option value="${a.id}" ${(tx?.to_account_id ?? draft?.toAccountId) === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Data</label>
          <input class="form-ctrl" id="f-date" type="date" value="${tx?.date ?? draft?.date ?? today}">
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select class="form-ctrl" id="f-status">
            <option value="confirmed" ${(tx?.status ?? draft?.status) === 'confirmed' ? 'selected' : ''}>Confirmado</option>
            <option value="pending"   ${(tx?.status ?? draft?.status) === 'pending'   ? 'selected' : ''}>Pendente</option>
          </select>
        </div>
      </div>
      ${familyEnabled && familyMembers.length ? `
        <div class="form-group">
          <label class="form-label">Responsável</label>
          <select class="form-ctrl" id="f-owner">
            <option value="">— Sem responsável —</option>
            ${familyMembers.map(m => `<option value="${esc(m)}" ${tx?.owner === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}
          </select>
        </div>
      ` : ''}
      <div class="form-group">
        <label class="form-label">Observações (opcional)</label>
        <textarea class="form-ctrl" id="f-notes" rows="2">${tx?.notes ?? draft?.notes ?? ''}</textarea>
      </div>
    `,
    onSave: async () => {
      const desc      = (document.getElementById('f-desc')     as HTMLInputElement).value.trim();
      const amount    = moneyInputValue(document.getElementById('f-amount') as HTMLInputElement);
      const type      = (document.getElementById('f-type')     as HTMLSelectElement).value;
      const account   = (document.getElementById('f-account')  as HTMLSelectElement).value;
      const toAccount = (document.getElementById('f-to-account') as HTMLSelectElement | null)?.value ?? '';
      const category  = (document.getElementById('f-category') as HTMLSelectElement).value;
      const date      = (document.getElementById('f-date')     as HTMLInputElement).value;
      const status    = (document.getElementById('f-status')   as HTMLSelectElement).value;
      const notes     = (document.getElementById('f-notes')    as HTMLTextAreaElement).value.trim();
      const owner     = (document.getElementById('f-owner') as HTMLSelectElement | null)?.value || null;
      const installments = parseInt((document.getElementById('f-installments') as HTMLInputElement | null)?.value ?? '1', 10) || 1;

      if (!desc || isNaN(amount) || !date || !account || !category) {
        showAlert('Preencha todos os campos obrigatórios.');
        return false;
      }
      if (type === 'transfer' && (!toAccount || toAccount === account)) {
        showAlert('Selecione um meio de pagamento de destino diferente do meio de origem.');
        return false;
      }
      if (installments > 1 && (tx || type !== 'expense')) {
        showAlert('Parcelas estão disponíveis apenas para novos lançamentos de despesa.');
        return false;
      }
      const payments = type === 'transfer' ? [] : collectPayments(overlay, amount);
      if (type !== 'transfer' && !payments) return false;
      if (installments > 1 && (!payments || payments.length !== 1 || !isCreditCardAccount(payments[0].account_id))) {
        showAlert('Parcelas estão disponíveis apenas para um único meio de pagamento do tipo cartão de crédito.');
        return false;
      }

      const payload = {
        description: desc, amount, type, account_id: type === 'transfer' ? account : payments![0].account_id,
        to_account_id: type === 'transfer' ? toAccount : null,
        category_id: category, date, status, notes: notes || null, recurring: 0, payments, owner,
      };
      if (tx) { await invoke('transactions:update', { id: tx.id, ...payload }); }
      else if (installments > 1) { await invoke('transactions:createInstallments', { ...payload, installments }); }
      else    { await invoke('transactions:create', payload); }
      onDone();
    },
  });
  overlay.dataset.syncFirstPaymentAmount = tx ? 'false' : 'true';
  attachMoneyMask(overlay.querySelector('#f-amount'));

  overlay.querySelector('#f-type')?.addEventListener('change', e => {
    const selectedType = (e.target as HTMLSelectElement).value as TransactionType;
    const isTransfer = selectedType === 'transfer';
    (overlay.querySelector('#f-to-account-group') as HTMLElement).style.display = isTransfer ? '' : 'none';
    (overlay.querySelector('#single-account-group') as HTMLElement).style.display = isTransfer ? '' : 'none';
    (overlay.querySelector('#payment-splits-group') as HTMLElement).style.display = isTransfer ? 'none' : '';
    updatePaymentSummary(overlay);
    updateInstallmentsVisibility(overlay, !!tx);
    const categorySelect = overlay.querySelector<HTMLSelectElement>('#f-category');
    if (categorySelect && !isTransfer) {
      const previous = categorySelect.value;
      categorySelect.innerHTML = categoryOptions(categories, previous, { type: selectedType });
    }
  });
  overlay.querySelector('#f-amount')?.addEventListener('input', () => {
    syncFirstPaymentAmount(overlay);
    updatePaymentSummary(overlay);
  });
  overlay.querySelector('#btn-add-payment')?.addEventListener('click', () => {
    overlay.dataset.syncFirstPaymentAmount = 'false';
    const list = overlay.querySelector<HTMLElement>('#payment-splits')!;
    list.insertAdjacentHTML('beforeend', paymentRowHtml('', remainingAmount(overlay)));
    bindPaymentRows(overlay, !!tx);
    updatePaymentSummary(overlay);
    updateInstallmentsVisibility(overlay, !!tx);
  });
  bindPaymentRows(overlay, !!tx);
  syncFirstPaymentAmount(overlay);
  updatePaymentSummary(overlay);
  updateInstallmentsVisibility(overlay, !!tx);

  if (!tx) {
    let suggestionTimer: ReturnType<typeof setTimeout> | null = null;
    overlay.querySelector('#f-desc')?.addEventListener('input', () => {
      if (suggestionTimer) clearTimeout(suggestionTimer);
      suggestionTimer = setTimeout(() => checkCategorySuggestion(overlay), 400);
    });
    overlay.querySelector('#f-type')?.addEventListener('change', () => checkCategorySuggestion(overlay));
    if (draft?.description) checkCategorySuggestion(overlay);
  }
}

async function openBatchPromptModal(onDone: () => void): Promise<void> {
  const settings = await invoke<{ enabled: boolean; provider: 'openai' | 'gemini' }>('ai:getSettings');
  if (!settings.enabled) {
    await showAlert('Ative a IA em Configurações > IA para usar este recurso.');
    return;
  }

  openModal({
    title: 'Criar lote de lançamentos com IA',
    saveLabel: 'Gerar prévia',
    body: `
      <div class="form-group">
        <label class="form-label">Cole ou descreva os lançamentos</label>
        <textarea class="form-ctrl" id="ai-batch-prompt" rows="5" placeholder="Ex: Pix mercado 82,90 ontem; Uber 31 hoje; aluguel 1200 dia 10"></textarea>
      </div>
      <div style="background:rgba(239,159,39,.08);border:1px solid rgba(239,159,39,.25);border-radius:8px;padding:12px;font-size:0.8rem;color:var(--text-2);line-height:1.6;margin-bottom:12px">
        A IA vai gerar uma prévia editável. Nenhum lançamento será salvo até você revisar e confirmar os itens selecionados.
      </div>
      <label style="display:flex;align-items:flex-start;gap:10px;color:var(--text-2);font-size:0.84rem">
        <input type="checkbox" id="ai-batch-consent" style="margin-top:3px;accent-color:var(--accent)">
        <span>Confirmo o envio do texto e do resumo financeiro agregado para ${settings.provider === 'openai' ? 'OpenAI' : 'Google/Gemini'}.</span>
      </label>
      <div id="ai-batch-result" style="margin-top:12px"></div>
    `,
    onSave: async overlay => {
      const prompt = overlay.querySelector<HTMLTextAreaElement>('#ai-batch-prompt')!.value.trim();
      const consent = overlay.querySelector<HTMLInputElement>('#ai-batch-consent')!.checked;
      const resultEl = overlay.querySelector<HTMLElement>('#ai-batch-result')!;
      if (!prompt) {
        resultEl.innerHTML = `<div style="color:var(--danger);font-size:0.82rem">Informe os lançamentos que deseja criar.</div>`;
        return false;
      }
      if (!consent) {
        resultEl.innerHTML = `<div style="color:var(--danger);font-size:0.82rem">Confirme o consentimento para continuar.</div>`;
        return false;
      }

      const saveBtn = overlay.querySelector<HTMLButtonElement>('[data-save]')!;
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="ti ti-loader ti-spin"></i> Gerando...';
      try {
        const batch = await invoke<AITransactionBatchDraft>('ai:createTransactionBatchDrafts', { prompt, consentConfirmed: true });
        overlay.remove();
        openBatchReviewModal(batch, onDone);
      } catch (err) {
        resultEl.innerHTML = `<div style="color:var(--danger);font-size:0.82rem">${esc(err instanceof Error ? err.message : 'Não foi possível gerar a prévia.')}</div>`;
        saveBtn.disabled = false;
        saveBtn.innerHTML = 'Gerar prévia';
      }
      return false;
    },
  });
}

function openBatchReviewModal(batch: AITransactionBatchDraft, onDone: () => void): void {
  const overlay = openModal({
    title: 'Revisar lançamentos gerados por IA',
    saveLabel: 'Salvar selecionados',
    body: `
      <div style="background:rgba(29,158,117,.08);border:1px solid rgba(29,158,117,.2);border-radius:8px;padding:12px;margin-bottom:12px;font-size:0.82rem;color:var(--text-2);line-height:1.5">
        <strong style="color:var(--accent)">Prévia gerada por IA.</strong> ${esc(batch.explanation)}
        ${batch.warnings.length ? `<ul style="margin:8px 0 0 18px;color:var(--warning)">${batch.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
      </div>
      <div style="max-height:360px;overflow:auto;border:1px solid var(--border);border-radius:8px">
        <table class="table" style="margin:0;min-width:860px">
          <thead>
            <tr>
              <th></th>
              <th>Descrição</th>
              <th>Valor</th>
              <th>Tipo</th>
              <th>Data</th>
              <th>Categoria</th>
              <th>Meio</th>
            </tr>
          </thead>
          <tbody>
            ${batch.drafts.map((draft, index) => `
              <tr class="ai-batch-row" data-index="${index}">
                <td><input type="checkbox" class="ai-batch-enabled" checked></td>
                <td><input class="form-ctrl ai-batch-desc" value="${esc(draft.description ?? '')}" style="min-width:180px"></td>
                <td><input class="form-ctrl ai-batch-amount" type="text" inputmode="decimal" value="${formatMoneyValue(draft.amount)}" style="width:110px"></td>
                <td>
                  <select class="form-ctrl ai-batch-type" style="width:120px">
                    <option value="expense" ${draft.type === 'expense' ? 'selected' : ''}>Despesa</option>
                    <option value="income" ${draft.type === 'income' ? 'selected' : ''}>Receita</option>
                  </select>
                </td>
                <td><input class="form-ctrl ai-batch-date" type="date" value="${draft.date ?? new Date().toISOString().slice(0, 10)}" style="width:140px"></td>
                <td>
                  <select class="form-ctrl ai-batch-category" style="min-width:150px">
                    ${categoryOptions(categories, draft.category_id, { type: draft.type === 'income' ? 'income' : 'expense' })}
                  </select>
                  ${draft.warnings.length ? `<div style="font-size:0.72rem;color:var(--warning);margin-top:4px">${esc(draft.warnings.join(' '))}</div>` : ''}
                </td>
                <td>
                  <select class="form-ctrl ai-batch-account" style="min-width:150px">
                    ${accounts.map(a => `<option value="${a.id}" ${draft.account_id === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
                  </select>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `,
    onSave: async reviewOverlay => {
      const rows = [...reviewOverlay.querySelectorAll<HTMLElement>('.ai-batch-row')]
        .filter(row => row.querySelector<HTMLInputElement>('.ai-batch-enabled')!.checked);
      if (rows.length === 0) {
        showAlert('Selecione ao menos um lançamento para salvar.');
        return false;
      }
      if (!await showConfirm(`Salvar ${rows.length} lançamento${rows.length !== 1 ? 's' : ''} revisado${rows.length !== 1 ? 's' : ''}?`, { okLabel: 'Salvar' })) return false;

      for (const row of rows) {
        const description = row.querySelector<HTMLInputElement>('.ai-batch-desc')!.value.trim();
        const amount = moneyInputValue(row.querySelector<HTMLInputElement>('.ai-batch-amount'));
        const type = row.querySelector<HTMLSelectElement>('.ai-batch-type')!.value as TransactionType;
        const date = row.querySelector<HTMLInputElement>('.ai-batch-date')!.value;
        const category_id = row.querySelector<HTMLSelectElement>('.ai-batch-category')!.value;
        const account_id = row.querySelector<HTMLSelectElement>('.ai-batch-account')!.value;
        if (!description || !Number.isFinite(amount) || amount <= 0 || !date || !category_id || !account_id) {
          showAlert('Revise descrição, valor, data, categoria e meio de pagamento dos itens selecionados.');
          return false;
        }
        await invoke('transactions:create', {
          description,
          amount,
          type,
          account_id,
          to_account_id: null,
          category_id,
          date,
          status: 'confirmed',
          notes: null,
          recurring: 0,
          payments: [{ account_id, amount }],
          owner: null,
        });
      }
      onDone();
    },
  });

  overlay.querySelectorAll<HTMLInputElement>('.ai-batch-amount').forEach(input => attachMoneyMask(input));

  overlay.querySelectorAll<HTMLSelectElement>('.ai-batch-type').forEach(select => {
    select.addEventListener('change', () => {
      const row = select.closest<HTMLElement>('.ai-batch-row');
      const categorySelect = row?.querySelector<HTMLSelectElement>('.ai-batch-category');
      if (!categorySelect) return;
      const previous = categorySelect.value;
      categorySelect.innerHTML = categoryOptions(categories, previous, { type: select.value as 'income' | 'expense' });
    });
  });
}

async function checkCategorySuggestion(overlay: HTMLElement): Promise<void> {
  const description = overlay.querySelector<HTMLInputElement>('#f-desc')!.value.trim();
  const type = overlay.querySelector<HTMLSelectElement>('#f-type')!.value as TransactionType;
  const hintEl = overlay.querySelector<HTMLElement>('#f-category-hint')!;

  if (!description || type === 'transfer') { hintEl.innerHTML = ''; return; }

  const suggestion = await invoke<CategorySuggestion | null>('categories:suggestFromHistory', { description, type });
  if (!suggestion) { hintEl.innerHTML = ''; return; }

  hintEl.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;font-size:0.78rem;color:var(--text-2);margin:6px 0 0">
      <i class="ti ti-bulb" style="color:var(--accent)"></i>
      <span>${esc(suggestion.reason)}</span>
      <button type="button" class="btn btn-ghost btn-sm" id="btn-apply-category-suggestion">Usar</button>
    </div>
  `;
  hintEl.querySelector('#btn-apply-category-suggestion')?.addEventListener('click', () => {
    overlay.querySelector<HTMLSelectElement>('#f-category')!.value = suggestion.categoryId;
    hintEl.innerHTML = '';
  });
}

function openImportModal(): void {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:540px">
      <div class="modal-header">
        <span class="modal-title"><i class="ti ti-upload"></i> Importar extrato</span>
        <button class="btn btn-ghost btn-sm modal-close"><i class="ti ti-x"></i></button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
        <div style="background:rgba(29,158,117,.08);border:1px solid rgba(29,158,117,.2);border-radius:8px;padding:12px;font-size:0.82rem;color:var(--text-2)">
          <i class="ti ti-info-circle" style="color:var(--accent)"></i>
          Formatos suportados: <strong>CSV</strong> (Nubank, Itaú, Bradesco, Santander) e <strong>OFX/QFX</strong>.
        </div>
        <div class="form-group">
          <label class="form-label">Arquivo</label>
          <input class="form-ctrl" id="imp-file" type="file" accept=".csv,.ofx,.qfx">
        </div>
        <div class="form-group">
          <label class="form-label">Meio de pagamento de destino *</label>
          <select class="form-ctrl" id="imp-account">
            <option value="">— Selecione —</option>
            ${accounts.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Categoria padrão *</label>
          <select class="form-ctrl" id="imp-category">
            <option value="">— Selecione —</option>
            ${categoryOptions(categories)}
          </select>
        </div>
        <label style="display:flex;align-items:center;gap:8px;font-size:0.82rem;color:var(--text-2)">
          <input id="imp-use-suggestions" type="checkbox" checked style="accent-color:var(--accent)">
          Usar categoria sugerida quando houver correspondência
        </label>
        <div id="imp-preview"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary modal-close">Cancelar</button>
        <button class="btn btn-secondary" id="btn-imp-preview">
          <i class="ti ti-eye"></i> Pré-visualizar
        </button>
        <button class="btn btn-primary" id="btn-imp-confirm" disabled>
          <i class="ti ti-check"></i> Importar
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.querySelectorAll('.modal-close').forEach(b => b.addEventListener('click', () => overlay.remove()));

  let previewedRows: unknown[] = [];

  overlay.querySelector('#btn-imp-preview')?.addEventListener('click', async () => {
    const fileInput = overlay.querySelector<HTMLInputElement>('#imp-file')!;
    const file = fileInput.files?.[0];
    if (!file) { showAlert('Selecione um arquivo.'); return; }

    const filePath = (file as File & { path?: string }).path ?? '';
    if (!filePath) { showAlert('Não foi possível ler o caminho do arquivo.'); return; }

    const preview = await invoke<{ rows: unknown[]; format: string; total: number; duplicates: number }>('import:preview', filePath);
    previewedRows = preview.rows;

    const previewEl = overlay.querySelector('#imp-preview')!;
    previewEl.innerHTML = `
      <div style="font-size:0.82rem;color:var(--text-2);margin-bottom:8px">
        <strong>${preview.total}</strong> transações encontradas
        ${preview.duplicates > 0 ? `· <span style="color:var(--warning)">${preview.duplicates} duplicata${preview.duplicates !== 1 ? 's' : ''} serão ignoradas</span>` : ''}
        · Formato: <strong>${preview.format.toUpperCase()}</strong>
      </div>
      <div style="max-height:220px;overflow-y:auto;font-size:0.78rem;border:1px solid var(--border);border-radius:6px">
        <table class="table" style="margin:0">
          <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Valor</th><th>Tipo</th></tr></thead>
          <tbody>
            ${(preview.rows as { date: string; description: string; amount: number; type: string; duplicate: boolean; suggested_category_name?: string | null; suggested_category_reason?: string | null }[]).slice(0, 50).map(r => `
              <tr style="${r.duplicate ? 'opacity:0.4' : ''}">
                <td>${r.date}</td>
                <td>${esc(r.description)}</td>
                <td>${r.suggested_category_name ? `<span class="badge badge-ok" title="${esc(r.suggested_category_reason ?? '')}">${esc(r.suggested_category_name)}</span>` : '<span style="color:var(--text-3)">Padrão</span>'}</td>
                <td style="color:${r.type === 'income' ? 'var(--accent)' : 'var(--danger)'}">
                  ${r.type === 'income' ? '+' : '-'}R$ ${r.amount.toFixed(2).replace('.', ',')}
                </td>
                <td>${r.duplicate ? '<span style="color:var(--warning)">Duplicata</span>' : (r.type === 'income' ? 'Receita' : 'Despesa')}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    (overlay.querySelector('#btn-imp-confirm') as HTMLButtonElement).disabled = preview.total === 0;
  });

  overlay.querySelector('#btn-imp-confirm')?.addEventListener('click', async () => {
    const accountId  = (overlay.querySelector<HTMLSelectElement>('#imp-account')!).value;
    const categoryId = (overlay.querySelector<HTMLSelectElement>('#imp-category')!).value;
    const useSuggestions = overlay.querySelector<HTMLInputElement>('#imp-use-suggestions')!.checked;
    if (!accountId || !categoryId) { showAlert('Selecione o meio de pagamento e a categoria de destino.'); return; }

    const result = await invoke<{ imported: number; skipped: number }>('import:confirm', {
      rows: previewedRows,
      accountId,
      categoryId,
      useSuggestions,
    });

    overlay.remove();
    showAlert(`Importação concluída: ${result.imported} transações importadas, ${result.skipped} ignoradas.`);
    await invoke('transactions:list', {});
  });
}

function alpha(hex: string, a: number): string {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}
function esc(s?: string): string {
  return (s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g, '&quot;');
}

function initialPaymentSplits(payments: PaymentSplitWithAccount[] | undefined, accountId: string | undefined, amount: number | undefined): PaymentSplit[] {
  if (payments?.length) return payments.map(p => ({ account_id: p.account_id, amount: p.amount, is_pix: p.is_pix }));
  return [{ account_id: accountId ?? accounts[0]?.id ?? '', amount: amount ?? 0 }];
}

function isCreditCardAccount(accountId: string | undefined): boolean {
  return accounts.find(account => account.id === accountId)?.type === 'credit_card';
}

function paymentRowsHtml(payments: PaymentSplit[]): string {
  return payments.map(payment => paymentRowHtml(payment.account_id, payment.amount, !!payment.is_pix)).join('');
}

function paymentRowHtml(accountId: string, amount: number, isPix = false): string {
  const pixEligible = accountId ? isPixEligibleAccountType(accounts.find(a => a.id === accountId)?.type ?? '') : false;
  return `
    <div class="payment-row" style="display:grid;grid-template-columns:minmax(0,1fr) 150px 64px 34px;gap:8px;align-items:center">
      <select class="form-ctrl payment-account">
        <option value="">— Selecione —</option>
        ${accounts.map(a => `<option value="${a.id}" ${accountId === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
      </select>
      <input class="form-ctrl payment-amount" type="text" inputmode="decimal" value="${amount ? formatMoneyValue(amount) : ''}" placeholder="Valor">
      <label class="payment-pix-label" style="display:${pixEligible ? 'flex' : 'none'};align-items:center;gap:4px;font-size:11px;color:var(--text-2)" title="Pago via Pix">
        <input type="checkbox" class="payment-pix" ${isPix ? 'checked' : ''}> Pix
      </label>
      <button class="btn btn-ghost btn-sm payment-remove" type="button" title="Remover"><i class="ti ti-x"></i></button>
    </div>
  `;
}

function updatePaymentPixVisibility(row: HTMLElement): void {
  const accountId = row.querySelector<HTMLSelectElement>('.payment-account')!.value;
  const pixEligible = accountId ? isPixEligibleAccountType(accounts.find(a => a.id === accountId)?.type ?? '') : false;
  const label = row.querySelector<HTMLElement>('.payment-pix-label')!;
  const checkbox = row.querySelector<HTMLInputElement>('.payment-pix')!;
  label.style.display = pixEligible ? 'flex' : 'none';
  if (!pixEligible) checkbox.checked = false;
}

function bindPaymentRows(overlay: HTMLElement, editing = false): void {
  overlay.querySelectorAll<HTMLElement>('.payment-row').forEach(row => {
    if (row.dataset.bound === 'true') return;
    row.dataset.bound = 'true';
    attachMoneyMask(row.querySelector<HTMLInputElement>('.payment-amount'));
    row.querySelector<HTMLSelectElement>('.payment-account')?.addEventListener('change', () => updatePaymentPixVisibility(row));
    row.querySelectorAll('input, select').forEach(ctrl => {
      ctrl.addEventListener('input', () => {
        if ((ctrl as HTMLElement).classList.contains('payment-amount')) {
          overlay.dataset.syncFirstPaymentAmount = 'false';
        }
        updatePaymentSummary(overlay);
      });
      ctrl.addEventListener('change', () => {
        updatePaymentSummary(overlay);
        updateInstallmentsVisibility(overlay, editing);
      });
    });
    row.querySelector<HTMLElement>('.payment-remove')?.addEventListener('click', () => {
      if (overlay.querySelectorAll('.payment-row').length <= 1) return;
      row.remove();
      updatePaymentSummary(overlay);
      updateInstallmentsVisibility(overlay, editing);
    });
  });
}

function syncFirstPaymentAmount(overlay: HTMLElement): void {
  if (overlay.dataset.syncFirstPaymentAmount !== 'true') return;
  const rows = [...overlay.querySelectorAll<HTMLElement>('.payment-row')];
  if (rows.length !== 1) return;
  const totalInput = overlay.querySelector<HTMLInputElement>('#f-amount');
  const firstPaymentInput = rows[0].querySelector<HTMLInputElement>('.payment-amount');
  if (!totalInput || !firstPaymentInput) return;
  firstPaymentInput.value = totalInput.value;
}

function collectPayments(overlay: HTMLElement, total: number): PaymentSplit[] | null {
  const rows = [...overlay.querySelectorAll<HTMLElement>('.payment-row')];
  const payments = rows.map(row => ({
    account_id: row.querySelector<HTMLSelectElement>('.payment-account')!.value,
    amount: moneyInputValue(row.querySelector<HTMLInputElement>('.payment-amount')),
    is_pix: (row.querySelector<HTMLInputElement>('.payment-pix')?.checked ? 1 : 0) as 0 | 1,
  }));
  const seen = new Set<string>();
  let sum = 0;
  for (const payment of payments) {
    if (!payment.account_id || !Number.isFinite(payment.amount) || payment.amount <= 0) {
      showAlert('Preencha todos os meios de pagamento com valores válidos.');
      return null;
    }
    if (seen.has(payment.account_id)) {
      showAlert('Não repita o mesmo meio de pagamento no lançamento.');
      return null;
    }
    seen.add(payment.account_id);
    sum += payment.amount;
  }
  if (Math.abs(sum - total) > 0.005) {
    showAlert('A soma dos meios de pagamento deve ser igual ao valor total.');
    return null;
  }
  return payments;
}

function remainingAmount(overlay: HTMLElement): number {
  const total = moneyInputValue(overlay.querySelector<HTMLInputElement>('#f-amount')) || 0;
  const used = [...overlay.querySelectorAll<HTMLInputElement>('.payment-amount')]
    .reduce((sum, input) => sum + (moneyInputValue(input) || 0), 0);
  return Math.max(0, Math.round((total - used) * 100) / 100);
}

function updatePaymentSummary(overlay: HTMLElement): void {
  const summary = overlay.querySelector<HTMLElement>('#payment-summary');
  if (!summary) return;
  const total = moneyInputValue(overlay.querySelector<HTMLInputElement>('#f-amount')) || 0;
  const used = [...overlay.querySelectorAll<HTMLInputElement>('.payment-amount')]
    .reduce((sum, input) => sum + (moneyInputValue(input) || 0), 0);
  const rest = Math.round((total - used) * 100) / 100;
  summary.innerHTML = `Total: <strong>${formatCurrency(total)}</strong> · Distribuído: <strong>${formatCurrency(used)}</strong> · Restante: <strong style="color:${Math.abs(rest) < 0.005 ? 'var(--accent)' : 'var(--danger)'}">${formatCurrency(rest)}</strong>`;
}

function updateInstallmentsVisibility(overlay: HTMLElement, editing: boolean): void {
  const group = overlay.querySelector<HTMLElement>('#installments-group');
  if (!group) return;
  const type = overlay.querySelector<HTMLSelectElement>('#f-type')?.value;
  const rows = [...overlay.querySelectorAll<HTMLElement>('.payment-row')];
  const accountId = rows[0]?.querySelector<HTMLSelectElement>('.payment-account')?.value;
  const visible = !editing && type === 'expense' && rows.length === 1 && isCreditCardAccount(accountId);
  group.style.display = visible ? '' : 'none';
  if (!visible) {
    const input = group.querySelector<HTMLInputElement>('#f-installments');
    if (input) input.value = '1';
  }
}
