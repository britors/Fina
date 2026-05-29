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

  const newDate = `${year}-${String(month).padStart(2, '0')}-01`;

  for (const tx of recurringTxs) {
    if (checkTxLog.get(tx.id, month, year)) continue;

    insertTx.run(randomUUID(), tx.account_id, tx.category_id, tx.description,
                 tx.amount, tx.type, newDate, tx.status, tx.notes);
    insertTxLog.run(tx.id, 'transaction', month, year);
    result.transactions++;
  }

  // ── Contas recorrentes ────────────────────────────────────────────────────
  const recurringBills = db.prepare(`
    SELECT * FROM bills WHERE recurring = 1 AND status != 'paid'
  `).all() as {
    id: string; description: string; amount: number; due_date: string;
    account_id: string | null;
  }[];

  const checkBillLog  = db.prepare(`SELECT 1 FROM recurring_log WHERE source_id=? AND source_type='bill' AND generated_month=? AND generated_year=?`);
  const insertBillLog = db.prepare(`INSERT OR IGNORE INTO recurring_log (source_id, source_type, generated_month, generated_year) VALUES (?,?,?,?)`);
  const insertBill    = db.prepare(`
    INSERT INTO bills (id, description, amount, due_date, status, account_id, recurring)
    VALUES (?,?,?,?,?,?,0)
  `);

  for (const bill of recurringBills) {
    if (checkBillLog.get(bill.id, month, year)) continue;

    // Avança a data original 1 mês
    const orig = new Date(bill.due_date);
    orig.setMonth(month - 1);
    orig.setFullYear(year);
    const newDue = orig.toISOString().slice(0, 10);

    insertBill.run(randomUUID(), bill.description, bill.amount, newDue, 'pending', bill.account_id);
    insertBillLog.run(bill.id, 'bill', month, year);
    result.bills++;
  }

  return result;
}
