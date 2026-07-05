import { invoke } from '../api';
import { formatCurrency } from '../../shared/utils';
import { setTopbarActions } from '../components/topbar';
import { showAlert, showConfirm } from '../components/alertDialog';
import { aiDraftNotice, openAICreateDraft } from '../components/aiCreateDraft';
import type { AIDebtDraft, Debt, DebtType, DebtStatus, DebtSimulation } from '../../shared/types';

const TYPE_META: Record<DebtType, { label: string; icon: string }> = {
  emprestimo:      { label: 'Empréstimo pessoal',   icon: 'ti-cash'            },
  financiamento:   { label: 'Financiamento',         icon: 'ti-building-bank'   },
  cartao:          { label: 'Cartão de crédito',     icon: 'ti-credit-card'     },
  cheque_especial: { label: 'Cheque especial',       icon: 'ti-wallet'          },
  pessoal:         { label: 'Dívida pessoal',        icon: 'ti-user'            },
  outro:           { label: 'Outro',                 icon: 'ti-dots'            },
};

const STATUS_META: Record<DebtStatus, { label: string; badge: string }> = {
  em_dia:      { label: 'Em dia',      badge: 'badge-confirmed' },
  em_atraso:   { label: 'Em atraso',   badge: 'badge-overdue'   },
  renegociada: { label: 'Renegociada', badge: 'badge-warn'      },
  quitada:     { label: 'Quitada',     badge: 'badge-ok'        },
};

export async function render(el: HTMLElement): Promise<void> {
  let debts: Debt[] = [];

  async function load(): Promise<void> {
    debts = await invoke<Debt[]>('debts:list');
  }

  setTopbarActions(`
    <button class="btn btn-secondary" id="btn-ai-create-debt">
      <i class="ti ti-sparkles"></i> Criar com IA
    </button>
    <button class="btn btn-primary" id="btn-new-debt">
      <i class="ti ti-plus"></i> Nova dívida
    </button>
  `);
  document.getElementById('btn-new-debt')?.addEventListener('click', () => openModal(null));
  document.getElementById('btn-ai-create-debt')?.addEventListener('click', () => {
    openAICreateDraft<AIDebtDraft>({
      target: 'debt',
      title: 'Criar dívida com IA',
      placeholder: 'Ex: empréstimo de R$ 5000 em 24 parcelas de R$ 310',
      onDraft: draft => openModal(null, draft),
    });
  });

  async function renderPage(): Promise<void> {
    const active = debts.filter(d => d.status !== 'quitada');
    const totalBalance = active.reduce((s, d) => s + d.outstanding_balance, 0);
    const totalMonthly = active.reduce((s, d) => s + d.installment_amount, 0);

    el.innerHTML = `
      <div class="grid-3" style="margin-bottom:20px">
        <div class="stat-card">
          <div class="stat-label">Total em dívidas</div>
          <div class="stat-value stat-red">${formatCurrency(totalBalance)}</div>
          <div class="stat-sub">${active.length} dívida${active.length !== 1 ? 's' : ''} ativa${active.length !== 1 ? 's' : ''}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Parcelas mensais</div>
          <div class="stat-value">${formatCurrency(totalMonthly)}</div>
          <div class="stat-sub">compromisso mensal</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Dívidas quitadas</div>
          <div class="stat-value stat-green">${debts.filter(d => d.status === 'quitada').length}</div>
          <div class="stat-sub">de ${debts.length} total</div>
        </div>
      </div>

      ${debts.length === 0 ? `
        <div class="empty">
          <i class="ti ti-receipt-off" style="font-size:2.5rem;color:var(--text-4)"></i>
          <div class="empty-title">Nenhuma dívida cadastrada</div>
          <div class="empty-desc">Registre empréstimos, financiamentos e cartões para acompanhar seu endividamento.</div>
          <button class="btn btn-primary" id="btn-empty-debt"><i class="ti ti-plus"></i> Adicionar dívida</button>
        </div>` : `
        <div class="card">
          <div class="card-hr" style="margin:0"></div>
          <table class="table">
            <thead>
              <tr>
                <th>DESCRIÇÃO</th>
                <th>TIPO</th>
                <th style="text-align:right">SALDO DEVEDOR</th>
                <th style="text-align:right">PARCELA</th>
                <th style="text-align:right">JUROS/MÊS</th>
                <th style="text-align:center">PROGRESSO</th>
                <th style="text-align:center">STATUS</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${debts.map(d => {
                const meta   = TYPE_META[d.type];
                const status = STATUS_META[d.status];
                const paid   = d.installments_total - d.installments_remaining;
                const pct    = d.installments_total > 0 ? (paid / d.installments_total) * 100 : 0;
                return `<tr>
                  <td>
                    <div style="font-weight:500">${esc(d.description)}</div>
                    ${d.creditor ? `<div style="font-size:0.75rem;color:var(--text-3)">${esc(d.creditor)}</div>` : ''}
                    ${d.next_due_date ? `<div style="font-size:0.73rem;color:var(--text-3)">Próx: ${fmtDate(d.next_due_date)}</div>` : ''}
                  </td>
                  <td>
                    <span style="font-size:0.78rem;color:var(--text-2)">
                      <i class="ti ${meta.icon}"></i> ${meta.label}
                    </span>
                  </td>
                  <td style="text-align:right;color:var(--danger);font-weight:500">${formatCurrency(d.outstanding_balance)}</td>
                  <td style="text-align:right">${formatCurrency(d.installment_amount)}</td>
                  <td style="text-align:right;color:var(--warning)">${d.interest_rate.toFixed(2)}%</td>
                  <td style="text-align:center;min-width:120px">
                    <div class="progress-track" style="margin:0 auto;max-width:100px">
                      <div class="prog-fill" style="width:${pct.toFixed(0)}%"></div>
                    </div>
                    <div style="font-size:0.7rem;color:var(--text-3);margin-top:2px">${paid}/${d.installments_total}</div>
                  </td>
                  <td style="text-align:center"><span class="badge ${status.badge}">${status.label}</span></td>
                  <td style="text-align:right;white-space:nowrap">
                    <button class="btn btn-ghost btn-sm btn-sim" data-id="${d.id}" title="Simular quitação"><i class="ti ti-calculator"></i></button>
                    <button class="btn btn-ghost btn-sm btn-bill" data-id="${d.id}" title="Gerar conta a pagar"><i class="ti ti-calendar-plus"></i></button>
                    <button class="btn btn-ghost btn-sm btn-edit-debt" data-id="${d.id}" title="Editar"><i class="ti ti-pencil"></i></button>
                    <button class="btn btn-ghost btn-sm btn-del-debt" data-id="${d.id}" title="Excluir" style="color:var(--danger)"><i class="ti ti-trash"></i></button>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    `;

    el.querySelector('#btn-empty-debt')?.addEventListener('click', () => openModal(null));
    el.querySelectorAll<HTMLElement>('.btn-edit-debt').forEach(btn =>
      btn.addEventListener('click', () => openModal(debts.find(d => d.id === btn.dataset.id) ?? null))
    );
    el.querySelectorAll<HTMLElement>('.btn-del-debt').forEach(btn =>
      btn.addEventListener('click', async () => {
        const d = debts.find(x => x.id === btn.dataset.id);
        if (!d) return;
        if (!await showConfirm(`Excluir "${d.description}"?`, { danger: true, okLabel: 'Excluir' })) return;
        await invoke('debts:delete', d.id);
        await load();
        await renderPage();
      })
    );
    el.querySelectorAll<HTMLElement>('.btn-bill').forEach(btn =>
      btn.addEventListener('click', async () => {
        await invoke('debts:createBill', btn.dataset.id!);
        showAlert('Parcela adicionada em Contas à pagar.');
      })
    );
    el.querySelectorAll<HTMLElement>('.btn-sim').forEach(btn =>
      btn.addEventListener('click', () => {
        const d = debts.find(x => x.id === btn.dataset.id);
        if (d) openSimulator(d);
      })
    );
  }

  function openModal(debt: Debt | null, draft?: AIDebtDraft): void {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:560px">
        <div class="modal-header">
          <span class="modal-title">${debt ? 'Editar dívida' : 'Nova dívida'}</span>
          <button class="btn btn-ghost btn-sm modal-close"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
          ${!debt && draft?.explanation ? aiDraftNotice(draft) : ''}
          <div class="form-row">
            <div class="form-group" style="flex:2">
              <label class="form-label">Descrição *</label>
              <input class="form-ctrl" id="f-desc" value="${esc(debt?.description ?? draft?.description ?? '')}" placeholder="Ex: Financiamento Celta">
            </div>
            <div class="form-group" style="flex:1">
              <label class="form-label">Tipo *</label>
              <select class="form-ctrl" id="f-type">
                ${Object.entries(TYPE_META).map(([v, m]) =>
                  `<option value="${v}" ${(debt?.type ?? draft?.type) === v ? 'selected' : ''}>${m.label}</option>`
                ).join('')}
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Credor</label>
              <input class="form-ctrl" id="f-cred" value="${esc(debt?.creditor ?? draft?.creditor ?? '')}" placeholder="Ex: Banco Itaú">
            </div>
            <div class="form-group">
              <label class="form-label">Status</label>
              <select class="form-ctrl" id="f-status">
                ${Object.entries(STATUS_META).map(([v, m]) =>
                  `<option value="${v}" ${(debt?.status ?? draft?.status) === v ? 'selected' : ''}>${m.label}</option>`
                ).join('')}
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Valor original</label>
              <input class="form-ctrl" id="f-orig" type="number" step="0.01" min="0" value="${debt?.original_amount ?? draft?.original_amount ?? 0}">
            </div>
            <div class="form-group">
              <label class="form-label">Saldo devedor</label>
              <input class="form-ctrl" id="f-balance" type="number" step="0.01" min="0" value="${debt?.outstanding_balance ?? draft?.outstanding_balance ?? 0}">
            </div>
            <div class="form-group">
              <label class="form-label">Juros (% a.m.)</label>
              <input class="form-ctrl" id="f-rate" type="number" step="0.01" min="0" value="${debt?.interest_rate ?? draft?.interest_rate ?? 0}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Total de parcelas</label>
              <input class="form-ctrl" id="f-total" type="number" min="1" value="${debt?.installments_total ?? draft?.installments_total ?? 1}">
            </div>
            <div class="form-group">
              <label class="form-label">Parcelas restantes</label>
              <input class="form-ctrl" id="f-rem" type="number" min="0" value="${debt?.installments_remaining ?? draft?.installments_remaining ?? 1}">
            </div>
            <div class="form-group">
              <label class="form-label">Valor da parcela</label>
              <input class="form-ctrl" id="f-install" type="number" step="0.01" min="0" value="${debt?.installment_amount ?? draft?.installment_amount ?? 0}">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Próximo vencimento</label>
            <input class="form-ctrl" id="f-due" type="date" value="${debt?.next_due_date ?? draft?.next_due_date ?? ''}">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary modal-close">Cancelar</button>
          <button class="btn btn-primary" id="btn-save-debt">Salvar</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    const close = (): void => {
      overlay.remove();
      document.body.focus();
    };

    overlay.querySelectorAll('.modal-close').forEach(b => b.addEventListener('click', close));

    overlay.querySelector('#btn-save-debt')?.addEventListener('click', async () => {
      const description = (overlay.querySelector<HTMLInputElement>('#f-desc')!).value.trim();
      if (!description) { showAlert('Informe a descrição.'); return; }
      const payload = {
        description,
        type:                    (overlay.querySelector<HTMLSelectElement>('#f-type')!).value,
        creditor:                (overlay.querySelector<HTMLInputElement>('#f-cred')!).value.trim() || null,
        status:                  (overlay.querySelector<HTMLSelectElement>('#f-status')!).value,
        original_amount:         parseFloat((overlay.querySelector<HTMLInputElement>('#f-orig')!).value)    || 0,
        outstanding_balance:     parseFloat((overlay.querySelector<HTMLInputElement>('#f-balance')!).value) || 0,
        interest_rate:           parseFloat((overlay.querySelector<HTMLInputElement>('#f-rate')!).value)    || 0,
        installments_total:      parseInt((overlay.querySelector<HTMLInputElement>('#f-total')!).value)     || 1,
        installments_remaining:  parseInt((overlay.querySelector<HTMLInputElement>('#f-rem')!).value)       || 1,
        installment_amount:      parseFloat((overlay.querySelector<HTMLInputElement>('#f-install')!).value) || 0,
        next_due_date:           (overlay.querySelector<HTMLInputElement>('#f-due')!).value || null,
      };
      if (debt) { await invoke('debts:update', { id: debt.id, ...payload }); }
      else       { await invoke('debts:create', payload); }
      close();
      await load();
      await renderPage();
    });
  }

  function openSimulator(debt: Debt): void {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:460px">
        <div class="modal-header">
          <span class="modal-title"><i class="ti ti-calculator"></i> Simular quitação</span>
          <button class="btn btn-ghost btn-sm modal-close"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
          <div style="font-size:0.85rem;color:var(--text-2)">
            <strong>${esc(debt.description)}</strong> · Saldo: ${formatCurrency(debt.outstanding_balance)} · ${debt.interest_rate}% a.m.
          </div>
          <div class="form-group">
            <label class="form-label">Pagamento extra por mês</label>
            <input class="form-ctrl" id="sim-extra" type="number" step="10" min="0" value="0" placeholder="R$ 0,00">
          </div>
          <div id="sim-result" style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:14px;display:none">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary modal-close">Fechar</button>
          <button class="btn btn-primary" id="btn-sim-calc"><i class="ti ti-calculator"></i> Calcular</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    const close = (): void => {
      overlay.remove();
      document.body.focus();
    };

    overlay.querySelectorAll('.modal-close').forEach(b => b.addEventListener('click', close));

    overlay.querySelector('#btn-sim-calc')?.addEventListener('click', async () => {
      const extra = parseFloat((overlay.querySelector<HTMLInputElement>('#sim-extra')!).value) || 0;
      const [base, withExtra] = await Promise.all([
        invoke<DebtSimulation>('debts:simulate', { balance: debt.outstanding_balance, rate: debt.interest_rate, min_payment: debt.installment_amount, extra_payment: 0 }),
        invoke<DebtSimulation>('debts:simulate', { balance: debt.outstanding_balance, rate: debt.interest_rate, min_payment: debt.installment_amount, extra_payment: extra }),
      ]);

      const res = overlay.querySelector<HTMLElement>('#sim-result')!;
      res.style.display = 'block';
      res.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <div style="font-size:0.75rem;color:var(--text-3);margin-bottom:4px">Sem pagamento extra</div>
            <div style="font-weight:600">${base.months_to_pay} meses</div>
            <div style="font-size:0.8rem;color:var(--danger)">Juros: ${formatCurrency(base.total_interest)}</div>
          </div>
          <div>
            <div style="font-size:0.75rem;color:var(--text-3);margin-bottom:4px">Com +${formatCurrency(extra)}/mês</div>
            <div style="font-weight:600;color:var(--accent)">${withExtra.months_to_pay} meses</div>
            <div style="font-size:0.8rem;color:var(--danger)">Juros: ${formatCurrency(withExtra.total_interest)}</div>
          </div>
        </div>
        ${extra > 0 && withExtra.savings_vs_minimum > 0 ? `
          <div style="margin-top:10px;padding:8px;background:rgba(29,158,117,.1);border-radius:6px;font-size:0.82rem;color:var(--accent)">
            <i class="ti ti-piggy-bank"></i> Economia total em juros: <strong>${formatCurrency(withExtra.savings_vs_minimum)}</strong>
            e quitação <strong>${base.months_to_pay - withExtra.months_to_pay} meses mais cedo</strong>
          </div>` : ''}
      `;
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
