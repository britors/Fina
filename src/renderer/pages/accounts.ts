import { invoke } from '../api';
import { formatCurrency, accountTypeLabel, isCreditLikeAccountType } from '../../shared/utils';
import { openModal } from '../components/modal';
import { setTopbarActions } from '../components/topbar';
import type { Account, AccountType } from '../../shared/types';

export async function render(el: HTMLElement): Promise<void> {
  setTopbarActions(`
    <button class="btn btn-primary" id="btn-new-acc"><i class="ti ti-plus"></i> Novo meio</button>
  `);

  async function renderPage(): Promise<void> {
    const accounts = await invoke<Account[]>('accounts:list');
    const inAcc    = accounts.filter(a => !isCreditLikeAccountType(a.type)).reduce((s, a) => s + a.balance, 0);
    const debt     = accounts.filter(a => isCreditLikeAccountType(a.type)).reduce((s, a) => s + a.balance, 0);
    const total    = inAcc - debt;

    el.innerHTML = `
      <!-- Total banner -->
      <div class="card" style="margin-bottom:20px">
        <div class="card-body" style="display:flex;align-items:center;justify-content:space-between;padding:20px 24px">
          <div>
            <div style="font-size:11px;color:var(--text-3);margin-bottom:4px">Patrimônio líquido</div>
            <div style="font-size:28px;font-weight:600">${formatCurrency(total)}</div>
            <div style="font-size:11px;color:var(--text-4);margin-top:4px">Atualizado agora · ${accounts.length} meio${accounts.length !== 1 ? 's' : ''}</div>
          </div>
          <div style="display:flex;gap:40px">
            <div>
              <div style="font-size:11px;color:var(--text-3);margin-bottom:4px">Disponível</div>
              <div style="font-size:18px;font-weight:600;color:var(--accent)">${formatCurrency(inAcc)}</div>
            </div>
            <div>
              <div style="font-size:11px;color:var(--text-3);margin-bottom:4px">Em débito</div>
              <div style="font-size:18px;font-weight:600;color:var(--danger)">${formatDebt(debt)}</div>
            </div>
          </div>
        </div>
      </div>

      ${accounts.length === 0
        ? `<div class="empty"><i class="ti ti-building-bank"></i>
            <div class="empty-title">Nenhum meio de pagamento cadastrado</div>
            <p>Clique em "Novo meio" para começar.</p></div>`
        : `<div class="grid-2">
            ${accounts.map(a => accountCard(a)).join('')}
          </div>`
      }
    `;

    el.querySelectorAll<HTMLElement>('[data-edit-acc]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.editAcc!;
        const acc = accounts.find(a => a.id === id);
        if (acc) openAccModal(acc, renderPage);
      });
    });
    el.querySelectorAll<HTMLElement>('[data-del-acc]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Excluir este meio de pagamento? Todas as transações vinculadas serão removidas.')) return;
        await invoke('accounts:delete', btn.dataset.delAcc);
        renderPage();
      });
    });
  }

  document.getElementById('btn-new-acc')?.addEventListener('click', () => openAccModal(null, renderPage));
  await renderPage();
}

function accountCard(a: Account): string {
  const typeColors: Record<string, string> = {
    checking: '#8B5CF6', savings: '#1D9E75', credit_card: '#7F77DD', meal_voucher: '#D85A30', food_voucher: '#10B981', wallet: '#EF9F27',
  };
  const color = a.color ?? typeColors[a.type] ?? '#9CA3AF';
  const isCredit = isCreditLikeAccountType(a.type);
  // Crédito/vales são dívida positiva; conta corrente/poupança/carteira usam
  // saldo negativo para representar uso do limite (cheque especial).
  const usedLimit = isCredit ? a.balance : Math.max(0, -a.balance);
  const isNegative = isCredit ? a.balance > 0 : a.balance < 0;

  return `
    <div class="account-card">
      <div class="account-card-head">
        <div>
          <div class="account-bank">${esc(a.bank_name ?? '—')}</div>
          <div style="display:inline-flex;align-items:center;padding:3px 9px;border-radius:10px;background:${color}22;color:${color};font-size:10px;font-weight:500">
            ${accountTypeLabel(a.type)}
          </div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost btn-sm" data-edit-acc="${a.id}">Editar</button>
          <button class="btn btn-danger btn-sm" data-del-acc="${a.id}">✕</button>
        </div>
      </div>
      <div class="account-name">${esc(a.name)}</div>
      <div class="account-bal-label">${isCredit ? 'Fatura atual' : 'Saldo disponível'}</div>
      <div class="account-balance" style="color:${isNegative ? 'var(--danger)' : 'var(--text)'}">
        ${isCredit ? formatDebt(a.balance) : formatCurrency(a.balance)}
      </div>
      ${a.credit_limit ? `
        <div class="prog-track" style="margin-top:10px">
          <div class="prog-fill ${usedLimit / a.credit_limit > 0.8 ? 'prog-over' : 'prog-ok'}"
            style="width:${Math.min((usedLimit / a.credit_limit) * 100, 100).toFixed(1)}%"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-3);margin-top:4px">
          <span>Limite: ${formatCurrency(a.credit_limit)}</span>
          <span>Disponível: ${formatCurrency(a.credit_limit - usedLimit)}</span>
        </div>
      ` : ''}
      <div class="account-hr"></div>
      <div style="font-size:11px;color:var(--text-3);padding:0 2px">
        Meio criado em ${new Date(a.created_at).toLocaleDateString('pt-BR')}
      </div>
    </div>
  `;
}

function openAccModal(acc: Account | null, onDone: () => void): void {
  openModal({
    title: acc ? 'Editar meio de pagamento' : 'Novo meio de pagamento',
    body: `
      <div class="form-group">
        <label class="form-label">Nome do meio de pagamento</label>
        <input class="form-ctrl" id="f-name" value="${esc(acc?.name)}" placeholder="Ex: Conta corrente">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Tipo</label>
          <select class="form-ctrl" id="f-type">
            ${(['checking','savings','credit_card','meal_voucher','food_voucher','wallet'] as AccountType[]).map(t =>
              `<option value="${t}" ${acc?.type === t ? 'selected' : ''}>${accountTypeLabel(t)}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Banco</label>
          <input class="form-ctrl" id="f-bank" value="${esc(acc?.bank_name ?? '')}" placeholder="Ex: Nubank">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Saldo (R$)</label>
          <input class="form-ctrl" id="f-balance" type="number" step="0.01" value="${acc?.balance ?? 0}">
        </div>
        <div class="form-group">
          <label class="form-label">Limite de crédito (R$)</label>
          <input class="form-ctrl" id="f-limit" type="number" step="0.01" value="${acc?.credit_limit ?? ''}">
        </div>
      </div>
    `,
    onSave: async () => {
      const name    = (document.getElementById('f-name')    as HTMLInputElement).value.trim();
      const type    = (document.getElementById('f-type')    as HTMLSelectElement).value as AccountType;
      const bank    = (document.getElementById('f-bank')    as HTMLInputElement).value.trim();
      const balance = parseFloat((document.getElementById('f-balance') as HTMLInputElement).value);
      const limit   = parseFloat((document.getElementById('f-limit')   as HTMLInputElement).value);

      if (!name) { alert('Informe o nome do meio de pagamento.'); return false; }

      const payload = { name, type, bank_name: bank || null, balance: isNaN(balance) ? 0 : balance, credit_limit: isNaN(limit) ? null : limit, color: acc?.color ?? null };
      if (acc) { await invoke('accounts:update', { id: acc.id, ...payload }); }
      else     { await invoke('accounts:create', payload); }
      onDone();
    },
  });
}

function esc(s?: string | null): string {
  return (s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function formatDebt(amount: number): string {
  if (Math.abs(amount) < 0.005) return formatCurrency(0);
  return amount > 0 ? `-${formatCurrency(amount)}` : formatCurrency(Math.abs(amount));
}
