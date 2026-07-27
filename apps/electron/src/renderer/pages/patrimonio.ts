import { invoke } from '../api';
import { formatCurrency } from '../../shared/utils';
import { setTopbarActions } from '../components/topbar';
import { attachMoneyMask, formatMoneyValue, moneyInputValue } from '../components/moneyMask';
import { showAlert, showConfirm } from '../components/alertDialog';
import { createAreaChart } from '../components/charts';
import type { Asset, AssetReminder, AssetReminderKind, AssetType } from '../../shared/types';

const REMINDER_KIND_LABEL: Record<AssetReminderKind, string> = {
  seguro: 'Seguro', garantia: 'Garantia', ipva: 'IPVA', outro: 'Outro',
};

type NetWorthPoint = { month: string; label: string; account_balance: number; net_worth: number };

const TYPE_META: Record<AssetType, { label: string; icon: string; color: string }> = {
  imovel:      { label: 'Imóvel',      icon: 'ti-home',        color: '#8B5CF6' },
  veiculo:     { label: 'Veículo',     icon: 'ti-car',         color: '#3B82F6' },
  terreno:     { label: 'Terreno',     icon: 'ti-map',         color: '#EF9F27' },
  investimento:{ label: 'Investimento',icon: 'ti-trending-up', color: '#1D9E75' },
  outro:       { label: 'Outro',       icon: 'ti-box',         color: '#A8A8A8' },
};

export async function render(el: HTMLElement): Promise<void> {
  let assets: Asset[] = [];
  let netWorthHistory: NetWorthPoint[] = [];

  async function load(): Promise<void> {
    [assets, netWorthHistory] = await Promise.all([
      invoke<Asset[]>('assets:list'),
      invoke<NetWorthPoint[]>('assets:getNetWorthHistory', 12),
    ]);
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

      <div class="card" style="margin-bottom:20px">
        <div class="card-header">Evolução do patrimônio líquido</div>
        <div class="card-hr"></div>
        <div class="card-body" style="padding:16px 20px">
          ${netWorthHistory.length < 2
            ? `<div class="empty" style="padding:20px"><div class="empty-title">Sem histórico suficiente</div></div>`
            : createAreaChart(netWorthHistory.map(point => {
                const [year, month] = point.month.split('-').map(Number);
                const lastDay = new Date(year, month, 0).getDate();
                return { date: `${point.month}-${String(lastDay).padStart(2, '0')}`, balance: point.net_worth };
              }), 720, 170)
          }
          <div style="font-size:10.5px;color:var(--text-3);margin-top:10px">
            Reconstruído a partir dos lançamentos confirmados (saldo em contas). Investimentos, bens e dívidas entram pelo valor de hoje em todos os meses, por não terem histórico datado.
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
                        <button class="btn btn-ghost btn-sm btn-reminders-asset" data-id="${a.id}" title="Lembretes (seguro, garantia, IPVA)">
                          <i class="ti ti-bell"></i>
                        </button>
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

    el.querySelectorAll<HTMLElement>('.btn-reminders-asset').forEach(btn =>
      btn.addEventListener('click', () => {
        const a = assets.find(x => x.id === btn.dataset.id);
        if (a) void openRemindersModal(a);
      })
    );

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
              <input class="form-ctrl" id="f-acq" type="text" inputmode="decimal" value="${formatMoneyValue(asset?.acquisition_value ?? 0)}">
            </div>
            <div class="form-group">
              <label class="form-label">Valor atual</label>
              <input class="form-ctrl" id="f-cur" type="text" inputmode="decimal" value="${formatMoneyValue(asset?.current_value ?? 0)}">
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
    attachMoneyMask(overlay.querySelector('#f-acq'));
    attachMoneyMask(overlay.querySelector('#f-cur'));

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
        acquisition_value: moneyInputValue(overlay.querySelector<HTMLInputElement>('#f-acq')) || 0,
        current_value: moneyInputValue(overlay.querySelector<HTMLInputElement>('#f-cur')) || 0,
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

async function openRemindersModal(asset: Asset): Promise<void> {
  let reminders = await invoke<(AssetReminder & { days_until: number })[]>('assets:listReminders', asset.id);

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  document.body.appendChild(overlay);

  function renderModal(): void {
    overlay.innerHTML = `
      <div class="modal" style="max-width:560px">
        <div class="modal-header">
          <span class="modal-title">Lembretes — ${esc(asset.name)}</span>
          <button class="btn btn-ghost btn-sm modal-close"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
          <table class="table">
            <thead><tr><th>TIPO</th><th>VENCIMENTO</th><th>RECORRÊNCIA</th><th></th></tr></thead>
            <tbody>
              ${reminders.length === 0
                ? `<tr><td colspan="4" style="color:var(--text-3);padding:10px 0">Nenhum lembrete cadastrado</td></tr>`
                : reminders.map(r => `<tr>
                    <td>${REMINDER_KIND_LABEL[r.kind]}</td>
                    <td style="color:${r.days_until < 0 ? 'var(--danger)' : r.days_until <= 7 ? 'var(--warning)' : 'var(--text)'}">${r.due_date}${r.days_until < 0 ? ' (vencido)' : ` (${r.days_until}d)`}</td>
                    <td style="color:var(--text-3);font-size:0.78rem">${r.recurrence === 'annual' ? 'Anual' : 'Único'}</td>
                    <td style="text-align:right"><button class="btn btn-ghost btn-sm btn-del-reminder" data-id="${r.id}" style="color:var(--danger)"><i class="ti ti-trash"></i></button></td>
                  </tr>`).join('')}
            </tbody>
          </table>
          <div class="card" style="padding:12px 14px">
            <div class="form-row">
              <div class="form-group" style="flex:0 0 130px">
                <label class="form-label">Tipo</label>
                <select class="form-ctrl" id="rem-kind">
                  ${Object.entries(REMINDER_KIND_LABEL).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Vencimento</label>
                <input class="form-ctrl" id="rem-date" type="date">
              </div>
              <div class="form-group" style="flex:0 0 130px">
                <label class="form-label">Recorrência</label>
                <select class="form-ctrl" id="rem-recurrence">
                  <option value="none">Único</option>
                  <option value="annual">Anual</option>
                </select>
              </div>
            </div>
            <button class="btn btn-primary" id="btn-add-reminder" style="width:100%;justify-content:center">
              <i class="ti ti-plus"></i> Adicionar lembrete
            </button>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary modal-close">Fechar</button>
        </div>
      </div>`;

    overlay.querySelectorAll('.modal-close').forEach(b => b.addEventListener('click', () => overlay.remove()));

    overlay.querySelectorAll<HTMLElement>('.btn-del-reminder').forEach(btn =>
      btn.addEventListener('click', async () => {
        if (!await showConfirm('Excluir este lembrete?', { danger: true, okLabel: 'Excluir' })) return;
        await invoke('assets:deleteReminder', btn.dataset.id);
        reminders = await invoke('assets:listReminders', asset.id);
        renderModal();
      })
    );

    overlay.querySelector('#btn-add-reminder')?.addEventListener('click', async () => {
      const due_date = (overlay.querySelector<HTMLInputElement>('#rem-date')!).value;
      if (!due_date) { showAlert('Informe a data de vencimento.'); return; }
      await invoke('assets:createReminder', {
        asset_id: asset.id,
        kind: (overlay.querySelector<HTMLSelectElement>('#rem-kind')!).value as AssetReminderKind,
        due_date,
        recurrence: (overlay.querySelector<HTMLSelectElement>('#rem-recurrence')!).value as 'none' | 'annual',
        notes: null,
      });
      reminders = await invoke('assets:listReminders', asset.id);
      renderModal();
    });
  }

  renderModal();
}

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
