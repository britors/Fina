import { invoke } from '../api';
import { formatCurrency, isCreditLikeAccountType } from '../../shared/utils';
import { setTopbarActions } from '../components/topbar';
import { aiDraftNotice, openAICreateDraft } from '../components/aiCreateDraft';
import type { Account, AIGoalDraft, Debt, Goal, GoalType } from '../../shared/types';

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
  let suggestions: SuggestedGoal[] = [];

  async function load(): Promise<void> {
    const [loadedGoals, loadedAccounts, history, debts] = await Promise.all([
      invoke<Goal[]>('goals:list'),
      invoke<Account[]>('accounts:list'),
      invoke<{ income: number; expense: number }[]>('transactions:getMonthlyHistory', 3),
      invoke<Debt[]>('debts:list'),
    ]);
    goals = loadedGoals;
    accounts = loadedAccounts;
    suggestions = buildSuggestions(goals, accounts, history, debts);
  }

  setTopbarActions(`
    <button class="btn btn-secondary" id="btn-ai-create-goal">
      <i class="ti ti-sparkles"></i> Criar com IA
    </button>
    <button class="btn btn-primary" id="btn-new-goal">
      <i class="ti ti-plus"></i> Nova meta
    </button>
  `);
  document.getElementById('btn-new-goal')?.addEventListener('click', () => openModal(null));
  document.getElementById('btn-ai-create-goal')?.addEventListener('click', () => {
    openAICreateDraft<AIGoalDraft>({
      target: 'goal',
      title: 'Criar meta com IA',
      placeholder: 'Ex: juntar R$ 8000 para férias até dezembro',
      onDraft: draft => openModal(null, draft),
    });
  });

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

      ${suggestions.length > 0 ? `
        <div class="card" style="margin-bottom:20px">
          <div class="card-header">Objetivos automáticos</div>
          <div class="card-hr"></div>
          <div class="card-body" style="display:flex;flex-direction:column;gap:10px">
            ${suggestions.map(s => `
              <div style="display:flex;align-items:center;gap:12px;background:var(--bg);border:0.5px solid var(--border);border-radius:8px;padding:12px">
                <div style="width:36px;height:36px;border-radius:8px;background:${TYPE_META[s.type].color}22;display:flex;align-items:center;justify-content:center">
                  <i class="ti ${TYPE_META[s.type].icon}" style="color:${TYPE_META[s.type].color}"></i>
                </div>
                <div style="flex:1">
                  <div style="font-weight:600">${esc(s.name)}</div>
                  <div style="font-size:0.78rem;color:var(--text-3)">${esc(s.description)} · alvo ${formatCurrency(s.target_amount)}</div>
                </div>
                <button class="btn btn-primary btn-sm" data-create-suggested="${s.id}">Criar</button>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

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
    el.querySelectorAll<HTMLElement>('[data-create-suggested]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const suggestion = suggestions.find(s => s.id === btn.dataset.createSuggested);
        if (!suggestion) return;
        await invoke('goals:create', {
          name: suggestion.name,
          type: suggestion.type,
          target_amount: suggestion.target_amount,
          current_amount: suggestion.current_amount,
          target_date: suggestion.target_date,
          account_id: null,
          description: suggestion.description,
        });
        await load();
        await renderPage();
      });
    });
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

  function openModal(goal: Goal | null, draft?: AIGoalDraft): void {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:480px">
        <div class="modal-header">
          <span class="modal-title">${goal ? 'Editar meta' : 'Nova meta'}</span>
          <button class="btn btn-ghost btn-sm modal-close"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
          ${!goal && draft?.explanation ? aiDraftNotice(draft) : ''}
          <div class="form-row">
            <div class="form-group" style="flex:2">
              <label class="form-label">Nome *</label>
              <input class="form-ctrl" id="f-name" value="${esc(goal?.name ?? draft?.name ?? '')}" placeholder="Ex: Férias em Gramado">
            </div>
            <div class="form-group" style="flex:1">
              <label class="form-label">Tipo *</label>
              <select class="form-ctrl" id="f-type">
                ${Object.entries(TYPE_META).map(([v, m]) =>
                  `<option value="${v}" ${(goal?.type ?? draft?.type) === v ? 'selected' : ''}>${m.label}</option>`
                ).join('')}
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Valor alvo</label>
              <input class="form-ctrl" id="f-target" type="number" step="0.01" min="0" value="${goal?.target_amount ?? draft?.target_amount ?? 0}">
            </div>
            <div class="form-group">
              <label class="form-label">Valor acumulado</label>
              <input class="form-ctrl" id="f-current" type="number" step="0.01" min="0" value="${goal?.current_amount ?? draft?.current_amount ?? 0}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Data alvo</label>
              <input class="form-ctrl" id="f-date" type="date" value="${goal?.target_date ?? draft?.target_date ?? ''}">
            </div>
            <div class="form-group">
              <label class="form-label">Meio de pagamento vinculado</label>
              <select class="form-ctrl" id="f-account">
                <option value="">— Nenhuma —</option>
                ${accounts.map(a => `<option value="${a.id}" ${(goal?.account_id ?? draft?.account_id) === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Descrição</label>
            <input class="form-ctrl" id="f-desc" value="${esc(goal?.description ?? draft?.description ?? '')}" placeholder="Observações opcionais">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary modal-close">Cancelar</button>
          <button class="btn btn-primary" id="btn-save-goal">Salvar</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    const close = (): void => {
      overlay.remove();
      document.body.focus();
    };

    overlay.querySelectorAll('.modal-close').forEach(b => b.addEventListener('click', close));

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
      close();
      await load();
      await renderPage();
    });
  }

  await load();
  await renderPage();
}

interface SuggestedGoal {
  id: string;
  name: string;
  type: GoalType;
  target_amount: number;
  current_amount: number;
  target_date: string | null;
  description: string;
}

function buildSuggestions(goals: Goal[], accounts: Account[], history: { income: number; expense: number }[], debts: Debt[]): SuggestedGoal[] {
  const existing = new Set(goals.map(g => g.type));
  const avgExpense = avg(history.map(h => h.expense));
  const avgIncome = avg(history.map(h => h.income));
  const liquidBalance = accounts.filter(a => !isCreditLikeAccountType(a.type)).reduce((sum, a) => sum + a.balance, 0);
  const debtTotal = debts.filter(d => d.status !== 'quitada').reduce((sum, d) => sum + d.outstanding_balance, 0);
  const suggestions: SuggestedGoal[] = [];

  if (!existing.has('emergencia') && avgExpense > 0) {
    suggestions.push({
      id: 'reserve',
      name: 'Reserva de emergência',
      type: 'emergencia',
      target_amount: Math.round(avgExpense * 6 * 100) / 100,
      current_amount: Math.max(0, liquidBalance),
      target_date: futureDate(12),
      description: 'Sugestão para cobrir 6 meses de despesas médias.',
    });
  }
  if (debtTotal > 0 && !goals.some(g => g.name.toLowerCase().includes('dívida') || g.name.toLowerCase().includes('divida'))) {
    suggestions.push({
      id: 'debt',
      name: 'Quitar dívidas',
      type: 'outro',
      target_amount: Math.round(debtTotal * 100) / 100,
      current_amount: 0,
      target_date: futureDate(18),
      description: 'Objetivo automático baseado no saldo devedor atual.',
    });
  }
  if (avgIncome > avgExpense && !goals.some(g => g.name.toLowerCase().includes('investir'))) {
    suggestions.push({
      id: 'invest',
      name: 'Investir sobra mensal',
      type: 'outro',
      target_amount: Math.round((avgIncome - avgExpense) * 6 * 100) / 100,
      current_amount: 0,
      target_date: futureDate(6),
      description: 'Transforma a sobra média em objetivo de acumulação.',
    });
  }
  return suggestions.slice(0, 3);
}

function avg(values: number[]): number {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
}

function futureDate(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
