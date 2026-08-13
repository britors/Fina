import { td } from '../i18n';
import { invoke } from '../api';
import { formatCurrency } from '../../shared/utils';
import { setTopbarActions } from '../components/topbar';
import { showAlert, showConfirm } from '../components/alertDialog';
import type { FamilyMember, FamilySettlement } from '../../shared/types';

export async function render(el: HTMLElement): Promise<void> {
  const settings = await invoke<Record<string, string>>('settings:getAll');
  if (settings.family_mode !== 'true') {
    setTopbarActions('');
    el.innerHTML = `
      <div class="empty">
        <i class="ti ti-users" style="font-size:2.5rem;color:var(--text-4)"></i>
        <div class="empty-title">Modo família/casal desativado</div>
        <div class="empty-desc">Ative em Configurações &gt; Família/Casal para cadastrar membros e dividir despesas.</div>
        <a class="btn btn-primary" href="#settings"><i class="ti ti-settings"></i> Ir para Configurações</a>
      </div>`;
    return;
  }

  let members: FamilyMember[] = [];
  let settlement: FamilySettlement = { balances: [], transfers: [] };

  setTopbarActions(`
    <button class="btn btn-primary" id="btn-new-member"><i class="ti ti-plus"></i> Novo membro</button>
  `);
  document.getElementById('btn-new-member')?.addEventListener('click', () => openMemberModal(null));

  async function load(): Promise<void> {
    [members, settlement] = await Promise.all([
      invoke<FamilyMember[]>('familyMembers:list'),
      invoke<FamilySettlement>('family:getSettlement'),
    ]);
  }

  function renderPage(): void {
    el.innerHTML = `
      <div class="card" style="margin-bottom:20px">
        <div class="card-header">Membros</div>
        <div class="card-hr"></div>
        ${members.length === 0
          ? `<div class="empty" style="padding:20px"><div class="empty-title">Nenhum membro cadastrado</div><div class="empty-desc">Cadastre os membros para poder dividir despesas e calcular quem deve quem.</div></div>`
          : `<table class="table">
              <thead><tr><th>NOME</th><th></th></tr></thead>
              <tbody>
                ${members.map(m => `<tr>
                  <td>${esc(m.name)}</td>
                  <td style="text-align:right">
                    <button class="btn btn-ghost btn-sm btn-edit-member" data-id="${m.id}"><i class="ti ti-pencil"></i></button>
                    <button class="btn btn-ghost btn-sm btn-del-member" data-id="${m.id}" style="color:var(--danger)"><i class="ti ti-trash"></i></button>
                  </td>
                </tr>`).join('')}
              </tbody>
            </table>`}
      </div>

      <div class="card">
        <div class="card-header">Quem deve quem</div>
        <div class="card-hr"></div>
        <div class="card-body">
          <div style="font-size:0.78rem;color:var(--text-3);margin-bottom:14px">
            Calculado a partir dos lançamentos com rateio entre membros (marque "Pago por" e "Dividir entre" ao criar um lançamento em Lançamentos).
          </div>
          ${settlement.balances.length === 0 ? `<div class="empty" style="padding:10px"><div class="empty-title">Sem dados de rateio ainda</div></div>` : `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:16px">
              ${settlement.balances.map(b => `
                <div style="background:var(--bg);border:0.5px solid var(--border);border-radius:8px;padding:10px 12px">
                  <div style="font-size:0.78rem;color:var(--text-3)">${esc(b.member_name)}</div>
                  <div style="font-weight:600;color:${b.net > 0 ? 'var(--accent)' : b.net < 0 ? 'var(--danger)' : 'var(--text)'}">
                    ${b.net > 0 ? '+' : ''}${formatCurrency(b.net)}
                  </div>
                  <div style="font-size:0.7rem;color:var(--text-3)">${b.net > 0 ? 'a receber' : b.net < 0 ? 'a pagar' : 'quite'}</div>
                </div>
              `).join('')}
            </div>
          `}
          ${settlement.transfers.length === 0 ? '' : `
            <div style="font-size:0.8rem;font-weight:600;color:var(--text-2);margin-bottom:8px">Transferências sugeridas para zerar as contas:</div>
            <div style="display:flex;flex-direction:column;gap:6px">
              ${settlement.transfers.map(t => `
                <div style="display:flex;align-items:center;gap:8px;font-size:0.85rem;background:var(--bg);border:0.5px solid var(--border);border-radius:6px;padding:8px 12px">
                  <strong>${esc(t.from_member_name)}</strong>
                  <i class="ti ti-arrow-right" style="color:var(--text-3)"></i>
                  <strong>${esc(t.to_member_name)}</strong>
                  <span style="margin-left:auto;font-weight:600;color:var(--accent)">${formatCurrency(t.amount)}</span>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </div>
    `;

    el.querySelectorAll<HTMLElement>('.btn-edit-member').forEach(btn =>
      btn.addEventListener('click', () => openMemberModal(members.find(m => m.id === btn.dataset.id) ?? null))
    );
    el.querySelectorAll<HTMLElement>('.btn-del-member').forEach(btn =>
      btn.addEventListener('click', async () => {
        const m = members.find(x => x.id === btn.dataset.id);
        if (!m) return;
        if (!await showConfirm(td("Excluir \"{value}\"? Rateios já lançados com esse membro serão removidos.", [m.name]), { danger: true, okLabel: 'Excluir' })) return;
        await invoke('familyMembers:delete', m.id);
        await load();
        renderPage();
      })
    );
  }

  function openMemberModal(member: FamilyMember | null): void {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:380px">
        <div class="modal-header">
          <span class="modal-title">${member ? 'Editar membro' : 'Novo membro'}</span>
          <button class="btn btn-ghost btn-sm modal-close"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Nome *</label>
            <input class="form-ctrl" id="f-member-name" value="${esc(member?.name ?? '')}" placeholder="Ex: Rodrigo">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary modal-close">Cancelar</button>
          <button class="btn btn-primary" id="btn-save-member">Salvar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelectorAll('.modal-close').forEach(b => b.addEventListener('click', () => overlay.remove()));
    overlay.querySelector('#btn-save-member')?.addEventListener('click', async () => {
      const name = (overlay.querySelector<HTMLInputElement>('#f-member-name')!).value.trim();
      if (!name) { showAlert('Informe o nome.'); return; }
      if (member) { await invoke('familyMembers:update', { id: member.id, name }); }
      else { await invoke('familyMembers:create', { name }); }
      overlay.remove();
      await load();
      renderPage();
    });
  }

  await load();
  renderPage();
}

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
