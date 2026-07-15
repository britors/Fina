import { ipcMain, dialog, BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';
import { getDb } from '../database';
import { categoryOrChildPredicate } from '../categoryHierarchyQueries';

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtBrl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function registerExportHandlers(): void {

  // ── CSV de transações ─────────────────────────────────────────────────────
  ipcMain.handle('export:csv', async (_e, filters: {
    month?: number; year?: number; dateFrom?: string; dateTo?: string; account_id?: string; type?: string;
    category_id?: string; owner?: string; status?: string;
  } = {}) => {
    const { filePath } = await dialog.showSaveDialog({
      title: 'Exportar transações',
      defaultPath: filters.dateFrom || filters.dateTo
        ? `transacoes-${filters.dateFrom ?? ''}${filters.dateFrom && filters.dateTo ? '_a_' : ''}${filters.dateTo ?? ''}.csv`
        : `transacoes-${filters.year ?? new Date().getFullYear()}-${String(filters.month ?? new Date().getMonth() + 1).padStart(2, '0')}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (!filePath) return null;

    let q = `
      SELECT t.date, t.description,
             COALESCE(parent.name, c.name) as category,
             CASE WHEN parent.id IS NULL THEN '' ELSE c.name END as subcategory,
             COALESCE(
               (SELECT group_concat(a2.name, ' + ')
                FROM transaction_payments p
                JOIN accounts a2 ON a2.id = p.account_id
                WHERE p.transaction_id = t.id),
               a.name
             ) as account,
             t.type, t.amount, t.status, t.notes
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      JOIN categories c ON c.id = t.category_id
      LEFT JOIN categories parent ON parent.id = c.parent_id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (filters.dateFrom || filters.dateTo) {
      if (filters.dateFrom) { q += ` AND t.date >= ?`; params.push(filters.dateFrom); }
      if (filters.dateTo)   { q += ` AND t.date <= ?`; params.push(filters.dateTo); }
    } else {
      if (filters.month) { q += ` AND strftime('%m',t.date) = ?`; params.push(String(filters.month).padStart(2, '0')); }
      if (filters.year)  { q += ` AND strftime('%Y',t.date) = ?`; params.push(String(filters.year)); }
    }
    if (filters.account_id) {
      q += ` AND (t.account_id = ? OR EXISTS (SELECT 1 FROM transaction_payments p WHERE p.transaction_id = t.id AND p.account_id = ?))`;
      params.push(filters.account_id, filters.account_id);
    }
    if (filters.type)  { q += ` AND t.type = ?`; params.push(filters.type); }
    if (filters.category_id) {
      q += ` AND ${categoryOrChildPredicate('t.category_id')}`;
      params.push(filters.category_id, filters.category_id);
    }
    if (filters.owner) { q += ' AND t.owner = ?'; params.push(filters.owner); }
    if (filters.status) { q += ' AND t.status = ?'; params.push(filters.status); }
    q += ' ORDER BY t.date DESC';

    const rows = getDb().prepare(q).all(...params) as Record<string, unknown>[];

    const typeLabel = (t: string) => t === 'income' ? 'Receita' : t === 'expense' ? 'Despesa' : 'Transferência';
    const statusLabel = (s: string) => s === 'confirmed' ? 'Confirmado' : 'Pendente';

    const header = 'Data,Descrição,Categoria,Subcategoria,Meio de pagamento,Tipo,Valor,Status,Observações';
    const lines = rows.map(r => [
      r.date, `"${String(r.description).replace(/"/g, '""')}"`,
      `"${String(r.category).replace(/"/g, '""')}"`,
      `"${String(r.subcategory ?? '').replace(/"/g, '""')}"`,
      `"${String(r.account).replace(/"/g, '""')}"`,
      typeLabel(String(r.type)),
      String(r.amount),
      statusLabel(String(r.status)),
      `"${String(r.notes ?? '').replace(/"/g, '""')}"`,
    ].join(','));

    writeFileSync(filePath, '﻿' + [header, ...lines].join('\n'), 'utf-8');
    return filePath;
  });

  // ── PDF de relatório mensal ou filtrado ───────────────────────────────────
  ipcMain.handle('export:pdf', async (_e, filters: {
    month?: number; year?: number; dateFrom?: string; dateTo?: string; account_id?: string;
    category_id?: string; owner?: string; status?: string;
  }) => {
    const now = new Date();
    const month = filters.month ?? now.getMonth() + 1;
    const year = filters.year ?? now.getFullYear();
    const dateFrom = filters.dateFrom ?? `${year}-${String(month).padStart(2, '0')}-01`;
    const dateTo = filters.dateTo ?? `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
    const { filePath } = await dialog.showSaveDialog({
      title: 'Exportar relatório PDF',
      defaultPath: `relatorio-${dateFrom.slice(0, 7)}-a-${dateTo.slice(0, 7)}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (!filePath) return null;

    const db = getDb();
    const where = ['t.date >= ?', 't.date <= ?'];
    const params: (string | number)[] = [dateFrom, dateTo];
    if (filters.account_id) {
      where.push('(t.account_id = ? OR EXISTS (SELECT 1 FROM transaction_payments filter_payment WHERE filter_payment.transaction_id=t.id AND filter_payment.account_id=?))');
      params.push(filters.account_id, filters.account_id);
    }
    if (filters.category_id) {
      where.push(categoryOrChildPredicate('t.category_id'));
      params.push(filters.category_id, filters.category_id);
    }
    if (filters.owner) { where.push('t.owner = ?'); params.push(filters.owner); }
    if (filters.status) { where.push('t.status = ?'); params.push(filters.status); }

    const summary = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN t.type='income'  THEN t.amount ELSE 0 END),0) AS income,
        COALESCE(SUM(CASE WHEN t.type='expense' THEN t.amount ELSE 0 END),0) AS expense
      FROM transactions t WHERE ${where.join(' AND ')}
    `).get(...params) as { income: number; expense: number };

    const txs = db.prepare(`
      SELECT t.date, t.description,
             CASE WHEN parent.id IS NULL THEN c.name ELSE parent.name || ' › ' || c.name END as category,
             COALESCE(
               (SELECT group_concat(a2.name, ' + ')
                FROM transaction_payments p
                JOIN accounts a2 ON a2.id = p.account_id
                WHERE p.transaction_id = t.id),
               a.name
             ) as account,
             t.type, t.amount, t.status
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      JOIN categories c ON c.id = t.category_id
      LEFT JOIN categories parent ON parent.id = c.parent_id
      WHERE ${where.join(' AND ')}
      ORDER BY t.date DESC
    `).all(...params) as { date: string; description: string; category: string; account: string; type: string; amount: number; status: string }[];

    const userName = (db.prepare(`SELECT value FROM app_settings WHERE key='user_name'`).get() as { value: string } | undefined)?.value ?? 'Usuário';
    const periodName = `${new Date(dateFrom + 'T12:00').toLocaleDateString('pt-BR')} a ${new Date(dateTo + 'T12:00').toLocaleDateString('pt-BR')}`;
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
<div class="sub">${esc(userName)} · ${periodName}</div>
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
  <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Meio de pagamento</th><th>Valor</th></tr></thead>
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
