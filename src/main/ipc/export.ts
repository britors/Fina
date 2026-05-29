import { ipcMain, dialog, BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';
import { getDb } from '../database';

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtBrl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function registerExportHandlers(): void {

  // ── CSV de transações ─────────────────────────────────────────────────────
  ipcMain.handle('export:csv', async (_e, filters: {
    month?: number; year?: number; account_id?: string; type?: string;
  } = {}) => {
    const { filePath } = await dialog.showSaveDialog({
      title: 'Exportar transações',
      defaultPath: `transacoes-${filters.year ?? new Date().getFullYear()}-${String(filters.month ?? new Date().getMonth() + 1).padStart(2, '0')}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (!filePath) return null;

    let q = `
      SELECT t.date, t.description, c.name as category, a.name as account,
             t.type, t.amount, t.status, t.notes
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      JOIN categories c ON c.id = t.category_id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (filters.month) { q += ` AND strftime('%m',t.date) = ?`; params.push(String(filters.month).padStart(2, '0')); }
    if (filters.year)  { q += ` AND strftime('%Y',t.date) = ?`; params.push(String(filters.year)); }
    if (filters.account_id) { q += ` AND t.account_id = ?`; params.push(filters.account_id); }
    if (filters.type)  { q += ` AND t.type = ?`; params.push(filters.type); }
    q += ' ORDER BY t.date DESC';

    const rows = getDb().prepare(q).all(...params) as Record<string, unknown>[];

    const typeLabel = (t: string) => t === 'income' ? 'Receita' : t === 'expense' ? 'Despesa' : 'Transferência';
    const statusLabel = (s: string) => s === 'confirmed' ? 'Confirmado' : 'Pendente';

    const header = 'Data,Descrição,Categoria,Conta,Tipo,Valor,Status,Observações';
    const lines = rows.map(r => [
      r.date, `"${String(r.description).replace(/"/g, '""')}"`,
      `"${String(r.category).replace(/"/g, '""')}"`,
      `"${String(r.account).replace(/"/g, '""')}"`,
      typeLabel(String(r.type)),
      String(r.amount),
      statusLabel(String(r.status)),
      `"${String(r.notes ?? '').replace(/"/g, '""')}"`,
    ].join(','));

    writeFileSync(filePath, '﻿' + [header, ...lines].join('\n'), 'utf-8');
    return filePath;
  });

  // ── PDF de relatório mensal ───────────────────────────────────────────────
  ipcMain.handle('export:pdf', async (_e, { month, year }: { month: number; year: number }) => {
    const { filePath } = await dialog.showSaveDialog({
      title: 'Exportar relatório PDF',
      defaultPath: `relatorio-${year}-${String(month).padStart(2, '0')}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (!filePath) return null;

    const db = getDb();
    const pad = String(month).padStart(2, '0');

    const summary = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END),0) AS income,
        COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS expense
      FROM transactions
      WHERE status='confirmed'
        AND strftime('%m',date)=? AND strftime('%Y',date)=?
    `).get(pad, String(year)) as { income: number; expense: number };

    const txs = db.prepare(`
      SELECT t.date, t.description, c.name as category, a.name as account, t.type, t.amount, t.status
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      JOIN categories c ON c.id = t.category_id
      WHERE strftime('%m',t.date)=? AND strftime('%Y',t.date)=?
      ORDER BY t.date DESC
    `).all(pad, String(year)) as { date: string; description: string; category: string; account: string; type: string; amount: number; status: string }[];

    const userName = (db.prepare(`SELECT value FROM app_settings WHERE key='user_name'`).get() as { value: string } | undefined)?.value ?? 'Usuário';
    const monthName = new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const balance = summary.income - summary.expense;

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; color: #1a1a1a; margin: 0; padding: 24px; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .sub { color: #666; font-size: 11px; margin-bottom: 20px; }
  .summary { display: flex; gap: 20px; margin-bottom: 24px; }
  .summary-card { flex: 1; border: 1px solid #ddd; border-radius: 6px; padding: 12px; }
  .summary-label { font-size: 10px; color: #888; text-transform: uppercase; }
  .summary-value { font-size: 18px; font-weight: bold; margin-top: 4px; }
  .green { color: #1a8a5a; }
  .red   { color: #c0392b; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th { background: #f4f4f4; text-align: left; padding: 6px 8px; font-size: 10px; text-transform: uppercase; }
  td { padding: 6px 8px; border-bottom: 1px solid #f0f0f0; font-size: 11px; }
  .type-income  { color: #1a8a5a; }
  .type-expense { color: #c0392b; }
</style></head><body>
<h1>Relatório Financeiro</h1>
<div class="sub">${esc(userName)} · ${monthName}</div>
<div class="summary">
  <div class="summary-card">
    <div class="summary-label">Receitas</div>
    <div class="summary-value green">${fmtBrl(summary.income)}</div>
  </div>
  <div class="summary-card">
    <div class="summary-label">Despesas</div>
    <div class="summary-value red">${fmtBrl(summary.expense)}</div>
  </div>
  <div class="summary-card">
    <div class="summary-label">Saldo</div>
    <div class="summary-value ${balance >= 0 ? 'green' : 'red'}">${fmtBrl(balance)}</div>
  </div>
</div>
<table>
  <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Conta</th><th>Valor</th></tr></thead>
  <tbody>
    ${txs.map(t => `<tr>
      <td>${new Date(t.date + 'T12:00').toLocaleDateString('pt-BR')}</td>
      <td>${esc(t.description)}</td>
      <td>${esc(t.category)}</td>
      <td>${esc(t.account)}</td>
      <td class="${t.type === 'income' ? 'type-income' : 'type-expense'}" style="text-align:right">
        ${t.type === 'income' ? '+' : '-'}${fmtBrl(t.amount)}
      </td>
    </tr>`).join('')}
  </tbody>
</table>
</body></html>`;

    const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true } });
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const pdfBuf = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
    win.destroy();
    writeFileSync(filePath, pdfBuf);
    return filePath;
  });
}
