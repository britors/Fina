import QRCode from 'qrcode';
import { invoke, on } from '../api';
import { formatDate, t } from '../i18n';
import { showAlert, showConfirm } from '../components/alertDialog';
import type { PairedDevice } from '../../shared/types';

interface ListenerInfo { ip: string; port: number }
interface PairingCandidate { sessionId: string }

let listener: ListenerInfo | null = null;
let qrDataUrl = '';
let candidate: PairingCandidate | null = null;
let confirming = false;
let devices: PairedDevice[] = [];
let familyEnabled = false;
let familyMembers: string[] = [];
let activity: string[] = [];
let hashListenerAttached = false;

function pushActivity(message: string): void {
  activity = [message, ...activity].slice(0, 10);
}

async function stopListening(): Promise<void> {
  if (!listener) return;
  try { await invoke('mobileSync:stopListener'); } catch { /* já parado */ }
  listener = null;
  qrDataUrl = '';
  candidate = null;
}

export async function render(el: HTMLElement): Promise<void> {
  const [settings, deviceList] = await Promise.all([
    invoke<Record<string, string>>('settings:getAll'),
    invoke<PairedDevice[]>('mobileSync:listDevices'),
  ]);
  familyEnabled = settings.family_mode === 'true';
  familyMembers = (settings.family_members ?? '').split(',').map(v => v.trim()).filter(Boolean);
  devices = deviceList;

  if (!hashListenerAttached) {
    hashListenerAttached = true;
    window.addEventListener('hashchange', function onLeave() {
      window.removeEventListener('hashchange', onLeave);
      hashListenerAttached = false;
      void stopListening();
    }, { once: true });
  }

  on('mobileSync:event', async (data: unknown) => {
    const { event, payload } = data as { event: string; payload?: unknown };
    if (event === 'pairingCandidate') {
      candidate = payload as PairingCandidate;
      confirming = false;
    } else if (event === 'pairingExpired') {
      if (candidate && (payload as PairingCandidate).sessionId === candidate.sessionId) candidate = null;
      pushActivity(t('O celular não confirmou o código a tempo.'));
    } else if (event === 'paired') {
      candidate = null;
      confirming = false;
      devices = await invoke<PairedDevice[]>('mobileSync:listDevices');
      pushActivity(t('Celular "{deviceName}" pareado com sucesso.', { deviceName: (payload as PairedDevice).name }));
    } else if (event === 'transactionsReceived') {
      const results = (payload as { results: { status: string }[] }).results;
      const created = results.filter(r => r.status === 'created').length;
      pushActivity(t('{count} lançamento(s) recebido(s) do celular.', { count: created }));
      devices = await invoke<PairedDevice[]>('mobileSync:listDevices');
    }
    paint();
  });

  function paint(): void {
    el.innerHTML = view();
    wire();
  }

  function view(): string {
    const activeDevices = devices.filter(d => !d.revoked_at).length;
    return `
      <div style="max-width:640px;display:flex;flex-direction:column;gap:20px">

        <div class="card">
          <div class="card-header">
            <div style="display:flex;align-items:center;gap:10px">
              <i class="ti ti-qrcode" style="font-size:16px;color:var(--text-2)"></i>
              <span>${t('Parear novo celular')}</span>
            </div>
            ${!listener ? '' : !candidate
              ? `<span class="badge badge-pending"><i class="ti ti-clock" style="margin-right:4px"></i>${t('Aguardando celular')}</span>`
              : `<span class="badge badge-ok"><i class="ti ti-device-mobile" style="margin-right:4px"></i>${t('Conectado')}</span>`}
          </div>
          <div class="card-hr"></div>
          <div class="card-body">
            ${!listener ? `
              <p style="color:var(--text-2);margin-top:0;line-height:1.5">${t('Abra o Fina Mobile e escaneie o QR code abaixo. Um código vai aparecer no celular — digite esse código aqui para confirmar.')}</p>
              <button class="btn btn-primary" id="btn-start-pairing"><i class="ti ti-qrcode" style="margin-right:6px"></i>${t('Gerar QR code')}</button>
            ` : !candidate ? `
              <div style="display:flex;flex-direction:column;align-items:center;gap:16px;padding:8px 0">
                <div style="background:#fff;padding:16px;border-radius:12px;border:0.5px solid var(--border);box-shadow:0 1px 3px rgba(0,0,0,.2)">
                  <img src="${qrDataUrl}" alt="QR code" style="width:200px;height:200px;display:block">
                </div>
                <div style="display:flex;align-items:center;gap:8px;color:var(--text-2);font-size:13px">
                  <i class="ti ti-loader-2"></i>${t('Aguardando o celular conectar...')}
                </div>
                <button class="btn btn-secondary btn-sm" id="btn-stop-pairing">${t('Cancelar')}</button>
              </div>
            ` : `
              <div style="display:flex;align-items:center;gap:8px;color:var(--text-2);margin-bottom:16px;line-height:1.5">
                <i class="ti ti-circle-check" style="color:var(--accent);font-size:18px;flex-shrink:0"></i>
                ${t('Celular conectado. Digite abaixo o código exibido nele.')}
              </div>
              <div style="max-width:320px">
                <div class="form-group">
                  <label class="form-label">${t('Nome')}</label>
                  <input class="form-ctrl" id="pair-name" placeholder="${t('Nome do celular (ex: iPhone da Ana)')}">
                </div>
                ${familyEnabled && familyMembers.length ? `
                  <div class="form-group">
                    <label class="form-label">${t('Membro')}</label>
                    <select class="form-ctrl" id="pair-owner">
                      <option value="">${t('Sem membro associado')}</option>
                      ${familyMembers.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('')}
                    </select>
                  </div>
                ` : ''}
                <div class="form-group">
                  <label class="form-label">${t('Código de 6 dígitos')}</label>
                  <input class="form-ctrl" id="pair-code" placeholder="000000" maxlength="6" inputmode="numeric" style="letter-spacing:4px;font-variant-numeric:tabular-nums;text-align:center;font-size:16px">
                </div>
                <div style="display:flex;gap:8px">
                  <button class="btn btn-primary" id="btn-confirm-pairing" ${confirming ? 'disabled' : ''}>
                    ${confirming ? `<i class="ti ti-loader-2" style="margin-right:6px"></i>` : ''}${t('Confirmar')}
                  </button>
                  <button class="btn btn-secondary" id="btn-cancel-candidate">${t('Cancelar')}</button>
                </div>
              </div>
            `}
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div style="display:flex;align-items:center;gap:10px">
              <i class="ti ti-devices" style="font-size:16px;color:var(--text-2)"></i>
              <span>${t('Celulares pareados')}</span>
            </div>
            ${activeDevices > 0 ? `<span class="badge badge-ok">${activeDevices}</span>` : ''}
          </div>
          <div class="card-hr"></div>
          ${devices.length === 0 ? `
            <div class="empty">
              <i class="ti ti-device-mobile-off"></i>
              <div class="empty-title">${t('Nenhum celular pareado ainda.')}</div>
            </div>
          ` : `
            <div class="table-wrap" style="border:none;border-radius:0">
              <table class="table">
                <thead><tr>
                  <th>${t('Nome')}</th><th>${t('Membro')}</th><th>${t('Pareado em')}</th><th>${t('Último sync')}</th><th></th>
                </tr></thead>
                <tbody>
                  ${devices.map(d => `
                    <tr style="${d.revoked_at ? 'opacity:.5' : ''}">
                      <td class="desc-main">${esc(d.name)}</td>
                      <td>${d.owner ? esc(d.owner) : '—'}</td>
                      <td>${formatDate(d.paired_at)}</td>
                      <td>${d.last_sync_at ? formatDate(d.last_sync_at) : '—'}</td>
                      <td style="text-align:right">${d.revoked_at
                        ? `<span class="badge badge-expense">${t('Revogado')}</span>`
                        : `<button class="btn btn-secondary btn-sm" data-revoke="${d.id}">${t('Revogar')}</button>`}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>

        ${activity.length ? `
          <div class="card">
            <div class="card-header">
              <div style="display:flex;align-items:center;gap:10px">
                <i class="ti ti-history" style="font-size:16px;color:var(--text-2)"></i>
                <span>${t('Atividade recente')}</span>
              </div>
            </div>
            <div class="card-hr"></div>
            <div class="card-body" style="display:flex;flex-direction:column;gap:10px">
              ${activity.map(entry => `
                <div style="display:flex;align-items:flex-start;gap:8px;font-size:13px;color:var(--text-2)">
                  <i class="ti ti-point-filled" style="color:var(--accent);font-size:10px;margin-top:5px;flex-shrink:0"></i>
                  <span>${entry}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

      </div>
    `;
  }

  function wire(): void {
    el.querySelector('#btn-start-pairing')?.addEventListener('click', async () => {
      try {
        listener = await invoke<ListenerInfo>('mobileSync:startListener');
        qrDataUrl = await QRCode.toDataURL(JSON.stringify({ v: 1, ip: listener.ip, port: listener.port }));
      } catch (err) {
        showAlert(err instanceof Error ? err.message : String(err));
        return;
      }
      paint();
    });

    el.querySelector('#btn-stop-pairing')?.addEventListener('click', async () => {
      await stopListening();
      paint();
    });

    el.querySelector('#btn-cancel-candidate')?.addEventListener('click', async () => {
      if (candidate) await invoke('mobileSync:cancelPairing', candidate.sessionId);
      candidate = null;
      paint();
    });

    el.querySelector('#btn-confirm-pairing')?.addEventListener('click', async () => {
      if (!candidate) return;
      const name = (el.querySelector('#pair-name') as HTMLInputElement | null)?.value.trim();
      const owner = (el.querySelector('#pair-owner') as HTMLSelectElement | null)?.value || null;
      const code = (el.querySelector('#pair-code') as HTMLInputElement | null)?.value.trim() ?? '';
      if (!name) { showAlert(t('Informe um nome para identificar o celular.')); return; }
      confirming = true;
      paint();
      try {
        await invoke('mobileSync:confirmPairing', { sessionId: candidate.sessionId, code, name, owner });
      } catch (err) {
        confirming = false;
        showAlert(err instanceof Error ? err.message : String(err));
        paint();
      }
    });

    el.querySelectorAll<HTMLButtonElement>('[data-revoke]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ok = await showConfirm(t('Revogar o acesso desse celular? Ele vai precisar ser pareado de novo para voltar a enviar lançamentos.'));
        if (!ok) return;
        await invoke('mobileSync:revokeDevice', btn.dataset.revoke);
        devices = await invoke<PairedDevice[]>('mobileSync:listDevices');
        paint();
      });
    });
  }

  paint();
}

function esc(s?: string | null): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
