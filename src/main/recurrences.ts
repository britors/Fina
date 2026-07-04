import { randomUUID } from 'node:crypto';
import { getDb } from './database';

interface RecurrenceResult {
  transactions: number;
  bills: number;
}

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

  const checkTxLog  = db.prepare(`SELECT 1 FROM recurring_log WHERE source_id=? AND source_type='transaction' AND generated_month=? AND generated_year=?`);
  const insertTxLog = db.prepare(`INSERT OR IGNORE INTO recurring_log (source_id, source_type, generated_month, generated_year) VALUES (?,?,?,?)`);
  const insertTx    = db.prepare(`
    INSERT INTO transactions (id, account_id, category_id, description, amount, type, date, status, notes, recurring)
    VALUES (?,?,?,?,?,?,?,?,?,0)
  `);
  const txPayments = db.prepare(`SELECT account_id, amount FROM transaction_payments WHERE transaction_id=?`);
  const insertTxPayment = db.prepare(`INSERT INTO transaction_payments (id, transaction_id, account_id, amount) VALUES (?,?,?,?)`);

  const newDate = `${year}-${String(month).padStart(2, '0')}-01`;

  for (const tx of recurringTxs) {
    if (checkTxLog.get(tx.id, month, year)) continue;

    const newId = randomUUID();
    insertTx.run(newId, tx.account_id, tx.category_id, tx.description,
                 tx.amount, tx.type, newDate, tx.status, tx.notes);
    for (const payment of txPayments.all(tx.id) as { account_id: string; amount: number }[]) {
      insertTxPayment.run(randomUUID(), newId, payment.account_id, payment.amount);
    }
    insertTxLog.run(tx.id, 'transaction', month, year);
    result.transactions++;
  }

  // ── Contas recorrentes ────────────────────────────────────────────────────
  const recurringBills = db.prepare(`
    SELECT * FROM bills WHERE recurring = 1 AND status != 'paid'
  `).all() as {
    id: string; description: string; amount: number; due_date: string;
    account_id: string | null; category_id: string | null;
  }[];

  const checkBillLog  = db.prepare(`SELECT 1 FROM recurring_log WHERE source_id=? AND source_type='bill' AND generated_month=? AND generated_year=?`);
  const insertBillLog = db.prepare(`INSERT OR IGNORE INTO recurring_log (source_id, source_type, generated_month, generated_year) VALUES (?,?,?,?)`);
  const insertBill    = db.prepare(`
    INSERT INTO bills (id, description, amount, due_date, status, account_id, category_id, recurring)
    VALUES (?,?,?,?,?,?,?,0)
  `);
  const billPayments = db.prepare(`SELECT account_id, amount FROM bill_payments WHERE bill_id=?`);
  const insertBillPayment = db.prepare(`INSERT INTO bill_payments (id, bill_id, account_id, amount) VALUES (?,?,?,?)`);

  for (const bill of recurringBills) {
    if (checkBillLog.get(bill.id, month, year)) continue;

    // Avança a data original para o mesmo dia no mês/ano de referência,
    // limitando ao último dia do mês quando ele não existir (ex: dia 31 em fevereiro).
    const origDay   = Number(bill.due_date.slice(8, 10));
    const lastDay   = new Date(year, month, 0).getDate();
    const day       = Math.min(origDay, lastDay);
    const newDue    = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const newId = randomUUID();
    insertBill.run(newId, bill.description, bill.amount, newDue, 'pending', bill.account_id, bill.category_id);
    for (const payment of billPayments.all(bill.id) as { account_id: string; amount: number }[]) {
      insertBillPayment.run(randomUUID(), newId, payment.account_id, payment.amount);
    }
    insertBillLog.run(bill.id, 'bill', month, year);
    result.bills++;
  }

  return result;
}
