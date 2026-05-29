import { Notification } from 'electron';
import { randomUUID } from 'node:crypto';
import { getDb } from './database';

function getSetting(key: string): string {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? 'true';
}

function alreadySent(type: string, refId: string): boolean {
  const row = getDb()
    .prepare(`SELECT 1 FROM notification_log WHERE type = ? AND ref_id = ? AND sent_date = date('now')`)
    .get(type, refId);
  return !!row;
}

function logSent(type: string, refId: string): void {
  getDb()
    .prepare(`INSERT OR IGNORE INTO notification_log (id, type, ref_id) VALUES (?,?,?)`)
    .run(randomUUID(), type, refId);
}

function notify(title: string, body: string): void {
  if (!Notification.isSupported()) return;
  new Notification({ title, body, silent: false }).show();
}

export function checkAndNotify(): void {
  const db = getDb();
  const notifBills  = getSetting('notif_bills')  !== 'false';
  const notifBudget = getSetting('notif_budget') !== 'false';

  if (notifBills) {
    // Contas a vencer em até 3 dias
    const upcoming = db.prepare(`
      SELECT id, description, amount, due_date
      FROM bills
      WHERE status = 'pending'
        AND due_date >= date('now')
        AND due_date <= date('now', '+3 days')
    `).all() as { id: string; description: string; amount: number; due_date: string }[];

    for (const b of upcoming) {
      if (alreadySent('bill_due', b.id)) continue;
      const days = Math.ceil((new Date(b.due_date).getTime() - Date.now()) / 86400_000);
      const when  = days === 0 ? 'hoje' : days === 1 ? 'amanhã' : `em ${days} dias`;
      notify(
        'Conta a vencer',
        `${b.description} vence ${when} — R$ ${b.amount.toFixed(2).replace('.', ',')}`,
      );
      logSent('bill_due', b.id);
    }

    // Contas vencidas
    const overdue = db.prepare(`
      SELECT id, description, amount FROM bills WHERE status = 'overdue'
    `).all() as { id: string; description: string; amount: number }[];

    for (const b of overdue) {
      if (alreadySent('bill_overdue', b.id)) continue;
      notify('Conta vencida', `${b.description} está vencida — R$ ${b.amount.toFixed(2).replace('.', ',')}`);
      logSent('bill_overdue', b.id);
    }
  }

  if (notifBudget) {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year  = now.getFullYear();

    const budgets = db.prepare(`
      SELECT b.id, c.name, b.limit_amount,
             COALESCE((
               SELECT SUM(t.amount) FROM transactions t
               WHERE t.category_id = b.category_id
                 AND t.type = 'expense'
                 AND t.status = 'confirmed'
                 AND strftime('%m', t.date) = printf('%02d', b.month)
                 AND strftime('%Y', t.date) = CAST(b.year AS TEXT)
             ), 0) AS spent
      FROM budgets b
      JOIN categories c ON c.id = b.category_id
      WHERE b.month = ? AND b.year = ?
    `).all(month, year) as { id: string; name: string; limit_amount: number; spent: number }[];

    for (const bud of budgets) {
      const pct = bud.limit_amount > 0 ? bud.spent / bud.limit_amount : 0;

      if (pct >= 1 && !alreadySent('budget_over', bud.id)) {
        notify('Orçamento excedido', `Orçamento de ${bud.name} ultrapassado`);
        logSent('budget_over', bud.id);
      } else if (pct >= 0.8 && pct < 1 && !alreadySent('budget_warn', bud.id)) {
        notify('Orçamento quase no limite', `${bud.name} está com ${Math.round(pct * 100)}% do orçamento usado`);
        logSent('budget_warn', bud.id);
      }
    }
  }
}

export function startNotificationScheduler(): void {
  checkAndNotify();
  setInterval(checkAndNotify, 60 * 60 * 1000); // a cada 1 hora
}
