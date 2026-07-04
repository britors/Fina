import { randomUUID } from 'node:crypto';
import { getDb } from './database';
import { addInterval } from './ipc/bills';
import type { BillInterval } from '../shared/types';

interface RecurrenceResult {
  transactions: number;
  bills: number;
}

// Contas a pagar são geradas com essa antecedência em relação ao vencimento,
// para aparecerem na agenda/notificações antes do dia do pagamento.
const BILL_LEAD_DAYS = 30;

export function generateRecurrences(): RecurrenceResult {
  const db = getDb();
  const now   = new Date();
  const month = now.getMonth() + 1;
  const year  = now.getFullYear();

  const result: RecurrenceResult = { transactions: 0, bills: 0 };

  // ── Transações recorrentes ────────────────────────────────────────────────
  const recurringTxs = db.prepare(`
    SELECT * FROM transactions WHERE recurring = 1
  `).all() as {
    id: string; account_id: string; category_id: string; description: string;
    amount: number; type: string; status: string; notes: string | null;
  }[];

  const checkTxLog  = db.prepare(`SELECT 1 FROM recurring_log WHERE source_id=? AND source_type='transaction' AND generated_date=?`);
  const insertTxLog = db.prepare(`INSERT OR IGNORE INTO recurring_log (source_id, source_type, generated_date) VALUES (?,?,?)`);
  const insertTx    = db.prepare(`
    INSERT INTO transactions (id, account_id, category_id, description, amount, type, date, status, notes, recurring)
    VALUES (?,?,?,?,?,?,?,?,?,0)
  `);
  const txPayments = db.prepare(`SELECT account_id, amount FROM transaction_payments WHERE transaction_id=?`);
  const insertTxPayment = db.prepare(`INSERT INTO transaction_payments (id, transaction_id, account_id, amount) VALUES (?,?,?,?)`);

  const newDate = `${year}-${String(month).padStart(2, '0')}-01`;

  for (const tx of recurringTxs) {
    if (checkTxLog.get(tx.id, newDate)) continue;

    const newId = randomUUID();
    insertTx.run(newId, tx.account_id, tx.category_id, tx.description,
                 tx.amount, tx.type, newDate, tx.status, tx.notes);
    for (const payment of txPayments.all(tx.id) as { account_id: string; amount: number }[]) {
      insertTxPayment.run(randomUUID(), newId, payment.account_id, payment.amount);
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
    account_id: string | null; category_id: string | null; recurrence_interval: BillInterval;
  }[];

  const checkBillLog  = db.prepare(`SELECT 1 FROM recurring_log WHERE source_id=? AND source_type='bill' AND generated_date=?`);
  const insertBillLog = db.prepare(`INSERT OR IGNORE INTO recurring_log (source_id, source_type, generated_date) VALUES (?,?,?)`);
  const insertBill    = db.prepare(`
    INSERT INTO bills (id, description, amount, due_date, status, account_id, category_id, recurring)
    VALUES (?,?,?,?,?,?,?,0)
  `);
  const billPayments = db.prepare(`SELECT account_id, amount FROM bill_payments WHERE bill_id=?`);
  const insertBillPayment = db.prepare(`INSERT INTO bill_payments (id, bill_id, account_id, amount) VALUES (?,?,?,?)`);
  const advanceBillDue = db.prepare(`UPDATE bills SET due_date=?, updated_at=datetime('now') WHERE id=?`);

  for (const bill of recurringBills) {
    if (checkBillLog.get(bill.id, bill.due_date)) continue;

    const newId = randomUUID();
    insertBill.run(newId, bill.description, bill.amount, bill.due_date, 'pending', bill.account_id, bill.category_id);
    for (const payment of billPayments.all(bill.id) as { account_id: string; amount: number }[]) {
      insertBillPayment.run(randomUUID(), newId, payment.account_id, payment.amount);
    }
    insertBillLog.run(bill.id, 'bill', bill.due_date);
    result.bills++;

    const nextDue = addInterval(bill.due_date, bill.recurrence_interval ?? 'monthly', 1);
    advanceBillDue.run(nextDue, bill.id);
  }

  return result;
}
