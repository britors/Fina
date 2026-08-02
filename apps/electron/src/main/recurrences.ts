import { randomUUID } from 'node:crypto';
import { getDb } from './database';
import { addInterval, settleAutomaticBills } from './ipc/bills';
import { settleAutomaticReceivables } from './ipc/receivables';
import { applyBalanceEffect } from './ipc/transactions';
import type { BillInterval, ReceivableInterval } from '../shared/types';

interface RecurrenceResult {
  transactions: number;
  bills: number;
  receivables: number;
}

// Contas a pagar são geradas com essa antecedência em relação ao vencimento,
// para aparecerem na agenda/notificações antes do dia do pagamento.
const BILL_LEAD_DAYS = 30;

export function generateRecurrences(): RecurrenceResult {
  const db = getDb();
  const now   = new Date();
  const month = now.getMonth() + 1;
  const year  = now.getFullYear();

  const result: RecurrenceResult = { transactions: 0, bills: 0, receivables: 0 };

  // ── Transações recorrentes ────────────────────────────────────────────────
  const recurringTxs = db.prepare(`
    SELECT * FROM transactions WHERE recurring = 1
  `).all() as {
    id: string; account_id: string; category_id: string; description: string;
    to_account_id: string | null; amount: number; type: 'income' | 'expense' | 'transfer';
    date: string; status: 'confirmed' | 'pending'; notes: string | null; owner: string | null;
    is_mei_revenue: 0 | 1; paid_by_member_id: string | null;
  }[];

  const checkTxLog  = db.prepare(`SELECT 1 FROM recurring_log WHERE source_id=? AND source_type='transaction' AND generated_date=?`);
  const insertTxLog = db.prepare(`INSERT OR IGNORE INTO recurring_log (source_id, source_type, generated_date) VALUES (?,?,?)`);
  const insertTx    = db.prepare(`
    INSERT INTO transactions (id, account_id, to_account_id, category_id, description, amount, type, date, status,
      notes, recurring, owner, is_mei_revenue, paid_by_member_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const txPayments = db.prepare(`SELECT account_id, amount, is_pix FROM transaction_payments WHERE transaction_id=?`);
  const insertTxPayment = db.prepare(`INSERT INTO transaction_payments (id, transaction_id, account_id, amount, is_pix) VALUES (?,?,?,?,?)`);
  const txCategories = db.prepare(`SELECT category_id, amount FROM transaction_categories WHERE transaction_id=?`);
  const insertTxCategory = db.prepare(`INSERT INTO transaction_categories (id, transaction_id, category_id, amount) VALUES (?,?,?,?)`);
  const txMemberSplits = db.prepare(`SELECT member_id, share_amount FROM transaction_member_splits WHERE transaction_id=?`);
  const insertTxMemberSplit = db.prepare(`INSERT INTO transaction_member_splits (id, transaction_id, member_id, share_amount) VALUES (?,?,?,?)`);

  const newDate = `${year}-${String(month).padStart(2, '0')}-01`;

  for (const tx of recurringTxs) {
    if (checkTxLog.get(tx.id, newDate)) continue;
    // A ocorrência pode ter sido criada no primeiro dia do mês (ou o molde
    // pode ter sido cadastrado durante o mês). Nesse caso, não replique o
    // próprio lançamento no mesmo ciclo.
    if (tx.date.slice(0, 7) === newDate.slice(0, 7)) {
      insertTxLog.run(tx.id, 'transaction', newDate);
      continue;
    }

    const newId = randomUUID();
    insertTx.run(newId, tx.account_id, tx.to_account_id, tx.category_id, tx.description,
                 tx.amount, tx.type, newDate, tx.status, tx.notes, 0, tx.owner,
                 tx.is_mei_revenue, tx.paid_by_member_id);
    const payments = txPayments.all(tx.id) as { account_id: string; amount: number; is_pix: 0 | 1 }[];
    for (const payment of payments) {
      insertTxPayment.run(randomUUID(), newId, payment.account_id, payment.amount, payment.is_pix);
    }
    for (const category of txCategories.all(tx.id) as { category_id: string; amount: number }[]) {
      insertTxCategory.run(randomUUID(), newId, category.category_id, category.amount);
    }
    for (const split of txMemberSplits.all(tx.id) as { member_id: string; share_amount: number }[]) {
      insertTxMemberSplit.run(randomUUID(), newId, split.member_id, split.share_amount);
    }
    if (tx.status === 'confirmed') {
      applyBalanceEffect({
        id: newId,
        account_id: tx.account_id,
        to_account_id: tx.to_account_id,
        type: tx.type,
        amount: tx.amount,
        date: newDate,
        payments,
      }, 1);
    }
    insertTxLog.run(tx.id, 'transaction', newDate);
    result.transactions++;
  }

  // ── Contas recorrentes (assinaturas/fixas) ────────────────────────────────
  // due_date do molde (recurring=1) funciona como âncora do próximo ciclo: a
  // cada ocorrência gerada, avança pelo intervalo da assinatura (semanal,
  // mensal, trimestral, etc), respeitando BILL_LEAD_DAYS de antecedência.
  const recurringBills = db.prepare(`
    SELECT * FROM bills
    WHERE recurring = 1 AND status != 'paid' AND due_date <= date('now', '+' || ? || ' days')
  `).all(BILL_LEAD_DAYS) as {
    id: string; description: string; amount: number; due_date: string;
    account_id: string | null; category_id: string | null; auto_settle: 0 | 1; recurrence_interval: BillInterval;
  }[];

  const checkBillLog  = db.prepare(`SELECT 1 FROM recurring_log WHERE source_id=? AND source_type='bill' AND generated_date=?`);
  const insertBillLog = db.prepare(`INSERT OR IGNORE INTO recurring_log (source_id, source_type, generated_date) VALUES (?,?,?)`);
  const insertBill    = db.prepare(`
    INSERT INTO bills (id, description, amount, due_date, status, account_id, category_id, recurring, auto_settle)
    VALUES (?,?,?,?,?,?,?,0,?)
  `);
  const billPayments = db.prepare(`SELECT account_id, amount, is_pix FROM bill_payments WHERE bill_id=?`);
  const insertBillPayment = db.prepare(`INSERT INTO bill_payments (id, bill_id, account_id, amount, is_pix) VALUES (?,?,?,?,?)`);
  const billCategories = db.prepare(`SELECT category_id, amount FROM bill_categories WHERE bill_id=?`);
  const insertBillCategory = db.prepare(`INSERT INTO bill_categories (id, bill_id, category_id, amount) VALUES (?,?,?,?)`);
  const advanceBillDue = db.prepare(`UPDATE bills SET due_date=?, updated_at=datetime('now') WHERE id=?`);

  for (const bill of recurringBills) {
    if (checkBillLog.get(bill.id, bill.due_date)) continue;

    const newId = randomUUID();
    insertBill.run(newId, bill.description, bill.amount, bill.due_date, 'pending', bill.account_id, bill.category_id, bill.auto_settle);
    for (const payment of billPayments.all(bill.id) as { account_id: string; amount: number; is_pix: 0 | 1 }[]) {
      insertBillPayment.run(randomUUID(), newId, payment.account_id, payment.amount, payment.is_pix);
    }
    for (const category of billCategories.all(bill.id) as { category_id: string; amount: number }[]) {
      insertBillCategory.run(randomUUID(), newId, category.category_id, category.amount);
    }
    insertBillLog.run(bill.id, 'bill', bill.due_date);
    result.bills++;

    const nextDue = addInterval(bill.due_date, bill.recurrence_interval ?? 'monthly', 1);
    advanceBillDue.run(nextDue, bill.id);
  }

  // ── Recebimentos recorrentes (mensalidades/receitas fixas) ────────────────
  // Mesma lógica das contas recorrentes acima, espelhada para receivables.
  const recurringReceivables = db.prepare(`
    SELECT * FROM receivables
    WHERE recurring = 1 AND status != 'received' AND due_date <= date('now', '+' || ? || ' days')
  `).all(BILL_LEAD_DAYS) as {
    id: string; description: string; amount: number; due_date: string;
    account_id: string | null; category_id: string | null; auto_settle: 0 | 1; recurrence_interval: ReceivableInterval;
  }[];

  const checkReceivableLog  = db.prepare(`SELECT 1 FROM recurring_log WHERE source_id=? AND source_type='receivable' AND generated_date=?`);
  const insertReceivableLog = db.prepare(`INSERT OR IGNORE INTO recurring_log (source_id, source_type, generated_date) VALUES (?,?,?)`);
  const insertReceivable    = db.prepare(`
    INSERT INTO receivables (id, description, amount, due_date, status, account_id, category_id, recurring, auto_settle)
    VALUES (?,?,?,?,?,?,?,0,?)
  `);
  const receivablePayments = db.prepare(`SELECT account_id, amount, is_pix FROM receivable_payments WHERE receivable_id=?`);
  const insertReceivablePayment = db.prepare(`INSERT INTO receivable_payments (id, receivable_id, account_id, amount, is_pix) VALUES (?,?,?,?,?)`);
  const receivableCategories = db.prepare(`SELECT category_id, amount FROM receivable_categories WHERE receivable_id=?`);
  const insertReceivableCategory = db.prepare(`INSERT INTO receivable_categories (id, receivable_id, category_id, amount) VALUES (?,?,?,?)`);
  const advanceReceivableDue = db.prepare(`UPDATE receivables SET due_date=?, updated_at=datetime('now') WHERE id=?`);

  for (const receivable of recurringReceivables) {
    if (checkReceivableLog.get(receivable.id, receivable.due_date)) continue;

    const newId = randomUUID();
    insertReceivable.run(newId, receivable.description, receivable.amount, receivable.due_date, 'pending', receivable.account_id, receivable.category_id, receivable.auto_settle);
    for (const payment of receivablePayments.all(receivable.id) as { account_id: string; amount: number; is_pix: 0 | 1 }[]) {
      insertReceivablePayment.run(randomUUID(), newId, payment.account_id, payment.amount, payment.is_pix);
    }
    for (const category of receivableCategories.all(receivable.id) as { category_id: string; amount: number }[]) {
      insertReceivableCategory.run(randomUUID(), newId, category.category_id, category.amount);
    }
    insertReceivableLog.run(receivable.id, 'receivable', receivable.due_date);
    result.receivables++;

    const nextDue = addInterval(receivable.due_date, receivable.recurrence_interval ?? 'monthly', 1);
    advanceReceivableDue.run(nextDue, receivable.id);
  }

  // As ocorrências já geradas ficam pendentes até o próprio vencimento. A
  // rotina também alcança contas antigas vencidas enquanto o app estava
  // fechado, evitando lançamentos duplicados porque a conta é removida ao
  // virar transação.
  result.transactions += settleAutomaticBills();
  result.transactions += settleAutomaticReceivables();

  return result;
}
