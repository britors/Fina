import { invoke } from '../api';
import { formatCurrency } from '../../shared/utils';
import { setTopbarActions } from '../components/topbar';
import { showAlert, showConfirm } from '../components/alertDialog';
import type { Asset, AssetType } from '../../shared/types';

const TYPE_META: Record<AssetType, { label: string; icon: string; color: string }> = {
  imovel:      { label: 'Imóvel',      icon: 'ti-home',        color: '#8B5CF6' },
  veiculo:     { label: 'Veículo',     icon: 'ti-car',         color: '#3B82F6' },
  terreno:     { label: 'Terreno',     icon: 'ti-map',         color: '#EF9F27' },
  investimento:{ label: 'Investimento',icon: 'ti-trending-up', color: '#1D9E75' },
  outro:       { label: 'Outro',       icon: 'ti-box',         color: '#A8A8A8' },
};

export async function render(el: HTMLElement): Promise<void> {
  let assets: Asset[] = [];

  async function load(): Promise<void> {
    assets = await invoke<Asset[]>('assets:list');
  }

  setTopbarActions(`
    <button class="btn btn-primary" id="btn-new-asset">
      <i class="ti ti-plus"></i> Novo bem
    </button>
  `);
  document.getElementById('btn-new-asset')?.addEventListener('click', () => openModal(null));

  async function renderPage(): Promise<void> {
    const totalAcquisition = assets.reduce((s, a) => s + a.acquisition_value, 0);
    const totalCurrent     = assets.reduce((s, a) => s + a.current_value, 0);
    const gain = totalCurrent - totalAcquisition;

    const byType = Object.entries(TYPE_META).map(([type, meta]) => {
      const list = assets.filter(a => a.type === type);
      return { type: type as AssetType, ...meta, list, total: list.reduce((s, a) => s + a.current_value, 0) };
    }).filter(g => g.list.length > 0);

    el.innerHTML = `
      <!-- Totais -->
      <div class="grid-3" style="margin-bottom:20px">
        <div class="stat-card">
          <div class="stat-label">Valor total atual</div>
          <div class="stat-value">${formatCurrency(totalCurrent)}</div>
          <div class="stat-sub">${assets.length} bem${assets.length !== 1 ? 's' : ''} cadastrado${assets.length !== 1 ? 's' : ''}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Valor de aquisição</div>
          <div class="stat-value">${formatCurrency(totalAcquisition)}</div>
          <div class="stat-sub">Custo total</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Valorização</div>
          <div class="stat-value" style="color:${gain >= 0 ? 'var(--accent)' : 'var(--danger)'}">
            ${gain >= 0 ? '+' : ''}${formatCurrency(gain)}
          </div>
          <div class="stat-sub">
            ${totalAcquisition > 0 ? ((gain / totalAcquisition) * 100).toFixed(1) + '%' : '—'}
          </div>
        </div>
      </div>

      ${assets.length === 0 ? `
        <div class="empty">
          <i class="ti ti-home" style="font-size:2.5rem;color:var(--text-4)"></i>
          <div class="empty-title">Nenhum bem cadastrado</div>
          <div class="empty-desc">Adicione imóveis, veículos, terrenos e outros bens para acompanhar seu patrimônio.</div>
          <button class="btn btn-primary" id="btn-empty-new">
            <i class="ti ti-plus"></i> Adicionar bem
          </button>
        </div>` : `
        <div style="display:flex;flex-direction:column;gap:20px">
          ${byType.map(g => `
            <div class="card">
              <div class="card-header">
                <span style="display:flex;align-items:center;gap:8px">
                  <i class="ti ${g.icon}" style="color:${g.color}"></i>
                  ${g.label}
                  <span style="font-size:0.75rem;color:var(--text-3)">(${g.list.length})</span>
                </span>
                <span style="font-weight:600">${formatCurrency(g.total)}</span>
              </div>
              <div class="card-hr"></div>
              <table class="table">
                <thead>
                  <tr>
                    <th>NOME</th>
                    <th style="text-align:right">AQUISIÇÃO</th>
                    <th style="text-align:right">VALOR ATUAL</th>
                    <th style="text-align:right">VARIAÇÃO</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${g.list.map(a => {
                    const diff = a.current_value - a.acquisition_value;
                    const pct  = a.acquisition_value > 0 ? (diff / a.acquisition_value * 100).toFixed(1) : '—';
                    return `<tr>
                      <td>
                        <div style="font-weight:500">${esc(a.name)}</div>
                        ${a.description ? `<div style="font-size:0.75rem;color:var(--text-3)">${esc(a.description)}</div>` : ''}
                      </td>
                      <td style="text-align:right;color:var(--text-2)">${formatCurrency(a.acquisition_value)}</td>
                      <td style="text-align:right;font-weight:500">${formatCurrency(a.current_value)}</td>
                      <td style="text-align:right;color:${diff >= 0 ? 'var(--accent)' : 'var(--danger)'}">
                        ${diff >= 0 ? '+' : ''}${formatCurrency(diff)}<br>
                        <span style="font-size:0.72rem">${pct !== '—' ? (diff >= 0 ? '+' : '') + pct + '%' : '—'}</span>
                      </td>
                      <td style="text-align:right">
                        <button class="btn btn-ghost btn-sm btn-edit-asset" data-id="${a.id}" title="Editar">
                          <i class="ti ti-pencil"></i>
                        </button>
                        <button class="btn btn-ghost btn-sm btn-del-asset" data-id="${a.id}" title="Excluir" style="color:var(--danger)">
                          <i class="ti ti-trash"></i>
                        </button>
                      </td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `).join('')}
        </div>
      `}
    `;

    el.querySelector('#btn-empty-new')?.addEventListener('click', () => openModal(null));

    el.querySelectorAll<HTMLElement>('.btn-edit-asset').forEach(btn =>
      btn.addEventListener('click', () => openModal(assets.find(a => a.id === btn.dataset.id) ?? null))
    );

    el.querySelectorAll<HTMLElement>('.btn-del-asset').forEach(btn =>
      btn.addEventListener('click', async () => {
        const a = assets.find(x => x.id === btn.dataset.id);
        if (!a) return;
        if (!await showConfirm(`Excluir "${a.name}"?`, { danger: true, okLabel: 'Excluir' })) return;
        await invoke('assets:delete', a.id);
        await load();
        await renderPage();
      })
    );
  }

  function openModal(asset: Asset | null): void {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:480px">
        <div class="modal-header">
          <span class="modal-title">${asset ? 'Editar bem' : 'Novo bem'}</span>
          <button class="btn btn-ghost btn-sm modal-close"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
          <div class="form-row">
            <div class="form-group" style="flex:2">
              <label class="form-label">Nome *</label>
              <input class="form-ctrl" id="f-name" value="${esc(asset?.name ?? '')}" placeholder="Ex: Apartamento Centro">
            </div>
            <div class="form-group" style="flex:1">
              <label class="form-label">Tipo *</label>
              <select class="form-ctrl" id="f-type">
                ${Object.entries(TYPE_META).map(([v, m]) =>
                  `<option value="${v}" ${asset?.type === v ? 'selected' : ''}>${m.label}</option>`
                ).join('')}
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Valor de aquisição</label>
              <input class="form-ctrl" id="f-acq" type="number" step="0.01" min="0" value="${asset?.acquisition_value ?? 0}">
            </div>
            <div class="form-group">
              <label class="form-label">Valor atual</label>
              <input class="form-ctrl" id="f-cur" type="number" step="0.01" min="0" value="${asset?.current_value ?? 0}">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Data de aquisição</label>
            <input class="form-ctrl" id="f-date" type="date" value="${asset?.acquisition_date ?? ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Descrição</label>
            <input class="form-ctrl" id="f-desc" value="${esc(asset?.description ?? '')}" placeholder="Observações opcionais">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary modal-close">Cancelar</button>
          <button class="btn btn-primary" id="btn-save-asset">Salvar</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    const close = (): void => {
      overlay.remove();
      document.body.focus();
    };

    overlay.querySelectorAll('.modal-close').forEach(b => b.addEventListener('click', close));

    overlay.querySelector('#btn-save-asset')?.addEventListener('click', async () => {
      const name = (overlay.querySelector<HTMLInputElement>('#f-name')!).value.trim();
      if (!name) { showAlert('Informe o nome do bem.'); return; }

      const payload = {
        name,
        type: (overlay.querySelector<HTMLSelectElement>('#f-type')!).value,
        acquisition_value: parseFloat((overlay.querySelector<HTMLInputElement>('#f-acq')!).value) || 0,
        current_value: parseFloat((overlay.querySelector<HTMLInputElement>('#f-cur')!).value) || 0,
        acquisition_date: (overlay.querySelector<HTMLInputElement>('#f-date')!).value || null,
        description: (overlay.querySelector<HTMLInputElement>('#f-desc')!).value.trim() || null,
      };

      if (asset) {
        await invoke('assets:update', { id: asset.id, ...payload });
      } else {
        await invoke('assets:create', payload);
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
