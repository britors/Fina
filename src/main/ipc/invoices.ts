import { ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { getDb } from '../database';
import { ensureCurrentInvoice } from '../invoices';
import type { CreditCardInvoice, CreditCardInvoiceCardState, CreditCardInvoiceStatus, CreditCardInvoiceWithAccount } from '../../shared/types';

function getInvoice(id: string): CreditCardInvoice | null {
  return (getDb().prepare('SELECT * FROM credit_card_invoices WHERE id = ?').get(id) as CreditCardInvoice | undefined) ?? null;
}

function creditCardAccountsWithCycle(): { id: string; name: string; bank_name: string | null }[] {
  return getDb().prepare(
    `SELECT id, name, bank_name FROM accounts WHERE type = 'credit_card' AND closing_day IS NOT NULL AND due_day IS NOT NULL`
  ).all() as { id: string; name: string; bank_name: string | null }[];
}

// Fatura fechada mais antiga ainda não paga, se houver — é ela que o botão
// "Pagar fatura" do card do cartão vai liquidar.
function oldestClosedInvoice(accountId: string): CreditCardInvoice | null {
  return (getDb().prepare(
    `SELECT * FROM credit_card_invoices WHERE account_id = ? AND status = 'closed' ORDER BY closing_date ASC LIMIT 1`
  ).get(accountId) as CreditCardInvoice | undefined) ?? null;
}

function getCardState(accountId: string): CreditCardInvoiceCardState | null {
  const open = ensureCurrentInvoice(accountId);
  if (!open) return null;
  return { open, closed: oldestClosedInvoice(accountId) };
}

export function registerInvoiceHandlers(): void {
  ipcMain.handle('invoices:listForAccount', (_e, accountId: string) =>
    getDb().prepare('SELECT * FROM credit_card_invoices WHERE account_id = ? ORDER BY closing_date DESC').all(accountId) as CreditCardInvoice[]
  );

  ipcMain.handle('invoices:getCardState', (_e, accountId: string) => getCardState(accountId));

  // Estado de todos os cartões com fatura ativada, em uma única chamada —
  // evita N+1 round-trips ao renderizar a lista de contas.
  ipcMain.handle('invoices:getCardStates', () => {
    const result: Record<string, CreditCardInvoiceCardState> = {};
    for (const account of creditCardAccountsWithCycle()) {
      const state = getCardState(account.id);
      if (state) result[account.id] = state;
    }
    return result;
  });

  ipcMain.handle('invoices:close', (_e, invoiceId: string) => {
    getDb().prepare(`UPDATE credit_card_invoices SET status='closed', updated_at=datetime('now') WHERE id=? AND status='open'`).run(invoiceId);
    return getInvoice(invoiceId);
  });

  // Chamado depois que o lançamento de transferência do pagamento já foi
  // criado com sucesso pelo fluxo existente (openPayInvoiceModal) — este
  // handler só fecha o ciclo da fatura, não mexe em saldo/transação.
  ipcMain.handle('invoices:markPaid', (_e, invoiceId: string) => {
    getDb().prepare(`UPDATE credit_card_invoices SET status='paid', updated_at=datetime('now') WHERE id=?`).run(invoiceId);
    return getInvoice(invoiceId);
  });

  ipcMain.handle('invoices:create', (_e, data: { account_id: string; amount: number; closing_date: string; due_date: string; status?: CreditCardInvoiceStatus }) => {
    if (!Number.isFinite(data.amount) || data.amount < 0) throw new Error('Informe um valor válido para a fatura.');
    if (!data.closing_date || !data.due_date) throw new Error('Informe as datas de fechamento e vencimento.');
    const id = randomUUID();
    try {
      getDb().prepare(
        'INSERT INTO credit_card_invoices (id, account_id, amount, closing_date, due_date, status) VALUES (?,?,?,?,?,?)'
      ).run(id, data.account_id, data.amount, data.closing_date, data.due_date, data.status ?? 'open');
    } catch {
      throw new Error('Já existe uma fatura com essa data de fechamento para este cartão.');
    }
    return getInvoice(id);
  });

  ipcMain.handle('invoices:update', (_e, data: { id: string; amount: number; closing_date: string; due_date: string; status: CreditCardInvoiceStatus }) => {
    if (!Number.isFinite(data.amount) || data.amount < 0) throw new Error('Informe um valor válido para a fatura.');
    if (!data.closing_date || !data.due_date) throw new Error('Informe as datas de fechamento e vencimento.');
    try {
      getDb().prepare(
        `UPDATE credit_card_invoices SET amount=?, closing_date=?, due_date=?, status=?, updated_at=datetime('now') WHERE id=?`
      ).run(data.amount, data.closing_date, data.due_date, data.status, data.id);
    } catch {
      throw new Error('Já existe uma fatura com essa data de fechamento para este cartão.');
    }
    return getInvoice(data.id);
  });

  ipcMain.handle('invoices:delete', (_e, id: string) => {
    const linked = getDb().prepare('SELECT COUNT(*) as n FROM transaction_payments WHERE invoice_id = ?').get(id) as { n: number };
    if (linked.n > 0) {
      throw new Error('Esta fatura tem lançamentos vinculados. Edite ou exclua os lançamentos antes de remover a fatura.');
    }
    getDb().prepare('DELETE FROM credit_card_invoices WHERE id = ?').run(id);
  });

  // Fatura não-paga (aberta ou fechada) mais próxima de cada cartão com
  // fatura ativada — alimenta a seção somente-leitura em Contas a Pagar.
  ipcMain.handle('invoices:listUpcoming', () => {
    const rows: CreditCardInvoiceWithAccount[] = [];
    for (const account of creditCardAccountsWithCycle()) {
      ensureCurrentInvoice(account.id);
      const invoice = getDb().prepare(
        `SELECT * FROM credit_card_invoices WHERE account_id = ? AND status IN ('open','closed') ORDER BY closing_date ASC LIMIT 1`
      ).get(account.id) as CreditCardInvoice | undefined;
      if (invoice) {
        rows.push({ ...invoice, account_name: account.bank_name ? `${account.name} (${account.bank_name})` : account.name });
      }
    }
    return rows.sort((a, b) => a.due_date.localeCompare(b.due_date));
  });
}
