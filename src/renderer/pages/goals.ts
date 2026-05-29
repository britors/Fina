import { invoke } from '../api';
import { formatCurrency } from '../../shared/utils';
import { setTopbarActions } from '../components/topbar';
import type { Goal, GoalType, Account } from '../../shared/types';

const TYPE_META: Record<GoalType, { label: string; icon: string; color: string }> = {
  viagem:      { label: 'Viagem',              icon: 'ti-plane',       color: '#3B82F6' },
  imovel:      { label: 'Imóvel',              icon: 'ti-home',        color: '#8B5CF6' },
  evento:      { label: 'Evento',              icon: 'ti-confetti',    color: '#EF9F27' },
  emergencia:  { label: 'Reserva emergência',  icon: 'ti-shield',      color: '#1D9E75' },
  outro:       { label: 'Outro',               icon: 'ti-star',        color: '#A8A8A8' },
};

export async function render(el: HTMLElement): Promise<void> {
  let goals: Goal[] = [];
  let accounts: Account[] = [];

  async function load(): Promise<void> {
    [goals, accounts] = await Promise.all([
      invoke<Goal[]>('goals:list'),
      invoke<Account[]>('accounts:list'),
    ]);
  }

  setTopbarActions(`
    <button class="btn btn-primary" id="btn-new-goal">
      <i class="ti ti-plus"></i> Nova meta
    </button>
  `);
  document.getElementById('btn-new-goal')?.addEventListener('click', () => openModal(null));

  async function renderPage(): Promise<void> {
    const totalTarget  = goals.reduce((s, g) => s + g.target_amount, 0);
    const totalCurrent = goals.reduce((s, g) => s + g.current_amount, 0);

    el.innerHTML = `
      <div class="grid-3" style="margin-bottom:20px">
        <div class="stat-card">
          <div class="stat-label">Metas ativas</div>
          <div class="stat-value">${goals.length}</div>
          <div class="stat-sub">metas cadastradas</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total acumulado</div>
          <div class="stat-value stat-green">${formatCurrency(totalCurrent)}</div>
          <div class="stat-sub">de ${formatCurrency(totalTarget)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Falta acumular</div>
          <div class="stat-value">${formatCurrency(Math.max(0, totalTarget - totalCurrent))}</div>
          <div class="stat-sub">${totalTarget > 0 ? ((totalCurrent / totalTarget) * 100).toFixed(0) : 0}% concluído</div>
        </div>
      </div>

      ${goals.length === 0 ? `
        <div class="empty">
          <i class="ti ti-target" style="font-size:2.5rem;color:var(--text-4)"></i>
          <div class="empty-title">Nenhuma meta criada</div>
          <div class="empty-desc">Crie metas financeiras para férias, imóveis, eventos e reservas de emergência.</div>
          <button class="btn btn-primary" id="btn-empty-goal">
            <i class="ti ti-plus"></i> Criar primeira meta
          </button>
        </div>` : `
        <div class="grid-2" style="gap:16px">
          ${goals.map(g => {
            const meta   = TYPE_META[g.type];
            const pct    = g.target_amount > 0 ? Math.min(100, (g.current_amount / g.target_amount) * 100) : 0;
            const days   = g.target_date ? Math.ceil((new Date(g.target_date + 'T12:00').getTime() - Date.now()) / 86400_000) : null;
            const late   = days !== null && days < 0;
            const urgent = days !== null && days >= 0 && days <= 30;
            const done   = pct >= 100;

            const needed = g.target_amount - g.current_amount;
            const monthly = (days !== null && days > 0) ? needed / (days / 30) : null;

            return `<div class="card" style="display:flex;flex-direction:column;gap:12px">
              <div style="display:flex;align-items:center;gap:10px">
                <div style="width:40px;height:40px;border-radius:10px;background:${meta.color}22;display:flex;align-items:center;justify-content:center;flex-shrink:0">
                  <i class="ti ${meta.icon}" style="color:${meta.color};font-size:1.2rem"></i>
                </div>
                <div style="flex:1;min-width:0">
                  <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(g.name)}</div>
                  <div style="font-size:0.75rem;color:var(--text-3)">${meta.label}</div>
                </div>
                ${done ? `<span class="badge badge-confirmed">Concluída</span>`
                  : late ? `<span class="badge badge-overdue">Atrasada</span>`
                  : urgent ? `<span class="badge badge-warn">Urgente</span>` : ''}
              </div>

              <div>
                <div style="display:flex;justify-content:space-between;font-size:0.82rem;margin-bottom:6px">
                  <span style="color:var(--text-2)">${formatCurrency(g.current_amount)}</span>
                  <span style="color:var(--text-3)">${formatCurrency(g.target_amount)}</span>
                </div>
                <div class="progress-track">
                  <div class="prog-fill" style="width:${pct.toFixed(1)}%;background:${done ? 'var(--accent)' : late ? 'var(--danger)' : meta.color}"></div>
                </div>
                <div style="text-align:right;font-size:0.75rem;color:var(--text-3);margin-top:4px">${pct.toFixed(0)}%</div>
              </div>

              <div style="display:flex;gap:12px;font-size:0.78rem;color:var(--text-3);flex-wrap:wrap">
                ${g.target_date ? `<span><i class="ti ti-calendar" style="font-size:0.75rem"></i> ${days !== null && days >= 0 ? `${days}d restantes` : days !== null ? `${Math.abs(days)}d atraso` : ''} (${fmtDate(g.target_date)})</span>` : ''}
                ${monthly !== null && !done ? `<span><i class="ti ti-trending-up" style="font-size:0.75rem"></i> ${formatCurrency(monthly)}/mês necessário</span>` : ''}
              </div>

              <div style="display:flex;gap:6px">
                <button class="btn btn-sm btn-secondary btn-edit-goal" data-id="${g.id}" style="flex:1">
                  <i class="ti ti-pencil"></i> Editar
                </button>
                <button class="btn btn-sm btn-danger btn-del-goal" data-id="${g.id}">
                  <i class="ti ti-trash"></i>
                </button>
              </div>
            </div>`;
          }).join('')}
        </div>
      `}
    `;

    el.querySelector('#btn-empty-goal')?.addEventListener('click', () => openModal(null));
    el.querySelectorAll<HTMLElement>('.btn-edit-goal').forEach(btn =>
      btn.addEventListener('click', () => openModal(goals.find(g => g.id === btn.dataset.id) ?? null))
    );
    el.querySelectorAll<HTMLElement>('.btn-del-goal').forEach(btn =>
      btn.addEventListener('click', async () => {
        const g = goals.find(x => x.id === btn.dataset.id);
        if (!g || !confirm(`Excluir a meta "${g.name}"?`)) return;
        await invoke('goals:delete', g.id);
        await load();
        await renderPage();
      })
    );
  }

  function openModal(goal: Goal | null): void {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:480px">
        <div class="modal-header">
          <span class="modal-title">${goal ? 'Editar meta' : 'Nova meta'}</span>
          <button class="btn btn-ghost btn-sm modal-close"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
          <div class="form-row">
            <div class="form-group" style="flex:2">
              <label class="form-label">Nome *</label>
              <input class="form-ctrl" id="f-name" value="${esc(goal?.name ?? '')}" placeholder="Ex: Férias em Gramado">
            </div>
            <div class="form-group" style="flex:1">
              <label class="form-label">Tipo *</label>
              <select class="form-ctrl" id="f-type">
                ${Object.entries(TYPE_META).map(([v, m]) =>
                  `<option value="${v}" ${goal?.type === v ? 'selected' : ''}>${m.label}</option>`
                ).join('')}
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Valor alvo</label>
              <input class="form-ctrl" id="f-target" type="number" step="0.01" min="0" value="${goal?.target_amount ?? 0}">
            </div>
            <div class="form-group">
              <label class="form-label">Valor acumulado</label>
              <input class="form-ctrl" id="f-current" type="number" step="0.01" min="0" value="${goal?.current_amount ?? 0}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Data alvo</label>
              <input class="form-ctrl" id="f-date" type="date" value="${goal?.target_date ?? ''}">
            </div>
            <div class="form-group">
              <label class="form-label">Conta vinculada</label>
              <select class="form-ctrl" id="f-account">
                <option value="">— Nenhuma —</option>
                ${accounts.map(a => `<option value="${a.id}" ${goal?.account_id === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Descrição</label>
            <input class="form-ctrl" id="f-desc" value="${esc(goal?.description ?? '')}" placeholder="Observações opcionais">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary modal-close">Cancelar</button>
          <button class="btn btn-primary" id="btn-save-goal">Salvar</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    overlay.querySelectorAll('.modal-close').forEach(b => b.addEventListener('click', () => overlay.remove()));
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#btn-save-goal')?.addEventListener('click', async () => {
      const name = (overlay.querySelector<HTMLInputElement>('#f-name')!).value.trim();
      if (!name) { alert('Informe o nome da meta.'); return; }
      const payload = {
        name,
        type: (overlay.querySelector<HTMLSelectElement>('#f-type')!).value,
        target_amount:  parseFloat((overlay.querySelector<HTMLInputElement>('#f-target')!).value)  || 0,
        current_amount: parseFloat((overlay.querySelector<HTMLInputElement>('#f-current')!).value) || 0,
        target_date: (overlay.querySelector<HTMLInputElement>('#f-date')!).value || null,
        account_id:  (overlay.querySelector<HTMLSelectElement>('#f-account')!).value || null,
        description: (overlay.querySelector<HTMLInputElement>('#f-desc')!).value.trim() || null,
      };
      if (goal) { await invoke('goals:update', { id: goal.id, ...payload }); }
      else       { await invoke('goals:create', payload); }
      overlay.remove();
      await load();
      await renderPage();
    });
  }

  await load();
  await renderPage();
}

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
