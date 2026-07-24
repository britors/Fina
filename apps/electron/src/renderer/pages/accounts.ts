import { invoke } from '../api';
import { formatCurrency, formatDate, accountTypeLabel, isCreditLikeAccountType } from '../../shared/utils';
import { openModal } from '../components/modal';
import { attachMoneyMask, formatMoneyValue, moneyInputValue } from '../components/moneyMask';
import { showAlert, showConfirm } from '../components/alertDialog';
import { setTopbarActions } from '../components/topbar';
import { openPayInvoiceModal } from './transactions';
import type { Account, AccountCurrency, AccountType, CreditCardInvoice, CreditCardInvoiceCardState, CreditCardInvoiceStatus } from '../../shared/types';

const CURRENCY_LABELS: Record<AccountCurrency, string> = { BRL: 'Real (R$)', USD: 'Dólar (US$)', EUR: 'Euro (€)' };
const CURRENCY_SYMBOLS: Record<AccountCurrency, string> = { BRL: 'R$', USD: 'US$', EUR: '€' };

export async function render(el: HTMLElement): Promise<void> {
  setTopbarActions(`
    <button class="btn btn-ghost" id="btn-refresh-rates"><i class="ti ti-refresh"></i> Atualizar cotações</button>
    <button class="btn btn-primary" id="btn-new-acc"><i class="ti ti-plus"></i> Nova conta ou cartão</button>
  `);

  async function renderPage(): Promise<void> {
    const accounts = await invoke<Account[]>('accounts:list');
    const cardStates = await invoke<Record<string, CreditCardInvoiceCardState>>('invoices:getCardStates');
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
            <div style="font-size:11px;color:var(--text-4);margin-top:4px">Atualizado agora · ${accounts.length} conta${accounts.length !== 1 ? 's' : ''}</div>
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
            <div class="empty-title">Nenhuma conta ou cartão cadastrado</div>
            <p>Clique em "Nova conta ou cartão" para começar.</p></div>`
        : `<div class="grid-2">
            ${accounts.map(a => accountCard(a, cardStates[a.id])).join('')}
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
        if (!await showConfirm('Excluir esta conta? Todas as transações vinculadas serão removidas.', { danger: true, okLabel: 'Excluir' })) return;
        await invoke('accounts:delete', btn.dataset.delAcc);
        renderPage();
      });
    });
    el.querySelectorAll<HTMLElement>('[data-pay-invoice]').forEach(btn => {
      btn.addEventListener('click', () => {
        const state = cardStates[btn.dataset.payInvoice!];
        openPayInvoiceModal(btn.dataset.payInvoice!, renderPage, state?.closed ?? undefined);
      });
    });
    el.querySelectorAll<HTMLElement>('[data-close-invoice]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await invoke('invoices:close', btn.dataset.closeInvoice);
        renderPage();
      });
    });
    el.querySelectorAll<HTMLElement>('[data-list-invoices]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.listInvoices!;
        const acc = accounts.find(a => a.id === id);
        if (acc) openInvoiceListModal(acc, renderPage);
      });
    });
  }

  document.getElementById('btn-new-acc')?.addEventListener('click', () => openAccModal(null, renderPage));
  document.getElementById('btn-refresh-rates')?.addEventListener('click', async () => {
    await invoke('accounts:refreshExchangeRates');
    await renderPage();
    showAlert('Cotações atualizadas.');
  });
  await renderPage();
}

function accountCard(a: Account, cardState?: CreditCardInvoiceCardState): string {
  const typeColors: Record<string, string> = {
    checking: '#8B5CF6', savings: '#1D9E75', credit_card: '#7F77DD', meal_voucher: '#D85A30', food_voucher: '#10B981', wallet: '#EF9F27',
  };
  const color = a.color ?? typeColors[a.type] ?? '#9CA3AF';
  const isCreditCard = a.type === 'credit_card';
  const isVoucher = a.type === 'meal_voucher' || a.type === 'food_voucher';
  const isCredit = isCreditLikeAccountType(a.type);
  // Crédito/vales são dívida positiva; conta corrente/poupança/carteira usam
  // saldo negativo para representar uso do limite (cheque especial).
  const usedLimit = isCredit ? a.balance : Math.max(0, -a.balance);
  const availableToSpend = a.credit_limit != null ? a.credit_limit - usedLimit : -usedLimit;
  const balanceLabel = isVoucher ? 'Disponível para gastar' : isCreditCard ? 'Fatura atual' : 'Saldo disponível';
  const balanceValue = isVoucher ? formatCurrency(availableToSpend) : isCredit ? formatDebt(a.balance) : formatCurrency(a.balance);
  const isNegative = isVoucher ? availableToSpend < 0 : isCredit ? a.balance > 0 : a.balance < 0;

  // Sem fatura ativada (closing_day/due_day não configurados) mantém o
  // atalho antigo, simples, de "Pagar fatura" — só cartões com o ciclo
  // configurado ganham o botão dinâmico Fechar/Pagar fatura e a lista.
  const invoiceButton = !isCreditCard ? '' : !cardState
    ? `<button class="btn btn-secondary btn-sm" data-pay-invoice="${a.id}">Pagar fatura</button>`
    : cardState.closed
      ? `<button class="btn btn-secondary btn-sm" data-pay-invoice="${a.id}">Pagar fatura</button>`
      : `<button class="btn btn-secondary btn-sm" data-close-invoice="${cardState.open.id}">Fechar fatura</button>`;
  const listInvoicesButton = isCreditCard ? `<button class="btn btn-ghost btn-sm" data-list-invoices="${a.id}">Ver faturas</button>` : '';

  return `
    <div class="account-card">
      <div class="account-card-head">
        <div>
          <div class="account-bank">${esc(a.bank_name ?? '—')}</div>
          <div style="display:inline-flex;align-items:center;padding:3px 9px;border-radius:10px;background:${color}22;color:${color};font-size:10px;font-weight:500">
            ${accountTypeLabel(a.type)}
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
          ${invoiceButton}
          ${listInvoicesButton}
          <button class="btn btn-ghost btn-sm" data-edit-acc="${a.id}">Editar</button>
          <button class="btn btn-danger btn-sm" data-del-acc="${a.id}">✕</button>
        </div>
      </div>
      <div class="account-name">${esc(a.name)}</div>
      <div class="account-bal-label">${balanceLabel}${a.currency !== 'BRL' ? ` · convertido de ${CURRENCY_SYMBOLS[a.currency]}` : ''}</div>
      <div class="account-balance" style="color:${isNegative ? 'var(--danger)' : 'var(--text)'}">
        ${balanceValue}
      </div>
      ${a.currency !== 'BRL' && a.original_balance != null ? `
        <div style="font-size:12px;color:var(--text-3);margin-top:2px">${CURRENCY_SYMBOLS[a.currency]} ${a.original_balance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
      ` : ''}
      ${cardState ? `
        <div style="font-size:12px;color:var(--text-3);margin-top:6px">
          Fatura ${cardState.closed ? 'fechada' : 'aberta'}: <strong style="color:var(--text-2)">${formatCurrency((cardState.closed ?? cardState.open).amount)}</strong>
          · ${cardState.closed ? 'vencimento' : 'fecha em'} ${formatDate(cardState.closed ? cardState.closed.due_date : cardState.open.closing_date)}
        </div>
      ` : ''}
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
        Conta criada em ${new Date(a.created_at).toLocaleDateString('pt-BR')}
      </div>
    </div>
  `;
}

function openAccModal(acc: Account | null, onDone: () => void): void {
  const currency = acc?.currency ?? 'BRL';
  const overlay = openModal({
    title: acc ? 'Editar conta' : 'Nova conta',
    body: `
      <div class="form-group">
        <label class="form-label">Nome da conta</label>
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
      <div class="form-group">
        <label class="form-label">Moeda da conta</label>
        <select class="form-ctrl" id="f-currency">
          ${(['BRL','USD','EUR'] as AccountCurrency[]).map(c =>
            `<option value="${c}" ${currency === c ? 'selected' : ''}>${CURRENCY_LABELS[c]}</option>`
          ).join('')}
        </select>
        <div class="form-hint" style="font-size:11px;color:var(--text-3);margin-top:4px">Contas em moeda estrangeira têm o saldo convertido automaticamente para R$ usando a cotação do painel de Mercado.</div>
      </div>
      <div class="form-row">
        <div class="form-group" id="f-balance-brl-group">
          <label class="form-label">Saldo (R$)</label>
          <input class="form-ctrl" id="f-balance" type="text" inputmode="decimal" value="${formatMoneyValue(acc?.balance ?? 0)}">
        </div>
        <div class="form-group" id="f-balance-foreign-group" style="display:none">
          <label class="form-label" id="f-balance-foreign-label">Saldo original</label>
          <input class="form-ctrl" id="f-original-balance" type="text" inputmode="decimal" value="${formatMoneyValue(acc?.original_balance)}">
        </div>
        <div class="form-group">
          <label class="form-label">Limite de crédito (R$)</label>
          <input class="form-ctrl" id="f-limit" type="text" inputmode="decimal" value="${formatMoneyValue(acc?.credit_limit)}">
        </div>
      </div>
      <div class="form-row" id="f-cycle-group" style="display:none">
        <div class="form-group">
          <label class="form-label">Dia de fechamento da fatura</label>
          <input class="form-ctrl" id="f-closing-day" type="number" min="1" max="31" step="1" value="${acc?.closing_day ?? ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Dia de vencimento da fatura</label>
          <input class="form-ctrl" id="f-due-day" type="number" min="1" max="31" step="1" value="${acc?.due_day ?? ''}">
        </div>
      </div>
      <div class="form-hint" id="f-cycle-hint" style="display:none;font-size:11px;color:var(--text-3);margin-top:-8px">
        Preenchendo os dois campos, o Fina passa a criar e anexar as faturas automaticamente a cada lançamento no cartão. Lançamentos anteriores a essa configuração não entram em nenhuma fatura.
      </div>
    `,
    onSave: async () => {
      const name       = (document.getElementById('f-name')     as HTMLInputElement).value.trim();
      const type       = (document.getElementById('f-type')     as HTMLSelectElement).value as AccountType;
      const bank       = (document.getElementById('f-bank')     as HTMLInputElement).value.trim();
      const curr       = (document.getElementById('f-currency') as HTMLSelectElement).value as AccountCurrency;
      const balance    = moneyInputValue(document.getElementById('f-balance') as HTMLInputElement);
      const original   = moneyInputValue(document.getElementById('f-original-balance') as HTMLInputElement);
      const limit      = moneyInputValue(document.getElementById('f-limit') as HTMLInputElement);
      const closingDay = parseInt((document.getElementById('f-closing-day') as HTMLInputElement).value, 10);
      const dueDay     = parseInt((document.getElementById('f-due-day') as HTMLInputElement).value, 10);

      if (!name) { showAlert('Informe o nome da conta.'); return false; }
      if (curr !== 'BRL' && isNaN(original)) { showAlert('Informe o saldo na moeda da conta.'); return false; }
      if (type === 'credit_card') {
        const hasClosing = !isNaN(closingDay);
        const hasDue = !isNaN(dueDay);
        if (hasClosing !== hasDue) { showAlert('Preencha os dois dias (fechamento e vencimento) ou deixe ambos em branco.'); return false; }
        if (hasClosing && (closingDay < 1 || closingDay > 31 || dueDay < 1 || dueDay > 31)) {
          showAlert('Os dias de fechamento e vencimento devem estar entre 1 e 31.'); return false;
        }
      }

      const payload = {
        name, type, bank_name: bank || null,
        currency: curr,
        balance: isNaN(balance) ? 0 : balance,
        original_balance: curr === 'BRL' ? null : original,
        credit_limit: isNaN(limit) ? null : limit,
        closing_day: type === 'credit_card' && !isNaN(closingDay) ? closingDay : null,
        due_day: type === 'credit_card' && !isNaN(dueDay) ? dueDay : null,
        color: acc?.color ?? null,
      };
      try {
        if (acc) { await invoke('accounts:update', { id: acc.id, ...payload }); }
        else     { await invoke('accounts:create', payload); }
      } catch (err) {
        showAlert(err instanceof Error ? err.message : 'Não foi possível salvar a conta.');
        return false;
      }
      onDone();
    },
  });

  function toggleCurrencyFields(): void {
    const curr = (overlay.querySelector('#f-currency') as HTMLSelectElement).value as AccountCurrency;
    const isForeign = curr !== 'BRL';
    (overlay.querySelector('#f-balance-brl-group') as HTMLElement).style.display = isForeign ? 'none' : '';
    (overlay.querySelector('#f-balance-foreign-group') as HTMLElement).style.display = isForeign ? '' : 'none';
    if (isForeign) {
      overlay.querySelector('#f-balance-foreign-label')!.textContent = `Saldo original (${CURRENCY_SYMBOLS[curr]})`;
    }
  }
  function toggleCreditCardFields(): void {
    const type = (overlay.querySelector('#f-type') as HTMLSelectElement).value as AccountType;
    const isCreditCard = type === 'credit_card';
    (overlay.querySelector('#f-cycle-group') as HTMLElement).style.display = isCreditCard ? '' : 'none';
    (overlay.querySelector('#f-cycle-hint') as HTMLElement).style.display = isCreditCard ? '' : 'none';
  }
  overlay.querySelector('#f-currency')?.addEventListener('change', toggleCurrencyFields);
  overlay.querySelector('#f-type')?.addEventListener('change', toggleCreditCardFields);
  toggleCurrencyFields();
  toggleCreditCardFields();
  attachMoneyMask(overlay.querySelector('#f-balance'));
  attachMoneyMask(overlay.querySelector('#f-original-balance'));
  attachMoneyMask(overlay.querySelector('#f-limit'));
}

function esc(s?: string | null): string {
  return (s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function formatDebt(amount: number): string {
  if (Math.abs(amount) < 0.005) return formatCurrency(0);
  return amount > 0 ? `-${formatCurrency(amount)}` : formatCurrency(Math.abs(amount));
}

const INVOICE_STATUS_LABELS: Record<CreditCardInvoiceStatus, string> = { open: 'Aberta', closed: 'Fechada', paid: 'Paga' };

async function openInvoiceListModal(account: Account, onDone: () => void): Promise<void> {
  const overlay = openModal({
    title: `Faturas — ${esc(account.name)}`,
    saveLabel: 'Fechar',
    body: `<div id="invoice-list-body">Carregando...</div>`,
    onSave: () => onDone(),
  });

  async function refresh(): Promise<void> {
    const invoices = await invoke<CreditCardInvoice[]>('invoices:listForAccount', account.id);
    const unpaidTotal = invoices.filter(inv => inv.status !== 'paid').reduce((s, inv) => s + inv.amount, 0);
    const mismatch = Math.abs(unpaidTotal - account.balance) > 0.005;

    const body = overlay.querySelector<HTMLElement>('#invoice-list-body');
    if (!body) return;
    body.innerHTML = `
      ${mismatch ? `
        <div style="background:rgba(230,160,40,0.12);border:1px solid #e6a028;border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:12px;color:var(--text-2)">
          <strong>Atenção:</strong> a soma das faturas em aberto/fechadas (${formatCurrency(unpaidTotal)}) não bate com a fatura atual do cartão (${formatCurrency(account.balance)}).
          Isso é esperado se houver lançamentos anteriores à ativação do rastreamento de faturas, ou se algum valor foi editado manualmente aqui.
        </div>
      ` : ''}
      <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
        <button class="btn btn-secondary btn-sm" id="btn-new-invoice"><i class="ti ti-plus"></i> Nova fatura</button>
      </div>
      ${invoices.length === 0
        ? `<div style="color:var(--text-3);font-size:13px">Nenhuma fatura registrada ainda.</div>`
        : `<div class="table-wrap">
            <table class="table">
              <thead>
                <tr><th>FECHAMENTO</th><th>VENCIMENTO</th><th style="text-align:right">VALOR</th><th>STATUS</th><th></th></tr>
              </thead>
              <tbody>
                ${invoices.map(inv => `
                  <tr>
                    <td>${formatDate(inv.closing_date)}</td>
                    <td>${formatDate(inv.due_date)}</td>
                    <td style="text-align:right;font-weight:500">${formatCurrency(inv.amount)}</td>
                    <td><span class="badge">${INVOICE_STATUS_LABELS[inv.status]}</span></td>
                    <td>
                      <div style="display:flex;gap:6px">
                        <button class="btn btn-ghost btn-sm" data-edit-invoice="${inv.id}">Editar</button>
                        <button class="btn btn-danger btn-sm" data-del-invoice="${inv.id}">✕</button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>`
      }
    `;

    body.querySelectorAll<HTMLElement>('[data-edit-invoice]').forEach(btn => {
      btn.addEventListener('click', () => {
        const inv = invoices.find(i => i.id === btn.dataset.editInvoice);
        if (inv) openInvoiceFormModal(account, inv, async () => { await refresh(); onDone(); });
      });
    });
    body.querySelectorAll<HTMLElement>('[data-del-invoice]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!await showConfirm('Excluir esta fatura?', { danger: true, okLabel: 'Excluir' })) return;
        try {
          await invoke('invoices:delete', btn.dataset.delInvoice);
          await refresh();
          onDone();
        } catch (err) {
          showAlert(err instanceof Error ? err.message : 'Não foi possível excluir a fatura.');
        }
      });
    });
    body.querySelector('#btn-new-invoice')?.addEventListener('click', () => {
      openInvoiceFormModal(account, null, async () => { await refresh(); onDone(); });
    });
  }

  await refresh();
}

function openInvoiceFormModal(account: Account, invoice: CreditCardInvoice | null, onSaved: () => void): void {
  const today = new Date().toISOString().split('T')[0];
  const overlay = openModal({
    title: invoice ? 'Editar fatura' : 'Nova fatura',
    body: `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Fechamento</label>
          <input class="form-ctrl" id="f-inv-closing" type="date" value="${invoice?.closing_date ?? today}">
        </div>
        <div class="form-group">
          <label class="form-label">Vencimento</label>
          <input class="form-ctrl" id="f-inv-due" type="date" value="${invoice?.due_date ?? today}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Valor (R$)</label>
          <input class="form-ctrl" id="f-inv-amount" type="text" inputmode="decimal" value="${formatMoneyValue(invoice?.amount ?? 0)}">
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select class="form-ctrl" id="f-inv-status">
            ${(['open', 'closed', 'paid'] as CreditCardInvoiceStatus[]).map(st =>
              `<option value="${st}" ${(invoice?.status ?? 'open') === st ? 'selected' : ''}>${INVOICE_STATUS_LABELS[st]}</option>`
            ).join('')}
          </select>
        </div>
      </div>
    `,
    onSave: async () => {
      const closing = (document.getElementById('f-inv-closing') as HTMLInputElement).value;
      const due     = (document.getElementById('f-inv-due')     as HTMLInputElement).value;
      const amount  = moneyInputValue(document.getElementById('f-inv-amount') as HTMLInputElement);
      const status  = (document.getElementById('f-inv-status')  as HTMLSelectElement).value as CreditCardInvoiceStatus;
      if (!closing || !due || isNaN(amount)) { showAlert('Preencha todos os campos.'); return false; }
      try {
        if (invoice) { await invoke('invoices:update', { id: invoice.id, amount, closing_date: closing, due_date: due, status }); }
        else         { await invoke('invoices:create', { account_id: account.id, amount, closing_date: closing, due_date: due, status }); }
      } catch (err) {
        showAlert(err instanceof Error ? err.message : 'Não foi possível salvar a fatura.');
        return false;
      }
      onSaved();
    },
  });
  attachMoneyMask(overlay.querySelector('#f-inv-amount'));
}
