import { invoke } from '../api';
import { formatCurrency } from '../../shared/utils';
import { setTopbarActions } from '../components/topbar';
import { createDonut } from '../components/charts';
import type { Investment, InvestmentSummary, InvestmentType } from '../../shared/types';

const TYPE_META: Record<InvestmentType, { label: string; icon: string; color: string }> = {
  renda_fixa:     { label: 'Renda Fixa',     icon: 'ti-building-bank',  color: '#1D9E75' },
  renda_variavel: { label: 'Renda Variável', icon: 'ti-trending-up',    color: '#3B82F6' },
  fundo:          { label: 'Fundos',         icon: 'ti-chart-pie',      color: '#8B5CF6' },
  cripto:         { label: 'Criptomoedas',   icon: 'ti-currency-bitcoin',color: '#EF9F27' },
  outro:          { label: 'Outros',         icon: 'ti-box',            color: '#A8A8A8' },
};

export async function render(el: HTMLElement): Promise<void> {
  let investments: Investment[] = [];
  let summary: InvestmentSummary = { total_applied: 0, total_current: 0, gain: 0, gain_pct: 0, by_type: [] };

  async function load(): Promise<void> {
    [investments, summary] = await Promise.all([
      invoke<Investment[]>('investments:list'),
      invoke<InvestmentSummary>('investments:getSummary'),
    ]);
  }

  setTopbarActions(`
    <button class="btn btn-primary" id="btn-new-inv">
      <i class="ti ti-plus"></i> Novo investimento
    </button>
  `);
  document.getElementById('btn-new-inv')?.addEventListener('click', () => openModal(null));

  async function renderPage(): Promise<void> {
    const donutSegs = summary.by_type.map(t => ({ value: t.total, color: t.color, label: t.label }));
    const gainColor = summary.gain >= 0 ? 'var(--accent)' : 'var(--danger)';

    el.innerHTML = `
      <div class="grid-3" style="margin-bottom:20px">
        <div class="stat-card">
          <div class="stat-label">Valor atual</div>
          <div class="stat-value">${formatCurrency(summary.total_current)}</div>
          <div class="stat-sub">${investments.length} ativo${investments.length !== 1 ? 's' : ''}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total aplicado</div>
          <div class="stat-value">${formatCurrency(summary.total_applied)}</div>
          <div class="stat-sub">Custo total</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Rendimento</div>
          <div class="stat-value" style="color:${gainColor}">
            ${summary.gain >= 0 ? '+' : ''}${formatCurrency(summary.gain)}
          </div>
          <div class="stat-sub" style="color:${gainColor}">
            ${summary.gain >= 0 ? '+' : ''}${summary.gain_pct.toFixed(2)}%
          </div>
        </div>
      </div>

      ${investments.length === 0 ? `
        <div class="empty">
          <i class="ti ti-trending-up" style="font-size:2.5rem;color:var(--text-4)"></i>
          <div class="empty-title">Nenhum investimento cadastrado</div>
          <div class="empty-desc">Adicione CDBs, ações, fundos e outros ativos para acompanhar sua carteira.</div>
          <button class="btn btn-primary" id="btn-empty-new">
            <i class="ti ti-plus"></i> Adicionar investimento
          </button>
        </div>` : `

        <div class="grid-2" style="grid-template-columns:1.6fr 1fr;margin-bottom:20px">
          <!-- Tabela de ativos -->
          <div class="card">
            <div class="card-header">Ativos</div>
            <div class="card-hr"></div>
            <table class="table">
              <thead>
                <tr>
                  <th>NOME</th>
                  <th>TIPO</th>
                  <th style="text-align:right">APLICADO</th>
                  <th style="text-align:right">ATUAL</th>
                  <th style="text-align:right">RETORNO</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${investments.map(inv => {
                  const diff = inv.current_value - inv.applied_amount;
                  const pct  = inv.applied_amount > 0 ? (diff / inv.applied_amount * 100).toFixed(1) : '—';
                  const meta = TYPE_META[inv.type];
                  const maturityWarning = inv.maturity_date ? daysUntil(inv.maturity_date) : null;
                  return `<tr>
                    <td>
                      <div style="font-weight:500">${esc(inv.name)}</div>
                      ${inv.institution ? `<div style="font-size:0.75rem;color:var(--text-3)">${esc(inv.institution)}</div>` : ''}
                      ${maturityWarning !== null && maturityWarning <= 30
                        ? `<span class="badge badge-warn" style="font-size:0.7rem">Vence em ${maturityWarning}d</span>`
                        : ''}
                    </td>
                    <td>
                      <span style="display:inline-flex;align-items:center;gap:4px;font-size:0.78rem;color:${meta.color}">
                        <i class="ti ${meta.icon}"></i> ${meta.label}
                      </span>
                    </td>
                    <td style="text-align:right;color:var(--text-2)">${formatCurrency(inv.applied_amount)}</td>
                    <td style="text-align:right;font-weight:500">${formatCurrency(inv.current_value)}</td>
                    <td style="text-align:right;color:${diff >= 0 ? 'var(--accent)' : 'var(--danger)'}">
                      ${diff >= 0 ? '+' : ''}${formatCurrency(diff)}<br>
                      <span style="font-size:0.72rem">${pct !== '—' ? (diff >= 0 ? '+' : '') + pct + '%' : '—'}</span>
                    </td>
                    <td style="text-align:right">
                      <button class="btn btn-ghost btn-sm btn-edit-inv" data-id="${inv.id}"><i class="ti ti-pencil"></i></button>
                      <button class="btn btn-ghost btn-sm btn-del-inv" data-id="${inv.id}" style="color:var(--danger)"><i class="ti ti-trash"></i></button>
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>

          <!-- Donut de alocação -->
          <div class="card">
            <div class="card-header">Alocação por tipo</div>
            <div class="card-hr"></div>
            <div class="card-body" style="padding:16px">
              ${donutSegs.length > 0 ? `
                <div style="display:flex;justify-content:center">
                  ${createDonut(donutSegs, 150, formatCurrency(summary.total_current), 'total')}
                </div>
                <div style="margin-top:12px">
                  ${donutSegs.map(s => {
                    const pct = summary.total_current > 0 ? (s.value / summary.total_current * 100).toFixed(0) : 0;
                    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:12px">
                      <div style="width:8px;height:8px;border-radius:50%;background:${s.color};flex-shrink:0"></div>
                      <span style="flex:1;color:var(--text-2)">${esc(s.label)}</span>
                      <span style="font-weight:500">${pct}%</span>
                      <span style="color:var(--text-3);width:80px;text-align:right">${formatCurrency(s.value)}</span>
                    </div>`;
                  }).join('')}
                </div>` : ''}
            </div>
          </div>
        </div>
      `}
    `;

    el.querySelector('#btn-empty-new')?.addEventListener('click', () => openModal(null));

    el.querySelectorAll<HTMLElement>('.btn-edit-inv').forEach(btn =>
      btn.addEventListener('click', () => openModal(investments.find(i => i.id === btn.dataset.id) ?? null))
    );

    el.querySelectorAll<HTMLElement>('.btn-del-inv').forEach(btn =>
      btn.addEventListener('click', async () => {
        const inv = investments.find(i => i.id === btn.dataset.id);
        if (!inv || !confirm(`Excluir "${inv.name}"?`)) return;
        await invoke('investments:delete', inv.id);
        await load();
        await renderPage();
      })
    );
  }

  function openModal(inv: Investment | null): void {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:500px">
        <div class="modal-header">
          <span class="modal-title">${inv ? 'Editar investimento' : 'Novo investimento'}</span>
          <button class="btn btn-ghost btn-sm modal-close"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
          <div class="form-row">
            <div class="form-group" style="flex:2">
              <label class="form-label">Nome *</label>
              <input class="form-ctrl" id="f-name" value="${esc(inv?.name ?? '')}" placeholder="Ex: PETR4, Tesouro IPCA+">
            </div>
            <div class="form-group" style="flex:1">
              <label class="form-label">Tipo *</label>
              <select class="form-ctrl" id="f-type">
                ${Object.entries(TYPE_META).map(([v, m]) =>
                  `<option value="${v}" ${inv?.type === v ? 'selected' : ''}>${m.label}</option>`
                ).join('')}
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Instituição</label>
            <input class="form-ctrl" id="f-inst" value="${esc(inv?.institution ?? '')}" placeholder="Ex: XP Investimentos, BTG">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Valor aplicado</label>
              <input class="form-ctrl" id="f-applied" type="number" step="0.01" min="0" value="${inv?.applied_amount ?? 0}">
            </div>
            <div class="form-group">
              <label class="form-label">Valor atual</label>
              <input class="form-ctrl" id="f-current" type="number" step="0.01" min="0" value="${inv?.current_value ?? 0}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Data de aplicação</label>
              <input class="form-ctrl" id="f-appdate" type="date" value="${inv?.application_date ?? ''}">
            </div>
            <div class="form-group">
              <label class="form-label">Vencimento</label>
              <input class="form-ctrl" id="f-maturity" type="date" value="${inv?.maturity_date ?? ''}">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Observações</label>
            <input class="form-ctrl" id="f-notes" value="${esc(inv?.notes ?? '')}" placeholder="Notas opcionais">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary modal-close">Cancelar</button>
          <button class="btn btn-primary" id="btn-save-inv">Salvar</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    const close = (): void => {
      overlay.remove();
      document.body.focus();
    };

    overlay.querySelectorAll('.modal-close').forEach(b => b.addEventListener('click', close));
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    overlay.querySelector('#btn-save-inv')?.addEventListener('click', async () => {
      const name = (overlay.querySelector<HTMLInputElement>('#f-name')!).value.trim();
      if (!name) { alert('Informe o nome do investimento.'); return; }

      const payload = {
        name,
        type: (overlay.querySelector<HTMLSelectElement>('#f-type')!).value,
        institution: (overlay.querySelector<HTMLInputElement>('#f-inst')!).value.trim() || null,
        applied_amount: parseFloat((overlay.querySelector<HTMLInputElement>('#f-applied')!).value) || 0,
        current_value: parseFloat((overlay.querySelector<HTMLInputElement>('#f-current')!).value) || 0,
        application_date: (overlay.querySelector<HTMLInputElement>('#f-appdate')!).value || null,
        maturity_date: (overlay.querySelector<HTMLInputElement>('#f-maturity')!).value || null,
        notes: (overlay.querySelector<HTMLInputElement>('#f-notes')!).value.trim() || null,
      };

      if (inv) {
        await invoke('investments:update', { id: inv.id, ...payload });
      } else {
        await invoke('investments:create', payload);
      }
      close();
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

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400_000);
}
