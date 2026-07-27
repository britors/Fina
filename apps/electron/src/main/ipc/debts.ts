import { ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { getDb } from '../database';
import { projectCompoundGrowth, simulateDebtPayoff } from '../../shared/utils';
import type { Debt, DebtSimulation, DebtVsInvestComparison } from '../../shared/types';

type CreatePayload = Omit<Debt, 'id' | 'created_at' | 'updated_at'>;

function simulatePayoff(balance: number, rate: number, minPayment: number, extraPayment: number): DebtSimulation {
  const withExtra = simulateDebtPayoff(balance, rate, minPayment + extraPayment);
  const baseline = simulateDebtPayoff(balance, rate, minPayment);

  return {
    extra_payment: extraPayment,
    months_to_pay: withExtra.monthsToPay,
    total_paid: withExtra.totalPaid,
    total_interest: withExtra.totalInterest,
    savings_vs_minimum: baseline.totalPaid - withExtra.totalPaid,
  };
}

// Compara quitar a dívida antecipadamente (pagando minPayment + extra por mês)
// contra manter só o pagamento mínimo e investir o valor extra pelo mesmo
// número de meses que a quitação antecipada levaria — horizonte igual para
// as duas opções ficarem comparáveis.
function compareDebtVsInvest(
  balance: number, monthlyRate: number, minPayment: number, extraPayment: number, annualInvestRate: number,
): DebtVsInvestComparison {
  const withExtra = simulateDebtPayoff(balance, monthlyRate, minPayment + extraPayment);
  const baseline = simulateDebtPayoff(balance, monthlyRate, minPayment);
  const horizonMonths = withExtra.monthsToPay;

  const investPath = projectCompoundGrowth(0, extraPayment, annualInvestRate, horizonMonths);
  const investFinalValue = investPath[investPath.length - 1] ?? 0;
  const investContributed = extraPayment * horizonMonths;

  const payoffInterestSaved = baseline.totalInterest - withExtra.totalInterest;
  const investGain = investFinalValue - investContributed;

  return {
    monthly_amount: extraPayment,
    months: horizonMonths,
    payoff_interest_saved: payoffInterestSaved,
    payoff_months_to_pay: withExtra.monthsToPay,
    invest_final_value: investFinalValue,
    invest_gain: investGain,
    recommendation: investGain > payoffInterestSaved ? 'invest' : 'payoff',
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

  ipcMain.handle('debts:compareVsInvest', (_e, payload: {
    balance: number;
    rate: number;
    min_payment: number;
    extra_payment: number;
    annual_invest_rate: number;
  }): DebtVsInvestComparison =>
    compareDebtVsInvest(payload.balance, payload.rate, payload.min_payment, payload.extra_payment, payload.annual_invest_rate));

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
