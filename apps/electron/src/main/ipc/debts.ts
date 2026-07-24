import { ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { getDb } from '../database';
import type { Debt, DebtSimulation } from '../../shared/types';

type CreatePayload = Omit<Debt, 'id' | 'created_at' | 'updated_at'>;

function simulatePayoff(balance: number, rate: number, minPayment: number, extraPayment: number): DebtSimulation {
  const monthly = rate / 100;
  const payment = minPayment + extraPayment;
  let remaining = balance;
  let months = 0;
  let totalPaid = 0;

  while (remaining > 0.01 && months < 600) {
    const interest = remaining * monthly;
    const owed = remaining + interest;
    const actualPayment = Math.min(payment, owed);
    remaining = owed - actualPayment;
    if (remaining < 0) remaining = 0;
    totalPaid += actualPayment;
    months++;
  }

  // Base (minimum only) for savings comparison
  let baseRemaining = balance;
  let basePaid = 0;
  let baseMonths = 0;
  while (baseRemaining > 0.01 && baseMonths < 600) {
    const interest = baseRemaining * monthly;
    const owed = baseRemaining + interest;
    const actualPayment = Math.min(minPayment, owed);
    baseRemaining = owed - actualPayment;
    if (baseRemaining < 0) baseRemaining = 0;
    basePaid += actualPayment;
    baseMonths++;
  }

  return {
    extra_payment: extraPayment,
    months_to_pay: months,
    total_paid: totalPaid,
    total_interest: totalPaid - balance,
    savings_vs_minimum: basePaid - totalPaid,
  };
}

export function registerDebtHandlers(): void {
  ipcMain.handle('debts:list', () =>
    getDb().prepare(`SELECT * FROM debts ORDER BY status, next_due_date ASC NULLS LAST`).all()
  );

  ipcMain.handle('debts:create', (_e, data: CreatePayload) => {
    const id = randomUUID();
    getDb().prepare(`
      INSERT INTO debts (id, description, type, creditor, original_amount, outstanding_balance,
        interest_rate, installments_total, installments_remaining, installment_amount, next_due_date, status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(id, data.description, data.type, data.creditor ?? null,
           data.original_amount ?? 0, data.outstanding_balance ?? 0,
           data.interest_rate ?? 0, data.installments_total ?? 1,
           data.installments_remaining ?? 1, data.installment_amount ?? 0,
           data.next_due_date ?? null, data.status ?? 'em_dia');
    return getDb().prepare('SELECT * FROM debts WHERE id = ?').get(id);
  });

  ipcMain.handle('debts:update', (_e, { id, ...data }: Partial<CreatePayload> & { id: string }) => {
    getDb().prepare(`
      UPDATE debts SET description=?, type=?, creditor=?, original_amount=?, outstanding_balance=?,
        interest_rate=?, installments_total=?, installments_remaining=?, installment_amount=?,
        next_due_date=?, status=?, updated_at=datetime('now')
      WHERE id=?
    `).run(data.description, data.type, data.creditor ?? null,
           data.original_amount, data.outstanding_balance, data.interest_rate,
           data.installments_total, data.installments_remaining, data.installment_amount,
           data.next_due_date ?? null, data.status, id);
    return getDb().prepare('SELECT * FROM debts WHERE id = ?').get(id);
  });

  ipcMain.handle('debts:delete', (_e, id: string) =>
    getDb().prepare('DELETE FROM debts WHERE id = ?').run(id)
  );

  ipcMain.handle('debts:simulate', (_e, payload: {
    balance: number;
    rate: number;
    min_payment: number;
    extra_payment: number;
  }): DebtSimulation => simulatePayoff(payload.balance, payload.rate, payload.min_payment, payload.extra_payment));

  ipcMain.handle('debts:createBill', (_e, debtId: string) => {
    const debt = getDb().prepare('SELECT * FROM debts WHERE id = ?').get(debtId) as Debt | undefined;
    if (!debt || !debt.next_due_date) throw new Error('Dívida não encontrada ou sem data de vencimento.');

    const billId = randomUUID();
    getDb().prepare(`
      INSERT INTO bills (id, description, amount, due_date, status, account_id, recurring)
      VALUES (?,?,?,?,'pending',NULL,0)
    `).run(billId, debt.description, debt.installment_amount, debt.next_due_date);
    return getDb().prepare('SELECT * FROM bills WHERE id = ?').get(billId);
  });

  ipcMain.handle('debts:getSummary', () => {
    const row = getDb().prepare(`
      SELECT COALESCE(SUM(outstanding_balance),0) AS total_debt
      FROM debts WHERE status NOT IN ('quitada')
    `).get() as { total_debt: number };
    return row;
  });
}
