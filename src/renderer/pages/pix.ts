import { invoke } from '../api';
import { formatCurrency } from '../../shared/utils';
import { setTopbarActions } from '../components/topbar';
import { openModal } from '../components/modal';
import { showAlert, showConfirm } from '../components/alertDialog';
import type { PixKeyValidation, PixPayment, PixPaymentStatus, PixRecipient } from '../../shared/types';
import type { Account } from '../../shared/types';

const STATUS_META: Record<PixPaymentStatus, { label: string; badge: string }> = {
  draft: { label: 'Rascunho', badge: 'badge-pending' },
  pending: { label: 'Pendente', badge: 'badge-warn' },
  sent: { label: 'Enviado', badge: 'badge-ok' },
  confirmed: { label: 'Confirmado', badge: 'badge-confirmed' },
  failed: { label: 'Falhou', badge: 'badge-overdue' },
  cancelled: { label: 'Cancelado', badge: 'badge-pending' },
};

export async function render(el: HTMLElement): Promise<void> {
  let statusFilter: PixPaymentStatus | '' = '';
  let dateFrom = '';
  let dateTo = '';
  let activeTab: 'history' | 'recipients' = 'history';

  setTopbarActions(`
    <button class="btn btn-primary" id="btn-pix-new">
      <i class="ti ti-send"></i> Novo Pix
    </button>
    <button class="btn btn-secondary" id="btn-pix-recipient">
      <i class="ti ti-user-plus"></i> Novo favorecido
    </button>
    <button class="btn btn-secondary" id="btn-pix-refresh">
      <i class="ti ti-refresh"></i> Atualizar
    </button>
  `);
  document.getElementById('btn-pix-new')?.addEventListener('click', () => openPixPaymentModal(() => renderPage()));
  document.getElementById('btn-pix-refresh')?.addEventListener('click', () => renderPage());
  document.getElementById('btn-pix-recipient')?.addEventListener('click', () => openRecipientModal(null, () => renderPage()));

  async function renderPage(): Promise<void> {
    const payments = await invoke<PixPayment[]>('pix:listPayments', {
      status: statusFilter,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    });
    const recipients = await invoke<PixRecipient[]>('pix:listRecipients');

    const total = payments.reduce((sum, payment) => sum + payment.amount, 0);
    const failed = payments.filter(payment => payment.status === 'failed').length;
    const confirmed = payments.filter(payment => payment.status === 'confirmed').length;

    el.innerHTML = `
      <div class="filters" style="margin-bottom:16px">
        <span class="chip ${activeTab === 'history' ? 'active' : ''}" data-tab="history">Histórico</span>
        <span class="chip ${activeTab === 'recipients' ? 'active' : ''}" data-tab="recipients">Favorecidos</span>
      </div>

      ${activeTab === 'history' ? `
      <div class="filters" style="margin-bottom:16px">
        <select class="form-ctrl" id="pix-status" style="width:auto">
          <option value="">Todos os status</option>
          ${Object.entries(STATUS_META).map(([status, meta]) => `<option value="${status}" ${statusFilter === status ? 'selected' : ''}>${meta.label}</option>`).join('')}
        </select>
        <span style="font-size:0.8rem;color:var(--text-2)">De</span>
        <input class="form-ctrl" id="pix-from" type="date" value="${dateFrom}" style="width:auto">
        <span style="color:var(--text-3)">até</span>
        <input class="form-ctrl" id="pix-to" type="date" value="${dateTo}" style="width:auto">
        <button class="btn btn-ghost btn-sm" id="pix-clear-filters">Limpar filtros</button>
      </div>

      <div class="grid-3" style="margin-bottom:20px">
        <div class="stat-card">
          <div class="stat-label">Tentativas Pix</div>
          <div class="stat-value">${payments.length}</div>
          <div class="stat-sub">no filtro atual</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Valor auditado</div>
          <div class="stat-value">${formatCurrency(total)}</div>
          <div class="stat-sub">soma das tentativas listadas</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Status</div>
          <div class="stat-value">${confirmed}/${failed}</div>
          <div class="stat-sub">confirmados / falhos</div>
        </div>
      </div>

      ${payments.length === 0 ? `
        <div class="empty">
          <i class="ti ti-history" style="font-size:2.5rem;color:var(--text-4)"></i>
          <div class="empty-title">Nenhuma tentativa Pix registrada</div>
          <div class="empty-desc">Quando o fluxo Pix for usado, as tentativas aparecerão aqui para auditoria.</div>
        </div>
      ` : `
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>DATA</th>
                <th>DESTINATÁRIO</th>
                <th>CHAVE</th>
                <th>ORIGEM</th>
                <th>STATUS</th>
                <th style="text-align:right">VALOR</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${payments.map(payment => paymentRow(payment)).join('')}
            </tbody>
          </table>
        </div>
      `}
      ` : recipientsSection(recipients)}
    `;

    el.querySelectorAll<HTMLElement>('[data-tab]').forEach(tab => {
      tab.addEventListener('click', () => {
        activeTab = tab.dataset.tab as 'history' | 'recipients';
        renderPage();
      });
    });

    el.querySelector<HTMLSelectElement>('#pix-status')?.addEventListener('change', event => {
      statusFilter = (event.target as HTMLSelectElement).value as PixPaymentStatus | '';
      renderPage();
    });
    el.querySelector<HTMLInputElement>('#pix-from')?.addEventListener('change', event => {
      dateFrom = (event.target as HTMLInputElement).value;
      renderPage();
    });
    el.querySelector<HTMLInputElement>('#pix-to')?.addEventListener('change', event => {
      dateTo = (event.target as HTMLInputElement).value;
      renderPage();
    });
    el.querySelector('#pix-clear-filters')?.addEventListener('click', () => {
      statusFilter = '';
      dateFrom = '';
      dateTo = '';
      renderPage();
    });
    el.querySelectorAll<HTMLElement>('[data-pix-detail]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const payment = await invoke<PixPayment | null>('pix:getPayment', btn.dataset.pixDetail);
        if (payment) openPaymentDetail(payment);
      });
    });
    el.querySelectorAll<HTMLElement>('[data-edit-recipient]').forEach(btn => {
      btn.addEventListener('click', () => {
        const recipient = recipients.find(item => item.id === btn.dataset.editRecipient);
        if (recipient) openRecipientModal(recipient, () => renderPage());
      });
    });
    el.querySelectorAll<HTMLElement>('[data-del-recipient]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const recipient = recipients.find(item => item.id === btn.dataset.delRecipient);
        if (!recipient) return;
        if (!await showConfirm(`Excluir favorecido "${recipient.name}"?`, { danger: true, okLabel: 'Excluir' })) return;
        await invoke('pix:deleteRecipient', recipient.id);
        renderPage();
      });
    });
  }

  await renderPage();
}

async function openPixPaymentModal(onDone: () => void): Promise<void> {
  const [accounts, recipients] = await Promise.all([
    invoke<Account[]>('accounts:list'),
    invoke<PixRecipient[]>('pix:listRecipients'),
  ]);
  const openFinanceAccounts = accounts.filter(account => account.openfinance_provider);
  if (openFinanceAccounts.length === 0) {
    await showAlert('Conecte uma conta via Open Finance antes de iniciar um Pix.');
    return;
  }

  const overlay = openModal({
    title: 'Novo Pix',
    saveLabel: 'Revisar',
    body: `
      <div class="form-group">
        <label class="form-label">Conta de origem</label>
        <select class="form-ctrl" id="pix-source-account">
          ${openFinanceAccounts.map(account => `<option value="${account.id}" data-provider="${esc(account.openfinance_provider)}">${esc(account.name)}${account.bank_name ? ` · ${esc(account.bank_name)}` : ''}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Favorecido salvo</label>
        <select class="form-ctrl" id="pix-recipient-select">
          <option value="">— Informar chave manualmente —</option>
          ${recipients.map(recipient => `<option value="${recipient.id}">${esc(recipient.name)} · ${keyTypeLabel(recipient.key_type)}</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Chave Pix</label>
          <input class="form-ctrl" id="pix-key" placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória">
          <div id="pix-payment-key-validation" style="font-size:0.78rem;margin-top:6px;color:var(--text-3)"></div>
        </div>
        <div class="form-group">
          <label class="form-label">Valor</label>
          <input class="form-ctrl" id="pix-amount" type="number" step="0.01" min="0" placeholder="0,00">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Destinatário</label>
          <input class="form-ctrl" id="pix-recipient-name" placeholder="Nome para conferência">
        </div>
        <div class="form-group">
          <label class="form-label">Instituição</label>
          <input class="form-ctrl" id="pix-recipient-bank" placeholder="Opcional">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Descrição</label>
        <input class="form-ctrl" id="pix-description" placeholder="Opcional">
      </div>
      <div style="background:rgba(239,159,39,.08);border:1px solid rgba(239,159,39,.25);border-radius:8px;padding:12px;font-size:0.8rem;color:var(--text-2);line-height:1.6">
        Nesta etapa o Fina registra uma tentativa auditável em modo sandbox. O envio real depende do adaptador Pix do provedor.
      </div>
    `,
    onSave: async modal => {
      const accountSelect = modal.querySelector<HTMLSelectElement>('#pix-source-account')!;
      const selectedOption = accountSelect.selectedOptions[0];
      const provider = selectedOption?.dataset.provider ?? 'pluggy';
      const source_account_id = accountSelect.value;
      const pix_key = modal.querySelector<HTMLInputElement>('#pix-key')!.value.trim();
      const amount = parseFloat(modal.querySelector<HTMLInputElement>('#pix-amount')!.value);
      const recipient_name = modal.querySelector<HTMLInputElement>('#pix-recipient-name')!.value.trim();
      const recipient_bank = modal.querySelector<HTMLInputElement>('#pix-recipient-bank')!.value.trim();
      const description = modal.querySelector<HTMLInputElement>('#pix-description')!.value.trim();
      const validation = await invoke<PixKeyValidation>('pix:validateKey', pix_key);
      if (!validation.valid) {
        showAlert(validation.message);
        return false;
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        showAlert('Informe um valor Pix válido.');
        return false;
      }
      if (!await showConfirm([
        'Confirmar registro desta tentativa Pix em modo sandbox?',
        '',
        `Destinatário: ${recipient_name || 'não informado'}`,
        `Chave: ${maskDisplayKey(validation.normalizedKey)}`,
        `Valor: ${formatCurrency(amount)}`,
      ].join('\n'), { okLabel: 'Confirmar' })) return false;

      try {
        await invoke<PixPayment>('pix:simulatePayment', {
          provider,
          source_account_id,
          amount,
          pix_key,
          recipient_name,
          recipient_bank,
          description,
        });
        onDone();
      } catch (err) {
        showAlert(err instanceof Error ? err.message : 'Não foi possível registrar a tentativa Pix.');
        return false;
      }
    },
  });

  const recipientSelect = overlay.querySelector<HTMLSelectElement>('#pix-recipient-select')!;
  const keyInput = overlay.querySelector<HTMLInputElement>('#pix-key')!;
  const nameInput = overlay.querySelector<HTMLInputElement>('#pix-recipient-name')!;
  const bankInput = overlay.querySelector<HTMLInputElement>('#pix-recipient-bank')!;
  const validationEl = overlay.querySelector<HTMLElement>('#pix-payment-key-validation')!;

  const validate = async (): Promise<void> => {
    const result = await invoke<PixKeyValidation>('pix:validateKey', keyInput.value);
    validationEl.textContent = result.message;
    validationEl.style.color = result.valid ? 'var(--accent)' : 'var(--danger)';
  };
  keyInput.addEventListener('input', () => { void validate(); });
  recipientSelect.addEventListener('change', () => {
    const recipient = recipients.find(item => item.id === recipientSelect.value);
    if (!recipient) return;
    keyInput.value = recipient.pix_key;
    nameInput.value = recipient.name;
    bankInput.value = recipient.institution ?? '';
    void validate();
  });
}

function recipientsSection(recipients: PixRecipient[]): string {
  return recipients.length === 0 ? `
    <div class="empty">
      <i class="ti ti-users" style="font-size:2.5rem;color:var(--text-4)"></i>
      <div class="empty-title">Nenhum favorecido Pix cadastrado</div>
      <div class="empty-desc">Cadastre destinatários frequentes para reduzir erro de digitação no fluxo Pix.</div>
    </div>
  ` : `
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>NOME</th>
            <th>TIPO</th>
            <th>CHAVE</th>
            <th>INSTITUIÇÃO</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${recipients.map(recipient => `
            <tr>
              <td>
                <div class="desc-main">${esc(recipient.name)}</div>
                ${recipient.notes ? `<div class="desc-sub">${esc(recipient.notes)}</div>` : ''}
              </td>
              <td><span class="badge badge-ok">${keyTypeLabel(recipient.key_type)}</span></td>
              <td style="color:var(--text-2)">${esc(maskDisplayKey(recipient.pix_key))}</td>
              <td style="color:var(--text-2)">${esc(recipient.institution ?? '—')}</td>
              <td style="text-align:right">
                <button class="btn btn-ghost btn-sm" data-edit-recipient="${recipient.id}">Editar</button>
                <button class="btn btn-danger btn-sm" data-del-recipient="${recipient.id}">✕</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function paymentRow(payment: PixPayment): string {
  const meta = STATUS_META[payment.status];
  return `
    <tr>
      <td style="color:var(--text-2)">${formatDateTime(payment.created_at)}</td>
      <td>
        <div class="desc-main">${esc(payment.recipient_name ?? 'Destinatário não resolvido')}</div>
        <div class="desc-sub">${esc(payment.recipient_bank ?? payment.provider)}</div>
      </td>
      <td style="color:var(--text-2)">${esc(payment.pix_key_masked)}</td>
      <td style="color:var(--text-2)">${esc(payment.source_account_name ?? '—')}</td>
      <td><span class="badge ${meta.badge}">${meta.label}</span></td>
      <td style="text-align:right;font-weight:600">${formatCurrency(payment.amount)}</td>
      <td style="text-align:right">
        <button class="btn btn-ghost btn-sm" data-pix-detail="${payment.id}">Detalhes</button>
      </td>
    </tr>
  `;
}

function openPaymentDetail(payment: PixPayment): void {
  const meta = STATUS_META[payment.status];
  openModal({
    title: 'Detalhes do Pix',
    saveLabel: 'Fechar',
    body: `
      <div style="display:flex;flex-direction:column;gap:10px;font-size:0.86rem">
        <div style="display:flex;justify-content:space-between;gap:12px">
          <span style="color:var(--text-3)">Status</span>
          <span class="badge ${meta.badge}">${meta.label}</span>
        </div>
        ${detailRow('Criado em', formatDateTime(payment.created_at))}
        ${detailRow('Atualizado em', formatDateTime(payment.updated_at))}
        ${detailRow('Provedor', payment.provider)}
        ${detailRow('Conta de origem', payment.source_account_name ?? '—')}
        ${detailRow('Valor', formatCurrency(payment.amount))}
        ${detailRow('Chave Pix', payment.pix_key_masked)}
        ${detailRow('Destinatário', payment.recipient_name ?? '—')}
        ${detailRow('Instituição', payment.recipient_bank ?? '—')}
        ${detailRow('Descrição', payment.description ?? '—')}
        ${detailRow('ID externo', payment.external_id ?? '—')}
        ${detailRow('Lançamento vinculado', payment.transaction_id ?? '—')}
        ${payment.error_message ? `
          <div style="background:rgba(235,87,87,.08);border:1px solid rgba(235,87,87,.25);border-radius:8px;padding:10px;color:var(--danger)">
            ${esc(payment.error_message)}
          </div>
        ` : ''}
      </div>
    `,
    onSave: () => true,
  });
}

function openRecipientModal(recipient: PixRecipient | null, onDone: () => void): void {
  const overlay = openModal({
    title: recipient ? 'Editar favorecido Pix' : 'Novo favorecido Pix',
    body: `
      <div class="form-group">
        <label class="form-label">Nome</label>
        <input class="form-ctrl" id="pix-recipient-name" value="${esc(recipient?.name ?? '')}" placeholder="Ex: Maria Silva">
      </div>
      <div class="form-group">
        <label class="form-label">Chave Pix</label>
        <input class="form-ctrl" id="pix-recipient-key" value="${esc(recipient?.pix_key ?? '')}" placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória">
        <div id="pix-key-validation" style="font-size:0.78rem;margin-top:6px;color:var(--text-3)"></div>
      </div>
      <div class="form-group">
        <label class="form-label">Instituição</label>
        <input class="form-ctrl" id="pix-recipient-bank" value="${esc(recipient?.institution ?? '')}" placeholder="Opcional">
      </div>
      <div class="form-group">
        <label class="form-label">Observações</label>
        <textarea class="form-ctrl" id="pix-recipient-notes" rows="2">${esc(recipient?.notes ?? '')}</textarea>
      </div>
    `,
    onSave: async modal => {
      const name = modal.querySelector<HTMLInputElement>('#pix-recipient-name')!.value.trim();
      const pix_key = modal.querySelector<HTMLInputElement>('#pix-recipient-key')!.value.trim();
      const institution = modal.querySelector<HTMLInputElement>('#pix-recipient-bank')!.value.trim();
      const notes = modal.querySelector<HTMLTextAreaElement>('#pix-recipient-notes')!.value.trim();
      try {
        await invoke('pix:saveRecipient', { id: recipient?.id, name, pix_key, institution, notes });
        onDone();
      } catch (err) {
        showAlert(err instanceof Error ? err.message : 'Não foi possível salvar o favorecido.');
        return false;
      }
    },
  });

  const keyInput = overlay.querySelector<HTMLInputElement>('#pix-recipient-key')!;
  const validationEl = overlay.querySelector<HTMLElement>('#pix-key-validation')!;
  const validate = async (): Promise<void> => {
    const result = await invoke<PixKeyValidation>('pix:validateKey', keyInput.value);
    validationEl.textContent = result.message;
    validationEl.style.color = result.valid ? 'var(--accent)' : 'var(--danger)';
  };
  keyInput.addEventListener('input', () => { void validate(); });
  if (keyInput.value) void validate();
}

function detailRow(label: string, value: string): string {
  return `
    <div style="display:flex;justify-content:space-between;gap:12px;border-bottom:0.5px solid var(--border);padding-bottom:8px">
      <span style="color:var(--text-3)">${esc(label)}</span>
      <strong style="text-align:right">${esc(value)}</strong>
    </div>
  `;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function keyTypeLabel(type: string): string {
  const labels: Record<string, string> = { cpf: 'CPF', cnpj: 'CNPJ', email: 'E-mail', phone: 'Telefone', random: 'Aleatória' };
  return labels[type] ?? type;
}

function maskDisplayKey(value: string): string {
  if (value.includes('@')) {
    const [name, domain] = value.split('@');
    return `${name.slice(0, 2)}***@${domain ?? ''}`;
  }
  if (value.length <= 8) return `${value.slice(0, 2)}***`;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function esc(s?: string | null): string {
  return (s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g, '&quot;');
}
