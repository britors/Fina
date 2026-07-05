import { invoke } from '../api';
import { formatCurrency, formatDate } from '../../shared/utils';
import { openModal } from '../components/modal';
import { showAlert, showConfirm } from '../components/alertDialog';
import { setTopbarActions } from '../components/topbar';
import type { Account, BillInterval, BillPriceIncrease, BillWithCategory, Category, DetectedRecurrence } from '../../shared/types';

const INTERVAL_LABELS: Record<BillInterval, string> = {
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
    invoke<Category[]>('categories:list', 'expense'),
  ]);

  setTopbarActions(`
    <button class="btn btn-primary" id="btn-new-fixed"><i class="ti ti-plus"></i> Nova fixa</button>
  `);

  async function renderPage(): Promise<void> {
    const [all, priceIncreases, detections] = await Promise.all([
      invoke<BillWithCategory[]>('bills:list', {}),
      invoke<BillPriceIncrease[]>('bills:getPriceIncreases'),
      invoke<DetectedRecurrence[]>('recurrenceDetection:list'),
    ]);
    const fixed = all.filter(b => b.recurring);
    const increaseByBill = new Map(priceIncreases.map(i => [i.bill_id, i]));
    const monthlyTotal = fixed.reduce((sum, b) => sum + b.amount, 0);
    const nextDue = [...fixed].sort((a, b) => a.due_date.localeCompare(b.due_date))[0];

    el.innerHTML = `
      <div class="grid-3" style="margin-bottom:20px">
        <div class="stat-card">
          <div class="stat-label">Fixas ativas</div>
          <div class="stat-value">${fixed.length}</div>
          <div class="stat-sub">assinaturas e recorrências</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Compromisso mensal</div>
          <div class="stat-value stat-red">${formatCurrency(monthlyTotal)}</div>
          <div class="stat-sub">baseado nas recorrências ativas</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Próximo vencimento</div>
          <div class="stat-value" style="font-size:1.15rem">${nextDue ? formatDate(nextDue.due_date) : '—'}</div>
          <div class="stat-sub">${nextDue ? esc(nextDue.description) : 'nenhuma despesa fixa'}</div>
        </div>
      </div>

      ${detections.length > 0 ? `
        <div class="card" style="margin-bottom:20px">
          <div class="card-header">Recorrências detectadas automaticamente</div>
          <div class="card-hr"></div>
          <div class="card-body">
            <p style="font-size:0.8rem;color:var(--text-3);margin-bottom:12px">
              Cobranças repetidas identificadas no histórico de transações, ainda não cadastradas como fixas. Revise e confirme cada uma.
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
          <div class="empty-title">Nenhuma despesa fixa cadastrada</div>
          <p>Cadastre assinaturas, mensalidades e compromissos recorrentes.</p>
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
              ${fixed.map(b => {
                const increase = increaseByBill.get(b.id);
                return `
                <tr>
                  <td>
                    <div class="desc-main">${esc(b.description)}</div>
                    <div class="desc-sub">${paymentLabel(b)} · ${INTERVAL_LABELS[b.recurrence_interval] ?? 'Mensal'}</div>
                    ${increase ? `<div class="desc-sub" style="color:var(--warning)"><i class="ti ti-trending-up"></i> Subiu de ${formatCurrency(increase.previous_amount)} para ${formatCurrency(increase.new_amount)}</div>` : ''}
                  </td>
                  <td>${b.category_name ? `<span class="badge" style="background:${alpha(b.category_color!,0.12)};color:${b.category_color}">${esc(b.category_name)}</span>` : '<span style="color:var(--text-3)">—</span>'}</td>
                  <td style="color:var(--text-2)">${formatDate(b.due_date)}</td>
                  <td style="text-align:right;font-weight:600;color:var(--danger)">${formatCurrency(b.amount)}</td>
                  <td>
                    <div style="display:flex;gap:6px;justify-content:flex-end">
                      <button class="btn btn-ghost btn-sm" data-edit-fixed="${b.id}">Editar</button>
                      <button class="btn btn-danger btn-sm" data-del-fixed="${b.id}">✕</button>
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
        const bill = fixed.find(b => b.id === btn.dataset.editFixed);
        if (bill) openFixedModal(bill, renderPage);
      });
    });
    el.querySelectorAll<HTMLElement>('[data-del-fixed]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!await showConfirm('Remover esta despesa fixa?', { danger: true, okLabel: 'Remover' })) return;
        await invoke('bills:delete', btn.dataset.delFixed);
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

function openFixedModal(bill: Partial<BillWithCategory> | null, onDone: () => void): void {
  const today = new Date().toISOString().slice(0, 10);
  openModal({
    title: bill?.id ? 'Editar despesa fixa' : 'Nova despesa fixa',
    body: `
      <div class="form-group">
        <label class="form-label">Descrição</label>
        <input class="form-ctrl" id="f-desc" value="${esc(bill?.description)}" placeholder="Ex: Netflix, condomínio, academia">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Valor (R$)</label>
          <input class="form-ctrl" id="f-amount" type="number" min="0" step="0.01" value="${bill?.amount ?? ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Vencimento base</label>
          <input class="form-ctrl" id="f-due" type="date" value="${bill?.due_date ?? today}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Meio de pagamento</label>
          <select class="form-ctrl" id="f-account">
            <option value="">— Sem meio —</option>
            ${accounts.map(a => `<option value="${a.id}" ${bill?.account_id === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Categoria</label>
          <select class="form-ctrl" id="f-category">
            <option value="">— Sem categoria —</option>
            ${categories.map(c => `<option value="${c.id}" ${bill?.category_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Intervalo de renovação</label>
        <select class="form-ctrl" id="f-interval">
          ${(Object.keys(INTERVAL_LABELS) as BillInterval[]).map(k =>
            `<option value="${k}" ${(bill?.recurrence_interval ?? 'monthly') === k ? 'selected' : ''}>${INTERVAL_LABELS[k]}</option>`
          ).join('')}
        </select>
      </div>
    `,
    onSave: async () => {
      const description = (document.getElementById('f-desc') as HTMLInputElement).value.trim();
      const amount = parseFloat((document.getElementById('f-amount') as HTMLInputElement).value);
      const due = (document.getElementById('f-due') as HTMLInputElement).value;
      const accountId = (document.getElementById('f-account') as HTMLSelectElement).value;
      const categoryId = (document.getElementById('f-category') as HTMLSelectElement).value;
      const interval = (document.getElementById('f-interval') as HTMLSelectElement).value as BillInterval;

      if (!description || !Number.isFinite(amount) || amount <= 0 || !due) {
        showAlert('Preencha descrição, valor e vencimento.');
        return false;
      }

      const payload = {
        description,
        amount,
        due_date: due,
        status: 'pending',
        account_id: accountId || null,
        category_id: categoryId || null,
        recurring: 1 as const,
        recurrence_interval: interval,
        payments: accountId ? [{ account_id: accountId, amount }] : [],
      };

      if (bill?.id) await invoke('bills:update', { id: bill.id, ...payload });
      else await invoke('bills:create', payload);
      onDone();
    },
  });
}

function detectionToPrefill(d: DetectedRecurrence): Partial<BillWithCategory> {
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
      <div style="font-weight:600;color:var(--danger)">${formatCurrency(d.avgAmount)}</div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-secondary btn-sm" data-track-detection="${d.key}">Cadastrar como fixa</button>
        <button class="btn btn-ghost btn-sm" data-dismiss-detection="${d.key}">Descartar</button>
      </div>
    </div>
  `;
}

function paymentLabel(bill: BillWithCategory): string {
  if (bill.payments?.length) return bill.payments.map(p => p.account_name).join(' + ');
  const account = accounts.find(a => a.id === bill.account_id);
  return account?.name ?? 'Sem meio definido';
}

function alpha(hex: string, a: number): string {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

function esc(s?: string | null): string {
  return (s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
