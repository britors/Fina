import { Notification } from 'electron';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import tls from 'node:tls';
import { getDb } from './database';

function getSetting(key: string, fallback = 'true'): string {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? fallback;
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
  void sendAlertEmail(title, body).catch(err => {
    console.warn('[SMTP] Não foi possível enviar alerta por e-mail:', err instanceof Error ? err.message : err);
  });
}

type SmtpConfig = {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  to: string;
};

function smtpConfig(): SmtpConfig | null {
  const enabled = getSetting('smtp_enabled', 'false') === 'true';
  if (!enabled) return null;
  const host = getSetting('smtp_host', '').trim();
  const port = Number(getSetting('smtp_port', '587'));
  const from = getSetting('smtp_from', '').trim();
  const to = getSetting('smtp_to', '').trim();
  if (!host || !Number.isInteger(port) || port <= 0 || !from || !to) return null;
  return {
    enabled,
    host,
    port,
    secure: getSetting('smtp_secure', 'false') === 'true',
    user: getSetting('smtp_user', '').trim(),
    pass: getSetting('smtp_pass', ''),
    from,
    to,
  };
}

async function sendAlertEmail(title: string, body: string): Promise<void> {
  const cfg = smtpConfig();
  if (!cfg) return;

  const client = new SmtpClient(cfg);
  await client.connect();
  try {
    await client.sendMail(title, body);
  } finally {
    await client.quit().catch(() => {});
  }
}

class SmtpClient {
  private socket!: net.Socket | tls.TLSSocket;
  private buffer = '';
  private pending: ((line: string) => void) | null = null;

  constructor(private readonly cfg: SmtpConfig) {}

  async connect(): Promise<void> {
    this.socket = this.cfg.secure
      ? tls.connect({ host: this.cfg.host, port: this.cfg.port, servername: this.cfg.host })
      : net.connect({ host: this.cfg.host, port: this.cfg.port });

    this.socket.setEncoding('utf8');
    this.socket.on('data', chunk => this.onData(String(chunk)));
    await onceConnect(this.socket);
    await this.expect(220);
    await this.command(`EHLO localhost`, 250);

    if (!this.cfg.secure) {
      const supportsStartTls = await this.tryStartTls();
      if (supportsStartTls) await this.command(`EHLO localhost`, 250);
    }

    if (this.cfg.user || this.cfg.pass) {
      await this.command('AUTH LOGIN', 334);
      await this.command(Buffer.from(this.cfg.user).toString('base64'), 334);
      await this.command(Buffer.from(this.cfg.pass).toString('base64'), 235);
    }
  }

  async sendMail(subject: string, body: string): Promise<void> {
    await this.command(`MAIL FROM:<${extractEmail(this.cfg.from)}>`, 250);
    await this.command(`RCPT TO:<${extractEmail(this.cfg.to)}>`, [250, 251]);
    await this.command('DATA', 354);
    const message = [
      `From: ${this.cfg.from}`,
      `To: ${this.cfg.to}`,
      `Subject: ${mimeHeader(`[Fina] ${subject}`)}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      body,
      '',
    ].join('\r\n').replace(/\r?\n\./g, '\r\n..');
    await this.command(`${message}\r\n.`, 250);
  }

  async quit(): Promise<void> {
    if (!this.socket.destroyed) {
      await this.command('QUIT', 221).catch(() => {});
      this.socket.end();
    }
  }

  private async tryStartTls(): Promise<boolean> {
    const response = await this.commandRaw('STARTTLS');
    if (!response.startsWith('220')) return false;
    this.socket.removeAllListeners('data');
    const secureSocket = tls.connect({ socket: this.socket, servername: this.cfg.host });
    this.socket = secureSocket;
    this.buffer = '';
    this.pending = null;
    this.socket.setEncoding('utf8');
    this.socket.on('data', chunk => this.onData(String(chunk)));
    await onceConnect(secureSocket);
    return true;
  }

  private command(cmd: string, expected: number | number[]): Promise<string> {
    return this.commandRaw(cmd).then(response => {
      const code = Number(response.slice(0, 3));
      const ok = Array.isArray(expected) ? expected.includes(code) : code === expected;
      if (!ok) throw new Error(`SMTP respondeu ${response}`);
      return response;
    });
  }

  private commandRaw(cmd: string): Promise<string> {
    this.socket.write(`${cmd}\r\n`);
    return this.readResponse();
  }

  private expect(expected: number): Promise<string> {
    return this.readResponse().then(response => {
      if (Number(response.slice(0, 3)) !== expected) throw new Error(`SMTP respondeu ${response}`);
      return response;
    });
  }

  private readResponse(): Promise<string> {
    return new Promise(resolve => {
      this.pending = resolve;
      this.flush();
    });
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    this.flush();
  }

  private flush(): void {
    if (!this.pending) return;
    const lines = this.buffer.split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) return;
    const last = lines[lines.length - 1];
    if (!/^\d{3} /.test(last)) return;
    this.buffer = '';
    const resolve = this.pending;
    this.pending = null;
    resolve(lines.join('\n'));
  }
}

function onceConnect(socket: net.Socket | tls.TLSSocket): Promise<void> {
  if (socket instanceof tls.TLSSocket && socket.authorized !== undefined && !socket.connecting) return Promise.resolve();
  if (!socket.connecting) return Promise.resolve();
  return new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('secureConnect', resolve);
    socket.once('error', reject);
  });
}

function extractEmail(value: string): string {
  return value.match(/<([^>]+)>/)?.[1] ?? value;
}

function mimeHeader(value: string): string {
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
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
