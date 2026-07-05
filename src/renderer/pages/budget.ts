import { invoke } from '../api';
import { formatCurrency, calculateBudgetPercentage } from '../../shared/utils';
import { openModal } from '../components/modal';
import { openCategoryModal } from '../components/categoryModal';
import { setTopbarActions } from '../components/topbar';
import { aiDraftNotice, openAICreateDraft } from '../components/aiCreateDraft';
import type { AIBudgetDraft, BudgetWithProgress, Category } from '../../shared/types';

export async function render(el: HTMLElement): Promise<void> {
  const now = new Date();
  let month = now.getMonth() + 1;
  let year  = now.getFullYear();

  setTopbarActions(`
    <button class="btn btn-secondary" id="btn-ai-create-budget"><i class="ti ti-sparkles"></i> Criar com IA</button>
    <button class="btn btn-primary" id="btn-new-budget"><i class="ti ti-plus"></i> Novo orçamento</button>
  `);

  async function renderPage(): Promise<void> {
    const budgets = await invoke<BudgetWithProgress[]>('budgets:list', { month, year });
    const periodLabel = new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    const totalCarried = budgets.reduce((s, b) => s + b.carried_in, 0);
    const totalLimit = budgets.reduce((s, b) => s + b.limit_amount, 0) + totalCarried;
    const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);
    const globalPct  = calculateBudgetPercentage(totalSpent, totalLimit);

    el.innerHTML = `
      <!-- Month filter -->
      <div class="filters" style="margin-bottom:16px">
        <span style="font-size:0.8rem;color:var(--text-2)">Mês do orçamento</span>
        <button class="btn btn-secondary btn-sm" id="budget-prev-month" title="Mês anterior"><i class="ti ti-chevron-left"></i></button>
        <input type="month" class="form-ctrl" style="width:160px" id="month-picker"
          value="${year}-${String(month).padStart(2,'0')}">
        <button class="btn btn-secondary btn-sm" id="budget-next-month" title="Próximo mês"><i class="ti ti-chevron-right"></i></button>
        <button class="btn btn-ghost btn-sm" id="budget-current-month">Mês atual</button>
        <div style="flex:1"></div>
        <span style="font-size:0.8rem;color:var(--text-3);text-transform:capitalize">${periodLabel}</span>
      </div>

      <!-- Overview -->
      <div class="grid-3" style="margin-bottom:16px">
        <div class="stat-card">
          <div class="stat-label">Orçamento total</div>
          <div class="stat-value">${formatCurrency(totalLimit)}</div>
          <div class="stat-sub">${totalCarried > 0 ? `Inclui ${formatCurrency(totalCarried)} de envelopes trazidos do mês anterior` : `Definido para ${periodLabel}`}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Gasto até agora</div>
          <div class="stat-value" style="color:${globalPct > 90 ? 'var(--danger)' : globalPct > 70 ? 'var(--warning)' : 'var(--text)'}">
            ${formatCurrency(totalSpent)}
          </div>
          <div class="stat-sub">${globalPct.toFixed(0)}% do orçamento</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Ainda disponível</div>
          <div class="stat-value stat-green">${formatCurrency(Math.max(0, totalLimit - totalSpent))}</div>
          <div class="stat-sub">para ${periodLabel}</div>
        </div>
      </div>

      <!-- Global bar -->
      ${totalLimit > 0 ? `
        <div class="card" style="margin-bottom:16px">
          <div class="card-body" style="padding:14px 20px">
            <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-2);margin-bottom:8px">
              <span>Progresso geral do mês</span>
              <span>${globalPct.toFixed(0)}% · ${formatCurrency(totalSpent)} de ${formatCurrency(totalLimit)}</span>
            </div>
            <div class="prog-track" style="height:10px">
              <div class="prog-fill ${globalPct > 100 ? 'prog-over' : globalPct > 80 ? 'prog-warn' : 'prog-ok'}"
                style="width:${Math.min(globalPct,100).toFixed(1)}%"></div>
            </div>
          </div>
        </div>
      ` : ''}

      <!-- Budget rows -->
      ${budgets.length === 0
        ? `<div class="empty"><i class="ti ti-target"></i>
            <div class="empty-title">Nenhum orçamento cadastrado</div>
            <p>Clique em "Novo orçamento" para definir limites.</p></div>`
        : budgets.map(b => budgetRow(b)).join('')
      }
    `;

    el.querySelector<HTMLInputElement>('#month-picker')?.addEventListener('change', e => {
      const [y, m] = (e.target as HTMLInputElement).value.split('-').map(Number);
      year = y; month = m;
      renderPage();
    });
    el.querySelector('#budget-prev-month')?.addEventListener('click', () => {
      const d = new Date(year, month - 2, 1);
      month = d.getMonth() + 1;
      year = d.getFullYear();
      renderPage();
    });
    el.querySelector('#budget-next-month')?.addEventListener('click', () => {
      const d = new Date(year, month, 1);
      month = d.getMonth() + 1;
      year = d.getFullYear();
      renderPage();
    });
    el.querySelector('#budget-current-month')?.addEventListener('click', () => {
      month = now.getMonth() + 1;
      year = now.getFullYear();
      renderPage();
    });

    el.querySelectorAll<HTMLElement>('[data-edit-budget]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.editBudget!;
        const b  = budgets.find(x => x.id === id);
        if (b) openBudgetModal(b, renderPage);
      });
    });
    el.querySelectorAll<HTMLElement>('[data-del-budget]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Remover este orçamento?')) return;
        await invoke('budgets:delete', btn.dataset.delBudget);
        renderPage();
      });
    });
  }

  document.getElementById('btn-new-budget')?.addEventListener('click', () => openBudgetModal(null, renderPage, month, year));
  document.getElementById('btn-ai-create-budget')?.addEventListener('click', () => {
    openAICreateDraft<AIBudgetDraft>({
      target: 'budget',
      title: 'Criar orçamento com IA',
      placeholder: 'Ex: limitar supermercado a R$ 900 neste mês',
      onDraft: draft => openBudgetModal(null, renderPage, draft.month ?? month, draft.year ?? year, draft),
    });
  });
  await renderPage();
}

function budgetRow(b: BudgetWithProgress): string {
  const pct = b.percentage;
  const effectiveLimit = b.limit_amount + b.carried_in;
  const exceeded = b.spent > effectiveLimit;
  const cls = exceeded ? 'prog-over' : pct > 80 ? 'prog-warn' : 'prog-ok';
  const badgeCls = exceeded ? 'badge-exceeded' : pct > 80 ? 'badge-warn' : 'badge-ok';
  const badgeLabel = exceeded ? 'Excedido' : pct > 80 ? 'Atenção' : 'No limite';

  return `
    <div class="budget-row ${exceeded ? 'exceeded' : ''}">
      <div class="budget-row-header">
        <div class="budget-row-left">
          <div class="cat-dot" style="background:${b.category_color}22">
            <i class="ti ${b.category_icon}" style="color:${b.category_color};font-size:15px"></i>
          </div>
          <div>
            <div class="budget-row-name">${esc(b.category_name)}</div>
            ${b.carry_over ? `<div class="budget-row-spent"><i class="ti ti-repeat"></i> Envelope: mantém saldo para o próximo mês${b.carried_in > 0 ? ` · +${formatCurrency(b.carried_in)} trazido do mês anterior` : ''}</div>` : ''}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <span class="badge ${badgeCls}">${badgeLabel}</span>
          <div class="budget-row-right">
            <div style="color:${exceeded ? 'var(--danger)' : 'var(--text)'}">${formatCurrency(b.spent)}</div>
            <div class="budget-row-spent">de ${formatCurrency(effectiveLimit)}</div>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-ghost btn-sm" data-edit-budget="${b.id}">Editar</button>
            <button class="btn btn-danger btn-sm" data-del-budget="${b.id}">✕</button>
          </div>
        </div>
      </div>
      <div class="prog-track">
        <div class="prog-fill ${cls}" style="width:${Math.min(pct,100).toFixed(1)}%"></div>
      </div>
    </div>
  `;
}

async function openBudgetModal(b: BudgetWithProgress | null, onDone: () => void, month?: number, year?: number, draft?: AIBudgetDraft): Promise<void> {
  const cats = await invoke<Category[]>('categories:list', 'expense');

  function catOptions(list: Category[], selectedId?: string): string {
    return list.map(c => `<option value="${c.id}" ${selectedId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  }

  const overlay = openModal({
    title: b ? 'Editar orçamento' : 'Novo orçamento',
    body: `
      ${!b && draft?.explanation ? aiDraftNotice(draft) : ''}
      <div class="form-group">
        <label class="form-label">Categoria</label>
        <div style="display:flex;gap:8px">
          <select class="form-ctrl" id="f-cat" style="flex:1">
            ${catOptions(cats, b?.category_id ?? draft?.category_id)}
          </select>
          <button class="btn btn-ghost btn-sm" id="btn-new-cat" type="button"><i class="ti ti-plus"></i> Nova</button>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Mês</label>
          <input class="form-ctrl" id="f-month" type="number" min="1" max="12" value="${b?.month ?? draft?.month ?? month ?? new Date().getMonth() + 1}">
        </div>
        <div class="form-group">
          <label class="form-label">Ano</label>
          <input class="form-ctrl" id="f-year" type="number" min="2000" value="${b?.year ?? draft?.year ?? year ?? new Date().getFullYear()}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Limite (R$)</label>
        <input class="form-ctrl" id="f-limit" type="number" step="0.01" value="${b?.limit_amount ?? draft?.limit_amount ?? ''}">
      </div>
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;font-weight:400">
          <input type="checkbox" id="f-carry-over" ${(b?.carry_over ?? draft?.carry_over) ? 'checked' : ''}>
          Modo envelope: manter o saldo não gasto para o próximo mês
        </label>
      </div>
    `,
    onSave: async () => {
      const cat   = (overlay.querySelector('#f-cat')   as HTMLSelectElement).value;
      const m     = parseInt((overlay.querySelector('#f-month') as HTMLInputElement).value);
      const y     = parseInt((overlay.querySelector('#f-year')  as HTMLInputElement).value);
      const limit = parseFloat((overlay.querySelector('#f-limit') as HTMLInputElement).value);
      const carryOver = (overlay.querySelector('#f-carry-over') as HTMLInputElement).checked;
      if (!cat || isNaN(m) || isNaN(y) || isNaN(limit)) { alert('Preencha todos os campos.'); return false; }
      const payload = { category_id: cat, month: m, year: y, limit_amount: limit, carry_over: (carryOver ? 1 : 0) as 0 | 1 };
      if (b) { await invoke('budgets:update', { id: b.id, ...payload }); }
      else   { await invoke('budgets:create', payload); }
      onDone();
    },
  });

  overlay.querySelector('#btn-new-cat')?.addEventListener('click', () => {
    openCategoryModal(null, async () => {
      const updated = await invoke<Category[]>('categories:list', 'expense');
      const sel = overlay.querySelector<HTMLSelectElement>('#f-cat')!;
      const prev = sel.value;
      sel.innerHTML = catOptions(updated, prev);
      if (updated.length > 0 && !sel.value) sel.value = updated[updated.length - 1].id;
    }, 'expense');
  });
}

function esc(s?: string): string {
  return (s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
