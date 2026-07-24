import { invoke } from '../api';
import { formatCurrency, formatDate, isPixEligibleAccountType } from '../../shared/utils';
import { openModal } from '../components/modal';
import { attachMoneyMask, formatMoneyValue, moneyInputValue } from '../components/moneyMask';
import { showAlert, showConfirm } from '../components/alertDialog';
import { setTopbarActions } from '../components/topbar';
import type { Account, ReceivableInterval, ReceivablePriceIncrease, ReceivableWithCategory, Category, DetectedRecurrence } from '../../shared/types';
import { categoryOptions } from '../components/categorySelect';

const INTERVAL_LABELS: Record<ReceivableInterval, string> = {
  weekly:     'Semanal',
  biweekly:   'Quinzenal',
  monthly:    'Mensal',
  bimonthly:  'Bimestral',
  quarterly:  'Trimestral',
  semiannual: 'Semestral',
  annual:     'Anual',
};

let accounts: Account[] = [];
let categories: Category[] = [];

export async function render(el: HTMLElement): Promise<void> {
  [accounts, categories] = await Promise.all([
    invoke<Account[]>('accounts:list'),
    invoke<Category[]>('categories:list', 'income'),
  ]);

  setTopbarActions(`
    <button class="btn btn-primary" id="btn-new-fixed"><i class="ti ti-plus"></i> Nova fixa</button>
  `);

  async function renderPage(): Promise<void> {
    const [all, priceIncreases, detections] = await Promise.all([
      invoke<ReceivableWithCategory[]>('receivables:list', {}),
      invoke<ReceivablePriceIncrease[]>('receivables:getPriceIncreases'),
      invoke<DetectedRecurrence[]>('recurrenceDetection:list', 'income'),
    ]);
    const fixed = all.filter(r => r.recurring);
    const increaseByReceivable = new Map(priceIncreases.map(i => [i.receivable_id, i]));
    const monthlyTotal = fixed.reduce((sum, r) => sum + r.amount, 0);
    const nextDue = [...fixed].sort((a, b) => a.due_date.localeCompare(b.due_date))[0];

    el.innerHTML = `
      <div class="grid-3" style="margin-bottom:20px">
        <div class="stat-card">
          <div class="stat-label">Fixas ativas</div>
          <div class="stat-value">${fixed.length}</div>
          <div class="stat-sub">recebimentos e mensalidades</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Recebimento mensal</div>
          <div class="stat-value stat-green">${formatCurrency(monthlyTotal)}</div>
          <div class="stat-sub">baseado nas recorrências ativas</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Próximo vencimento</div>
          <div class="stat-value" style="font-size:1.15rem">${nextDue ? formatDate(nextDue.due_date) : '—'}</div>
          <div class="stat-sub">${nextDue ? esc(nextDue.description) : 'nenhuma receita fixa'}</div>
        </div>
      </div>

      ${detections.length > 0 ? `
        <div class="card" style="margin-bottom:20px">
          <div class="card-header">Recorrências detectadas automaticamente</div>
          <div class="card-hr"></div>
          <div class="card-body">
            <p style="font-size:0.8rem;color:var(--text-3);margin-bottom:12px">
              Recebimentos repetidos identificados no histórico de transações, ainda não cadastrados como fixos. Revise e confirme cada um.
            </p>
            <div style="display:flex;flex-direction:column;gap:10px">
              ${detections.map(detectionCard).join('')}
            </div>
          </div>
        </div>
      ` : ''}

      ${fixed.length === 0 ? `
        <div class="empty">
          <i class="ti ti-repeat-off"></i>
          <div class="empty-title">Nenhuma receita fixa cadastrada</div>
          <p>Cadastre salários, mensalidades de clientes e outros recebimentos recorrentes.</p>
        </div>
      ` : `
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>DESCRIÇÃO</th>
                <th>CATEGORIA</th>
                <th>VENCIMENTO BASE</th>
                <th style="text-align:right">VALOR</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${fixed.map(r => {
                const increase = increaseByReceivable.get(r.id);
                return `
                <tr>
                  <td>
                    <div class="desc-main">${esc(r.description)}</div>
                    <div class="desc-sub">${paymentLabel(r)} · ${INTERVAL_LABELS[r.recurrence_interval] ?? 'Mensal'}</div>
                    ${increase ? `<div class="desc-sub" style="color:var(--warning)"><i class="ti ti-trending-up"></i> Subiu de ${formatCurrency(increase.previous_amount)} para ${formatCurrency(increase.new_amount)}</div>` : ''}
                  </td>
                  <td>${r.category_name ? `<span class="badge" style="background:${alpha(r.category_color!,0.12)};color:${r.category_color}">${esc(r.category_name)}</span>` : '<span style="color:var(--text-3)">—</span>'}</td>
                  <td style="color:var(--text-2)">${formatDate(r.due_date)}</td>
                  <td style="text-align:right;font-weight:600;color:var(--accent)">${formatCurrency(r.amount)}</td>
                  <td>
                    <div style="display:flex;gap:6px;justify-content:flex-end">
                      <button class="btn btn-ghost btn-sm" data-edit-fixed="${r.id}">Editar</button>
                      <button class="btn btn-danger btn-sm" data-del-fixed="${r.id}">✕</button>
                    </div>
                  </td>
                </tr>
              `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    `;

    el.querySelectorAll<HTMLElement>('[data-edit-fixed]').forEach(btn => {
      btn.addEventListener('click', () => {
        const receivable = fixed.find(r => r.id === btn.dataset.editFixed);
        if (receivable) openFixedModal(receivable, renderPage);
      });
    });
    el.querySelectorAll<HTMLElement>('[data-del-fixed]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!await showConfirm('Remover esta receita fixa?', { danger: true, okLabel: 'Remover' })) return;
        await invoke('receivables:delete', btn.dataset.delFixed);
        renderPage();
      });
    });
    el.querySelectorAll<HTMLElement>('[data-track-detection]').forEach(btn => {
      btn.addEventListener('click', () => {
        const detection = detections.find(d => d.key === btn.dataset.trackDetection);
        if (detection) openFixedModal(detectionToPrefill(detection), renderPage);
      });
    });
    el.querySelectorAll<HTMLElement>('[data-dismiss-detection]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await invoke('recurrenceDetection:dismiss', btn.dataset.dismissDetection);
        renderPage();
      });
    });
  }

  document.getElementById('btn-new-fixed')?.addEventListener('click', () => openFixedModal(null, renderPage));
  await renderPage();
}

function openFixedModal(receivable: Partial<ReceivableWithCategory> | null, onDone: () => void): void {
  const today = new Date().toISOString().slice(0, 10);
  const overlay = openModal({
    title: receivable?.id ? 'Editar receita fixa' : 'Nova receita fixa',
    body: `
      <div class="form-group">
        <label class="form-label">Descrição</label>
        <input class="form-ctrl" id="f-desc" value="${esc(receivable?.description)}" placeholder="Ex: Salário, mensalidade de cliente">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Valor (R$)</label>
          <input class="form-ctrl" id="f-amount" type="text" inputmode="decimal" placeholder="0,00" value="${formatMoneyValue(receivable?.amount)}">
        </div>
        <div class="form-group">
          <label class="form-label">Vencimento base</label>
          <input class="form-ctrl" id="f-due" type="date" value="${receivable?.due_date ?? today}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Conta</label>
          <select class="form-ctrl" id="f-account">
            <option value="">— Sem conta —</option>
            ${accounts.filter(a => a.type !== 'credit_card' || a.id === receivable?.account_id).map(a => `<option value="${a.id}" ${receivable?.account_id === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
          </select>
          <label id="f-account-pix-label" style="display:${isPixEligibleAccountType(accounts.find(a => a.id === receivable?.account_id)?.type ?? '') ? 'flex' : 'none'};align-items:center;gap:4px;font-size:11px;color:var(--text-2);margin-top:6px" title="Recebido via Pix">
            <input type="checkbox" id="f-account-pix" ${receivable?.payments?.[0]?.is_pix ? 'checked' : ''}> Pix
          </label>
        </div>
        <div class="form-group">
          <label class="form-label">Categoria</label>
          <select class="form-ctrl" id="f-category">
            ${categoryOptions(categories, receivable?.category_id, { emptyLabel: '— Sem categoria —' })}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Intervalo de renovação</label>
        <select class="form-ctrl" id="f-interval">
          ${(Object.keys(INTERVAL_LABELS) as ReceivableInterval[]).map(k =>
            `<option value="${k}" ${(receivable?.recurrence_interval ?? 'monthly') === k ? 'selected' : ''}>${INTERVAL_LABELS[k]}</option>`
          ).join('')}
        </select>
      </div>
    `,
    onSave: async () => {
      const description = (document.getElementById('f-desc') as HTMLInputElement).value.trim();
      const amount = moneyInputValue(document.getElementById('f-amount') as HTMLInputElement);
      const due = (document.getElementById('f-due') as HTMLInputElement).value;
      const accountId = (document.getElementById('f-account') as HTMLSelectElement).value;
      const categoryId = (document.getElementById('f-category') as HTMLSelectElement).value;
      const interval = (document.getElementById('f-interval') as HTMLSelectElement).value as ReceivableInterval;

      if (!description || !Number.isFinite(amount) || amount <= 0 || !due) {
        showAlert('Preencha descrição, valor e vencimento.');
        return false;
      }

      const isPix = isPixEligibleAccountType(accounts.find(a => a.id === accountId)?.type ?? '')
        && (document.getElementById('f-account-pix') as HTMLInputElement).checked;

      const payload = {
        description,
        amount,
        due_date: due,
        status: 'pending',
        account_id: accountId || null,
        category_id: categoryId || null,
        recurring: 1 as const,
        recurrence_interval: interval,
        payments: accountId ? [{ account_id: accountId, amount, is_pix: (isPix ? 1 : 0) as 0 | 1 }] : [],
      };

      if (receivable?.id) await invoke('receivables:update', { id: receivable.id, ...payload });
      else await invoke('receivables:create', payload);
      onDone();
    },
  });
  attachMoneyMask(overlay.querySelector('#f-amount'));
  overlay.querySelector<HTMLSelectElement>('#f-account')?.addEventListener('change', event => {
    const accountId = (event.target as HTMLSelectElement).value;
    const pixEligible = isPixEligibleAccountType(accounts.find(a => a.id === accountId)?.type ?? '');
    const label = overlay.querySelector<HTMLElement>('#f-account-pix-label')!;
    const checkbox = overlay.querySelector<HTMLInputElement>('#f-account-pix')!;
    label.style.display = pixEligible ? 'flex' : 'none';
    if (!pixEligible) checkbox.checked = false;
  });
}

function detectionToPrefill(d: DetectedRecurrence): Partial<ReceivableWithCategory> {
  return {
    description: d.description,
    amount: d.avgAmount,
    due_date: new Date().toISOString().slice(0, 10),
    recurrence_interval: d.interval,
  };
}

function detectionCard(d: DetectedRecurrence): string {
  return `
    <div style="display:flex;align-items:center;gap:14px;padding:10px 0;border-bottom:0.5px solid var(--border)">
      <div style="flex:1">
        <div style="font-weight:600">
          ${esc(d.description)}
          ${d.likelyForgotten ? '<span class="badge" style="color:var(--warning);background:rgba(234,179,8,0.12);margin-left:6px">Possivelmente esquecida</span>' : ''}
        </div>
        <div style="font-size:0.78rem;color:var(--text-3)">
          ${d.occurrences}x nos últimos 12 meses · ${INTERVAL_LABELS[d.interval]} · última em ${formatDate(d.lastDate)}
        </div>
      </div>
      <div style="font-weight:600;color:var(--accent)">${formatCurrency(d.avgAmount)}</div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-secondary btn-sm" data-track-detection="${d.key}">Cadastrar como fixa</button>
        <button class="btn btn-ghost btn-sm" data-dismiss-detection="${d.key}">Descartar</button>
      </div>
    </div>
  `;
}

function paymentLabel(receivable: ReceivableWithCategory): string {
  if (receivable.payments?.length) return receivable.payments.map(p => p.account_name).join(' + ');
  const account = accounts.find(a => a.id === receivable.account_id);
  return account?.name ?? 'Sem conta definida';
}

function alpha(hex: string, a: number): string {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

function esc(s?: string | null): string {
  return (s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
