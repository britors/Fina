import { invoke } from '../api';
import { formatCurrency, formatDate, calculateMonthlySummary } from '../../shared/utils';
import { openModal } from '../components/modal';
import { setTopbarActions } from '../components/topbar';
import type { Account, Category, TransactionWithDetails, TransactionType } from '../../shared/types';

let accounts: Account[]  = [];
let categories: Category[] = [];

export async function render(el: HTMLElement): Promise<void> {
  const now = new Date();
  let month = now.getMonth() + 1;
  let year  = now.getFullYear();
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
    const now2 = new Date();
    await invoke('export:csv', { month: now2.getMonth() + 1, year: now2.getFullYear() });
  });
  document.getElementById('btn-import')?.addEventListener('click', () => openImportModal());

  async function renderPage(): Promise<void> {
    const txs = await invoke<TransactionWithDetails[]>('transactions:list', {
      month, year, type: typeFilter || undefined, limit: 200,
    });
    const summary = calculateMonthlySummary(txs);

    el.innerHTML = `
      <!-- Chips -->
      <div class="filters" style="margin-bottom:16px">
        <span class="chip ${!typeFilter ? 'active' : ''}" data-type="">Todos</span>
        <span class="chip ${typeFilter === 'income' ? 'active' : ''}" data-type="income">Receitas</span>
        <span class="chip ${typeFilter === 'expense' ? 'active' : ''}" data-type="expense">Despesas</span>
        <div style="flex:1"></div>
        <!-- Month picker -->
        <input type="month" class="form-ctrl" style="width:160px"
          id="month-picker"
          value="${year}-${String(month).padStart(2,'0')}">
      </div>

      <!-- Summary -->
      <div class="grid-3" style="margin-bottom:16px">
        <div class="stat-card">
          <div class="stat-label">Total de receitas</div>
          <div class="stat-value stat-green">+${formatCurrency(summary.income)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total de despesas</div>
          <div class="stat-value stat-red">-${formatCurrency(summary.expense)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Saldo do mês</div>
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

    // Month picker
    el.querySelector<HTMLInputElement>('#month-picker')?.addEventListener('change', e => {
      const [y, m] = (e.target as HTMLInputElement).value.split('-').map(Number);
      year = y; month = m;
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
  openModal({
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
        <div class="form-group">
          <label class="form-label">Conta</label>
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
      const desc     = (document.getElementById('f-desc')     as HTMLInputElement).value.trim();
      const amount   = parseFloat((document.getElementById('f-amount')   as HTMLInputElement).value);
      const type     = (document.getElementById('f-type')     as HTMLSelectElement).value;
      const account  = (document.getElementById('f-account')  as HTMLSelectElement).value;
      const category = (document.getElementById('f-category') as HTMLSelectElement).value;
      const date     = (document.getElementById('f-date')     as HTMLInputElement).value;
      const status   = (document.getElementById('f-status')   as HTMLSelectElement).value;
      const notes    = (document.getElementById('f-notes')    as HTMLTextAreaElement).value.trim();

      if (!desc || isNaN(amount) || !date || !account || !category) {
        alert('Preencha todos os campos obrigatórios.');
        return false;
      }

      const payload = { description: desc, amount, type, account_id: account, category_id: category, date, status, notes: notes || null, recurring: 0 };
      if (tx) { await invoke('transactions:update', { id: tx.id, ...payload }); }
      else    { await invoke('transactions:create', payload); }
      onDone();
    },
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
          <label class="form-label">Conta de destino *</label>
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
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

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
          <thead><tr><th>Data</th><th>Descrição</th><th>Valor</th><th>Tipo</th></tr></thead>
          <tbody>
            ${(preview.rows as { date: string; description: string; amount: number; type: string; duplicate: boolean }[]).slice(0, 50).map(r => `
              <tr style="${r.duplicate ? 'opacity:0.4' : ''}">
                <td>${r.date}</td>
                <td>${esc(r.description)}</td>
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
    if (!accountId || !categoryId) { alert('Selecione a conta e a categoria de destino.'); return; }

    const result = await invoke<{ imported: number; skipped: number }>('import:confirm', {
      rows: previewedRows,
      accountId,
      categoryId,
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
