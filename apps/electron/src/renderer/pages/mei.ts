import { invoke } from '../api';
import { formatCurrency } from '../../shared/utils';
import { setTopbarActions } from '../components/topbar';
import { showAlert, showConfirm } from '../components/alertDialog';
import { attachMoneyMask, formatMoneyValue, moneyInputValue } from '../components/moneyMask';
import type { MeiDasPayment, MeiReport } from '../../shared/types';

export async function render(el: HTMLElement): Promise<void> {
  const settings = await invoke<Record<string, string>>('settings:getAll');
  if (settings.mei_enabled !== 'true') {
    setTopbarActions('');
    el.innerHTML = `
      <div class="empty">
        <i class="ti ti-receipt-2" style="font-size:2.5rem;color:var(--text-4)"></i>
        <div class="empty-title">Livro-caixa MEI desativado</div>
        <div class="empty-desc">Ative em Configurações &gt; Família/Casal &gt; MEI para marcar receitas como faturamento MEI e acompanhar o limite anual.</div>
        <a class="btn btn-primary" href="#settings"><i class="ti ti-settings"></i> Ir para Configurações</a>
      </div>`;
    return;
  }

  const currentYear = new Date().getFullYear();
  let year = currentYear;
  let report: MeiReport | null = null;

  setTopbarActions(`
    <select class="form-ctrl" id="mei-year" style="width:110px">
      ${[0, 1, 2, 3].map(i => {
        const y = currentYear - i;
        return `<option value="${y}" ${y === year ? 'selected' : ''}>${y}</option>`;
      }).join('')}
    </select>
    <button class="btn btn-primary" id="btn-add-das"><i class="ti ti-plus"></i> Registrar DAS</button>
  `);

  document.getElementById('mei-year')?.addEventListener('change', async e => {
    year = parseInt((e.target as HTMLSelectElement).value);
    await load();
    renderPage();
  });

  document.getElementById('btn-add-das')?.addEventListener('click', () => openDasModal());

  async function load(): Promise<void> {
    report = await invoke<MeiReport>('mei:getReport', year);
  }

  function renderPage(): void {
    if (!report) return;
    const r = report;
    const pct = Math.min((r.total_revenue / r.annual_limit) * 100, 100);

    el.innerHTML = `
      <div class="grid-3" style="margin-bottom:20px">
        <div class="stat-card">
          <div class="stat-label">Faturamento no ano</div>
          <div class="stat-value">${formatCurrency(r.total_revenue)}</div>
          <div class="stat-sub">Limite anual: ${formatCurrency(r.annual_limit)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">% do limite anual</div>
          <div class="stat-value" style="color:${pct >= 90 ? 'var(--danger)' : pct >= 70 ? 'var(--warning)' : 'var(--accent)'}">${pct.toFixed(1)}%</div>
          <div class="stat-sub">${r.projected_to_exceed ? 'Projeção indica que pode ultrapassar o limite' : 'Dentro da projeção do limite'}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">DAS pendentes</div>
          <div class="stat-value">${r.das_payments.filter(d => d.status === 'pendente').length}</div>
          <div class="stat-sub">${r.das_payments.length} registrados em ${r.year}</div>
        </div>
      </div>

      ${r.projected_to_exceed ? `
        <div style="background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.25);border-radius:8px;padding:12px 16px;font-size:0.82rem;color:var(--text-2);line-height:1.6;margin-bottom:20px">
          <i class="ti ti-alert-triangle" style="color:var(--danger)"></i>
          Pela média mensal até agora, o faturamento projetado para ${r.year} pode ultrapassar o limite anual do MEI (${formatCurrency(r.annual_limit)}). Avalie o desenquadramento antecipado ou reduza o ritmo de faturamento.
        </div>` : ''}

      <div class="card" style="margin-bottom:20px">
        <div class="card-header">Faturamento mensal — livro-caixa</div>
        <div class="card-hr"></div>
        ${r.months.length === 0
          ? `<div class="empty" style="padding:20px"><div class="empty-title">Nenhuma receita marcada como MEI em ${r.year}</div><div class="empty-desc">Marque "Receita MEI" ao lançar uma receita em Lançamentos.</div></div>`
          : `<table class="table">
              <thead><tr><th>MÊS</th><th style="text-align:right">FATURAMENTO</th><th style="text-align:right">ACUMULADO</th></tr></thead>
              <tbody>
                ${r.months.map(m => `<tr>
                  <td>${m.month}</td>
                  <td style="text-align:right">${formatCurrency(m.revenue)}</td>
                  <td style="text-align:right;font-weight:500">${formatCurrency(m.cumulative)}</td>
                </tr>`).join('')}
              </tbody>
            </table>`}
      </div>

      <div class="card">
        <div class="card-header">DAS (Documento de Arrecadação do Simples Nacional)</div>
        <div class="card-hr"></div>
        ${r.das_payments.length === 0
          ? `<div class="empty" style="padding:20px"><div class="empty-title">Nenhum DAS registrado</div></div>`
          : `<table class="table">
              <thead><tr><th>COMPETÊNCIA</th><th style="text-align:right">VALOR</th><th>STATUS</th><th></th></tr></thead>
              <tbody>
                ${r.das_payments.map(d => `<tr>
                  <td>${d.competencia}</td>
                  <td style="text-align:right">${formatCurrency(d.amount)}</td>
                  <td><span class="badge ${d.status === 'pago' ? 'badge-ok' : 'badge-warn'}">${d.status === 'pago' ? 'Pago' : 'Pendente'}</span></td>
                  <td style="text-align:right">
                    ${d.status === 'pendente' ? `<button class="btn btn-ghost btn-sm btn-pay-das" data-id="${d.id}"><i class="ti ti-check"></i> Marcar pago</button>` : ''}
                    <button class="btn btn-ghost btn-sm btn-del-das" data-id="${d.id}" style="color:var(--danger)"><i class="ti ti-trash"></i></button>
                  </td>
                </tr>`).join('')}
              </tbody>
            </table>`}
      </div>
    `;

    el.querySelectorAll<HTMLElement>('.btn-pay-das').forEach(btn =>
      btn.addEventListener('click', async () => {
        await invoke('mei:markDASPaid', { id: btn.dataset.id, paid_date: new Date().toISOString().slice(0, 10) });
        await load();
        renderPage();
      })
    );

    el.querySelectorAll<HTMLElement>('.btn-del-das').forEach(btn =>
      btn.addEventListener('click', async () => {
        if (!await showConfirm('Excluir este DAS?', { danger: true, okLabel: 'Excluir' })) return;
        await invoke('mei:deleteDAS', btn.dataset.id);
        await load();
        renderPage();
      })
    );
  }

  function openDasModal(): void {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:420px">
        <div class="modal-header">
          <span class="modal-title">Registrar DAS</span>
          <button class="btn btn-ghost btn-sm modal-close"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
          <div class="form-group">
            <label class="form-label">Competência (mês)</label>
            <input class="form-ctrl" id="das-competencia" type="month" value="${new Date().toISOString().slice(0, 7)}">
          </div>
          <div class="form-group">
            <label class="form-label">Valor</label>
            <input class="form-ctrl" id="das-amount" type="text" inputmode="decimal" value="${formatMoneyValue(0)}">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary modal-close">Cancelar</button>
          <button class="btn btn-primary" id="btn-save-das">Salvar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    attachMoneyMask(overlay.querySelector('#das-amount'));
    overlay.querySelectorAll('.modal-close').forEach(b => b.addEventListener('click', () => overlay.remove()));
    overlay.querySelector('#btn-save-das')?.addEventListener('click', async () => {
      const competencia = (overlay.querySelector<HTMLInputElement>('#das-competencia')!).value;
      if (!competencia) { showAlert('Informe a competência.'); return; }
      await invoke('mei:createDAS', { competencia, amount: moneyInputValue(overlay.querySelector<HTMLInputElement>('#das-amount')) || 0 });
      overlay.remove();
      await load();
      renderPage();
    });
  }

  await load();
  renderPage();
}
