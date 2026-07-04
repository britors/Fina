import { invoke } from '../api';
import { formatCurrency, formatDate, calculateMonthlySummary } from '../../shared/utils';
import { openModal } from '../components/modal';
import { setTopbarActions } from '../components/topbar';
import type { Account, Category, PaymentSplit, PaymentSplitWithAccount, TransactionWithDetails, TransactionType } from '../../shared/types';

let accounts: Account[]  = [];
let categories: Category[] = [];

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

  [accounts, categories] = await Promise.all([
    invoke<Account[]>('accounts:list'),
    invoke<Category[]>('categories:list'),
  ]);

  setTopbarActions(`
    <button class="btn btn-secondary" id="btn-import">
      <i class="ti ti-upload"></i> Importar extrato
    </button>
    <button class="btn btn-secondary" id="btn-export-csv">
      <i class="ti ti-download"></i> Exportar CSV
    </button>
    <button class="btn btn-primary" id="btn-new-tx">
      <i class="ti ti-plus"></i> Novo lançamento
    </button>
  `);
  document.getElementById('btn-new-tx')?.addEventListener('click', () => openTxModal(null, () => renderPage()));
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

    const txs = await invoke<TransactionWithDetails[]>('transactions:list', {
      dateFrom, dateTo, type: typeFilter || undefined, limit: 200,
    });
    const summary = calculateMonthlySummary(txs);

    el.innerHTML = `
      <!-- Chips -->
      <div class="filters" style="margin-bottom:16px">
        <span class="chip ${!typeFilter ? 'active' : ''}" data-type="">Todos</span>
        <span class="chip ${typeFilter === 'income' ? 'active' : ''}" data-type="income">Receitas</span>
        <span class="chip ${typeFilter === 'expense' ? 'active' : ''}" data-type="expense">Despesas</span>
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
                          <div class="desc-sub">${esc(t.account_name)}</div>
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
        if (!confirm('Excluir esta transação?')) return;
        await invoke('transactions:delete', btn.dataset.del);
        renderPage();
      });
    });
  }

  await renderPage();
}

function openTxModal(tx: TransactionWithDetails | null, onDone: () => void): void {
  const today = new Date().toISOString().split('T')[0];
  const initialPayments = initialPaymentSplits(tx?.payments, tx?.account_id, tx?.amount);
  const overlay = openModal({
    title: tx ? 'Editar transação' : 'Nova transação',
    body: `
      <div class="form-group">
        <label class="form-label">Descrição</label>
        <input class="form-ctrl" id="f-desc" value="${esc(tx?.description ?? '')}" placeholder="Ex: Supermercado">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Valor (R$)</label>
          <input class="form-ctrl" id="f-amount" type="number" step="0.01" min="0" value="${tx?.amount ?? ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Tipo</label>
          <select class="form-ctrl" id="f-type">
            <option value="expense"  ${tx?.type === 'expense'  ? 'selected' : ''}>Despesa</option>
            <option value="income"   ${tx?.type === 'income'   ? 'selected' : ''}>Receita</option>
            <option value="transfer" ${tx?.type === 'transfer' ? 'selected' : ''}>Transferência</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group" id="single-account-group" style="display:${tx?.type === 'transfer' ? '' : 'none'}">
          <label class="form-label">Meio de pagamento origem</label>
          <select class="form-ctrl" id="f-account">
            ${accounts.map(a => `<option value="${a.id}" ${tx?.account_id === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Categoria</label>
          <select class="form-ctrl" id="f-category">
            ${categories.map(c => `<option value="${c.id}" ${tx?.category_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group" id="payment-splits-group" style="display:${tx?.type === 'transfer' ? 'none' : ''}">
        <label class="form-label">Meios de pagamento</label>
        <div id="payment-splits" style="display:flex;flex-direction:column;gap:8px">
          ${paymentRowsHtml(initialPayments)}
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" type="button" id="btn-add-payment"><i class="ti ti-plus"></i> Adicionar meio</button>
          <div id="payment-summary" style="font-size:0.78rem;color:var(--text-3)"></div>
        </div>
      </div>
      <div class="form-group" id="f-to-account-group" style="display:${tx?.type === 'transfer' ? '' : 'none'}">
        <label class="form-label">Meio de pagamento destino</label>
        <select class="form-ctrl" id="f-to-account">
          <option value="">— Selecione —</option>
          ${accounts.map(a => `<option value="${a.id}" ${tx?.to_account_id === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Data</label>
          <input class="form-ctrl" id="f-date" type="date" value="${tx?.date ?? today}">
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select class="form-ctrl" id="f-status">
            <option value="confirmed" ${tx?.status === 'confirmed' ? 'selected' : ''}>Confirmado</option>
            <option value="pending"   ${tx?.status === 'pending'   ? 'selected' : ''}>Pendente</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Observações (opcional)</label>
        <textarea class="form-ctrl" id="f-notes" rows="2">${tx?.notes ?? ''}</textarea>
      </div>
    `,
    onSave: async () => {
      const desc      = (document.getElementById('f-desc')     as HTMLInputElement).value.trim();
      const amount    = parseFloat((document.getElementById('f-amount')   as HTMLInputElement).value);
      const type      = (document.getElementById('f-type')     as HTMLSelectElement).value;
      const account   = (document.getElementById('f-account')  as HTMLSelectElement).value;
      const toAccount = (document.getElementById('f-to-account') as HTMLSelectElement | null)?.value ?? '';
      const category  = (document.getElementById('f-category') as HTMLSelectElement).value;
      const date      = (document.getElementById('f-date')     as HTMLInputElement).value;
      const status    = (document.getElementById('f-status')   as HTMLSelectElement).value;
      const notes     = (document.getElementById('f-notes')    as HTMLTextAreaElement).value.trim();

      if (!desc || isNaN(amount) || !date || !account || !category) {
        alert('Preencha todos os campos obrigatórios.');
        return false;
      }
      if (type === 'transfer' && (!toAccount || toAccount === account)) {
        alert('Selecione um meio de pagamento de destino diferente do meio de origem.');
        return false;
      }
      const payments = type === 'transfer' ? [] : collectPayments(overlay, amount);
      if (type !== 'transfer' && !payments) return false;

      const payload = {
        description: desc, amount, type, account_id: type === 'transfer' ? account : payments![0].account_id,
        to_account_id: type === 'transfer' ? toAccount : null,
        category_id: category, date, status, notes: notes || null, recurring: 0, payments,
      };
      if (tx) { await invoke('transactions:update', { id: tx.id, ...payload }); }
      else    { await invoke('transactions:create', payload); }
      onDone();
    },
  });

  overlay.querySelector('#f-type')?.addEventListener('change', e => {
    const isTransfer = (e.target as HTMLSelectElement).value === 'transfer';
    (overlay.querySelector('#f-to-account-group') as HTMLElement).style.display = isTransfer ? '' : 'none';
    (overlay.querySelector('#single-account-group') as HTMLElement).style.display = isTransfer ? '' : 'none';
    (overlay.querySelector('#payment-splits-group') as HTMLElement).style.display = isTransfer ? 'none' : '';
    updatePaymentSummary(overlay);
  });
  overlay.querySelector('#f-amount')?.addEventListener('input', () => updatePaymentSummary(overlay));
  overlay.querySelector('#btn-add-payment')?.addEventListener('click', () => {
    const list = overlay.querySelector<HTMLElement>('#payment-splits')!;
    list.insertAdjacentHTML('beforeend', paymentRowHtml('', remainingAmount(overlay)));
    bindPaymentRows(overlay);
    updatePaymentSummary(overlay);
  });
  bindPaymentRows(overlay);
  updatePaymentSummary(overlay);
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
            ${categories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
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
    if (!file) { alert('Selecione um arquivo.'); return; }

    const filePath = (file as File & { path?: string }).path ?? '';
    if (!filePath) { alert('Não foi possível ler o caminho do arquivo.'); return; }

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
            ${(preview.rows as { date: string; description: string; amount: number; type: string; duplicate: boolean; suggested_category_name?: string | null }[]).slice(0, 50).map(r => `
              <tr style="${r.duplicate ? 'opacity:0.4' : ''}">
                <td>${r.date}</td>
                <td>${esc(r.description)}</td>
                <td>${r.suggested_category_name ? `<span class="badge badge-ok">${esc(r.suggested_category_name)}</span>` : '<span style="color:var(--text-3)">Padrão</span>'}</td>
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
    if (!accountId || !categoryId) { alert('Selecione o meio de pagamento e a categoria de destino.'); return; }

    const result = await invoke<{ imported: number; skipped: number }>('import:confirm', {
      rows: previewedRows,
      accountId,
      categoryId,
      useSuggestions,
    });

    overlay.remove();
    alert(`Importação concluída: ${result.imported} transações importadas, ${result.skipped} ignoradas.`);
    await invoke('transactions:list', {});
  });
}

function alpha(hex: string, a: number): string {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}
function esc(s?: string): string {
  return (s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function initialPaymentSplits(payments: PaymentSplitWithAccount[] | undefined, accountId: string | undefined, amount: number | undefined): PaymentSplit[] {
  if (payments?.length) return payments.map(p => ({ account_id: p.account_id, amount: p.amount }));
  return [{ account_id: accountId ?? accounts[0]?.id ?? '', amount: amount ?? 0 }];
}

function paymentRowsHtml(payments: PaymentSplit[]): string {
  return payments.map(payment => paymentRowHtml(payment.account_id, payment.amount)).join('');
}

function paymentRowHtml(accountId: string, amount: number): string {
  return `
    <div class="payment-row" style="display:grid;grid-template-columns:minmax(0,1fr) 150px 34px;gap:8px;align-items:center">
      <select class="form-ctrl payment-account">
        <option value="">— Selecione —</option>
        ${accounts.map(a => `<option value="${a.id}" ${accountId === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
      </select>
      <input class="form-ctrl payment-amount" type="number" step="0.01" min="0" value="${amount || ''}" placeholder="Valor">
      <button class="btn btn-ghost btn-sm payment-remove" type="button" title="Remover"><i class="ti ti-x"></i></button>
    </div>
  `;
}

function bindPaymentRows(overlay: HTMLElement): void {
  overlay.querySelectorAll<HTMLElement>('.payment-row').forEach(row => {
    row.querySelectorAll('input, select').forEach(ctrl => {
      ctrl.addEventListener('input', () => updatePaymentSummary(overlay));
      ctrl.addEventListener('change', () => updatePaymentSummary(overlay));
    });
    row.querySelector<HTMLElement>('.payment-remove')?.addEventListener('click', () => {
      if (overlay.querySelectorAll('.payment-row').length <= 1) return;
      row.remove();
      updatePaymentSummary(overlay);
    });
  });
}

function collectPayments(overlay: HTMLElement, total: number): PaymentSplit[] | null {
  const rows = [...overlay.querySelectorAll<HTMLElement>('.payment-row')];
  const payments = rows.map(row => ({
    account_id: row.querySelector<HTMLSelectElement>('.payment-account')!.value,
    amount: parseFloat(row.querySelector<HTMLInputElement>('.payment-amount')!.value),
  }));
  const seen = new Set<string>();
  let sum = 0;
  for (const payment of payments) {
    if (!payment.account_id || !Number.isFinite(payment.amount) || payment.amount <= 0) {
      alert('Preencha todos os meios de pagamento com valores válidos.');
      return null;
    }
    if (seen.has(payment.account_id)) {
      alert('Não repita o mesmo meio de pagamento no lançamento.');
      return null;
    }
    seen.add(payment.account_id);
    sum += payment.amount;
  }
  if (Math.abs(sum - total) > 0.005) {
    alert('A soma dos meios de pagamento deve ser igual ao valor total.');
    return null;
  }
  return payments;
}

function remainingAmount(overlay: HTMLElement): number {
  const total = parseFloat((overlay.querySelector<HTMLInputElement>('#f-amount')?.value ?? '0')) || 0;
  const used = [...overlay.querySelectorAll<HTMLInputElement>('.payment-amount')]
    .reduce((sum, input) => sum + (parseFloat(input.value) || 0), 0);
  return Math.max(0, Math.round((total - used) * 100) / 100);
}

function updatePaymentSummary(overlay: HTMLElement): void {
  const summary = overlay.querySelector<HTMLElement>('#payment-summary');
  if (!summary) return;
  const total = parseFloat((overlay.querySelector<HTMLInputElement>('#f-amount')?.value ?? '0')) || 0;
  const used = [...overlay.querySelectorAll<HTMLInputElement>('.payment-amount')]
    .reduce((sum, input) => sum + (parseFloat(input.value) || 0), 0);
  const rest = Math.round((total - used) * 100) / 100;
  summary.innerHTML = `Total: <strong>${formatCurrency(total)}</strong> · Distribuído: <strong>${formatCurrency(used)}</strong> · Restante: <strong style="color:${Math.abs(rest) < 0.005 ? 'var(--accent)' : 'var(--danger)'}">${formatCurrency(rest)}</strong>`;
}
