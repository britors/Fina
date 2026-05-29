import { ipcMain, dialog, BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';
import { getDb } from '../database';

export interface IRPFRendimento {
  category: string;
  total: number;
}

export interface IRPFBem {
  descricao: string;
  tipo: string;
  valor: number;
  cnpj_cpf?: string;
}

export interface IRPFDivida {
  descricao: string;
  credor: string;
  saldo: number;
}

export interface IRPFReport {
  year: number;
  user_name: string;
  rendimentos_tributaveis: IRPFRendimento[];
  total_rendimentos_tributaveis: number;
  rendimentos_isentos: IRPFRendimento[];
  total_rendimentos_isentos: number;
  deducoes: { categoria: string; total: number }[];
  total_deducoes: number;
  bens: IRPFBem[];
  total_bens: number;
  dividas: IRPFDivida[];
  total_dividas: number;
}

// Categorias consideradas renda tributável
const CAT_TRIBUTAVEL = ['salário', 'salario', 'freelance', 'aluguel', 'pró-labore', 'pro-labore'];
// Categorias consideradas renda isenta (FGTS, herança, poupança etc.)
const CAT_ISENTA = ['poupança', 'poupanca', 'rendimento', 'dividendo', 'restituição', 'restituicao'];
// Categorias dedutíveis
const CAT_DEDUCAO = ['saúde', 'saude', 'educação', 'educacao'];

function matchesAny(name: string, list: string[]): boolean {
  const n = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return list.some(k => n.includes(k.normalize('NFD').replace(/[̀-ͯ]/g, '')));
}

export function registerIRPFHandlers(): void {

  ipcMain.handle('irpf:exportCSV', async (_e, report: IRPFReport) => {
    const { filePath } = await dialog.showSaveDialog({
      title: 'Exportar dados IRPF (CSV)',
      defaultPath: `irpf-${report.year}-dados.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (!filePath) return null;

    const lines: string[] = [];
    const q = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    const n = (v: number) => v.toFixed(2).replace('.', ',');

    lines.push('FICHA;DESCRICAO;VALOR');

    lines.push('');
    lines.push(q('Ficha 1 — Rendimentos Tributáveis') + ';;');
    for (const r of report.rendimentos_tributaveis) {
      lines.push(`${q('Rendimentos Tributáveis')};${q(r.category)};${n(r.total)}`);
    }
    lines.push(`${q('TOTAL RENDIMENTOS TRIBUTÁVEIS')};;${n(report.total_rendimentos_tributaveis)}`);

    lines.push('');
    lines.push(q('Ficha 2 — Rendimentos Isentos') + ';;');
    for (const r of report.rendimentos_isentos) {
      lines.push(`${q('Rendimentos Isentos')};${q(r.category)};${n(r.total)}`);
    }
    lines.push(`${q('TOTAL RENDIMENTOS ISENTOS')};;${n(report.total_rendimentos_isentos)}`);

    lines.push('');
    lines.push(q('Ficha 3 — Deduções') + ';;');
    for (const d of report.deducoes) {
      lines.push(`${q('Deduções')};${q(d.categoria)};${n(d.total)}`);
    }
    lines.push(`${q('TOTAL DEDUÇÕES')};;${n(report.total_deducoes)}`);

    lines.push('');
    lines.push(q('Ficha 4 — Bens e Direitos') + ';;');
    for (const b of report.bens) {
      lines.push(`${q(b.tipo)};${q(b.descricao)};${n(b.valor)}`);
    }
    lines.push(`${q('TOTAL BENS')};;${n(report.total_bens)}`);

    lines.push('');
    lines.push(q('Ficha 5 — Dívidas e Ônus') + ';;');
    for (const d of report.dividas) {
      lines.push(`${q('Dívidas')};${q(d.descricao + ' — ' + d.credor)};${n(d.saldo)}`);
    }
    lines.push(`${q('TOTAL DÍVIDAS')};;${n(report.total_dividas)}`);

    writeFileSync(filePath, '﻿' + lines.join('\n'), 'utf-8');
    return filePath;
  });

  ipcMain.handle('irpf:getReport', (_e, year: number): IRPFReport => {
    const db = getDb();
    const y  = String(year);

    const userName = (db.prepare(`SELECT value FROM app_settings WHERE key='user_name'`).get() as { value: string } | undefined)?.value ?? 'Usuário';

    // Receitas do ano agrupadas por categoria
    const incomes = db.prepare(`
      SELECT c.name AS category, SUM(t.amount) AS total
      FROM transactions t
      JOIN categories c ON c.id = t.category_id
      WHERE t.type = 'income'
        AND t.status = 'confirmed'
        AND strftime('%Y', t.date) = ?
      GROUP BY c.id
      ORDER BY total DESC
    `).all(y) as { category: string; total: number }[];

    const tributaveis = incomes.filter(r => matchesAny(r.category, CAT_TRIBUTAVEL));
    const isentos     = incomes.filter(r => matchesAny(r.category, CAT_ISENTA));
    // Receitas não classificadas vão para tributável por padrão
    const naoClassif  = incomes.filter(r => !matchesAny(r.category, CAT_TRIBUTAVEL) && !matchesAny(r.category, CAT_ISENTA));
    const allTributaveis = [...tributaveis, ...naoClassif];

    // Deduções (despesas em categorias dedutíveis)
    const deducoes = db.prepare(`
      SELECT c.name AS categoria, SUM(t.amount) AS total
      FROM transactions t
      JOIN categories c ON c.id = t.category_id
      WHERE t.type = 'expense'
        AND t.status = 'confirmed'
        AND strftime('%Y', t.date) = ?
      GROUP BY c.id
    `).all(y) as { categoria: string; total: number }[];

    const deducoesFiltradas = deducoes.filter(d => matchesAny(d.categoria, CAT_DEDUCAO));

    // Bens e direitos: contas + investimentos + patrimônio
    const contas = db.prepare(`SELECT name, type, bank_name, balance FROM accounts WHERE balance > 0`).all() as
      { name: string; type: string; bank_name: string | null; balance: number }[];

    const investimentos = db.prepare(`SELECT name, type, institution, current_value FROM investments WHERE current_value > 0`).all() as
      { name: string; type: string; institution: string | null; current_value: number }[];

    const ativos = db.prepare(`SELECT name, type, current_value FROM assets WHERE current_value > 0`).all() as
      { name: string; type: string; current_value: number }[];

    const bens: IRPFBem[] = [
      ...contas.map(c => ({
        descricao: `${c.name}${c.bank_name ? ` — ${c.bank_name}` : ''}`,
        tipo: labelContaTipo(c.type),
        valor: c.balance,
      })),
      ...investimentos.map(i => ({
        descricao: `${i.name}${i.institution ? ` — ${i.institution}` : ''}`,
        tipo: labelInvestTipo(i.type),
        valor: i.current_value,
      })),
      ...ativos.map(a => ({
        descricao: a.name,
        tipo: labelAssetTipo(a.type),
        valor: a.current_value,
      })),
    ];

    // Dívidas e ônus
    const dividasRaw = db.prepare(`
      SELECT description, creditor, outstanding_balance
      FROM debts WHERE status NOT IN ('quitada') AND outstanding_balance > 0
    `).all() as { description: string; creditor: string | null; outstanding_balance: number }[];

    const dividas: IRPFDivida[] = dividasRaw.map(d => ({
      descricao: d.description,
      credor: d.creditor ?? '—',
      saldo: d.outstanding_balance,
    }));

    return {
      year,
      user_name: userName,
      rendimentos_tributaveis: allTributaveis,
      total_rendimentos_tributaveis: allTributaveis.reduce((s, r) => s + r.total, 0),
      rendimentos_isentos: isentos,
      total_rendimentos_isentos: isentos.reduce((s, r) => s + r.total, 0),
      deducoes: deducoesFiltradas,
      total_deducoes: deducoesFiltradas.reduce((s, d) => s + d.total, 0),
      bens,
      total_bens: bens.reduce((s, b) => s + b.valor, 0),
      dividas,
      total_dividas: dividas.reduce((s, d) => s + d.saldo, 0),
    };
  });

  ipcMain.handle('irpf:exportPDF', async (_e, report: IRPFReport) => {
    const { filePath } = await dialog.showSaveDialog({
      title: 'Exportar Informe de Rendimentos',
      defaultPath: `informe-rendimentos-${report.year}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (!filePath) return null;

    const html = buildHTML(report);
    const win  = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true } });
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const buf = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
    win.destroy();
    writeFileSync(filePath, buf);
    return filePath;
  });
}

// ── Helpers de label ─────────────────────────────────────────────────────────

function labelContaTipo(t: string): string {
  return ({ checking: 'Conta Corrente', savings: 'Conta Poupança', credit_card: 'Cartão de Crédito', wallet: 'Carteira' } as Record<string, string>)[t] ?? t;
}

function labelInvestTipo(t: string): string {
  return ({ renda_fixa: 'Renda Fixa', renda_variavel: 'Renda Variável', fundo: 'Fundo de Investimento', cripto: 'Criptomoeda', outro: 'Investimento' } as Record<string, string>)[t] ?? t;
}

function labelAssetTipo(t: string): string {
  return ({ imovel: 'Bem Imóvel', veiculo: 'Veículo', terreno: 'Terreno', investimento: 'Investimento', outro: 'Outros Bens' } as Record<string, string>)[t] ?? t;
}

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Geração do HTML do informe ────────────────────────────────────────────────

function buildHTML(r: IRPFReport): string {
  const rows = (items: { label: string; value: number }[]) =>
    items.map(i => `<tr><td>${esc(i.label)}</td><td class="val">${brl(i.value)}</td></tr>`).join('');

  const section = (title: string, body: string) => `
    <div class="section">
      <div class="section-title">${title}</div>
      ${body}
    </div>`;

  const table = (items: { label: string; value: number }[], total: number, totalLabel = 'Total') => `
    <table>
      <tbody>${rows(items)}</tbody>
      <tfoot><tr><td><strong>${totalLabel}</strong></td><td class="val total">${brl(total)}</td></tr></tfoot>
    </table>`;

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 28px 32px; }

  .header { border: 2px solid #1D9E75; border-radius: 6px; padding: 16px 20px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
  .header-left h1 { font-size: 18px; color: #1D9E75; font-weight: 700; letter-spacing: -0.5px; }
  .header-left .sub { font-size: 10px; color: #666; margin-top: 2px; letter-spacing: 1px; text-transform: uppercase; }
  .header-right { text-align: right; }
  .header-right .year { font-size: 28px; font-weight: 700; color: #1D9E75; line-height: 1; }
  .header-right .year-label { font-size: 9px; color: #888; text-transform: uppercase; letter-spacing: 1px; }

  .declarante { background: #f8f8f8; border: 1px solid #ddd; border-radius: 4px; padding: 10px 14px; margin-bottom: 20px; font-size: 11px; }
  .declarante strong { font-size: 13px; }

  .section { margin-bottom: 18px; break-inside: avoid; }
  .section-title { background: #1D9E75; color: #fff; font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; padding: 5px 10px; border-radius: 3px 3px 0 0; }

  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  td { padding: 5px 10px; border-bottom: 1px solid #f0f0f0; }
  td.val { text-align: right; width: 130px; font-family: monospace; font-size: 11px; }
  tfoot td { background: #f4f4f4; font-size: 11px; border-top: 1.5px solid #ccc; border-bottom: none; }
  td.total { color: #1D9E75; font-weight: 700; font-size: 12px; }

  .bens-table td:nth-child(2) { color: #555; font-size: 10px; width: 160px; }

  .aviso { margin-top: 24px; padding: 10px 14px; border: 1px solid #e0a800; border-radius: 4px; background: #fffbeb; font-size: 10px; color: #7a5900; line-height: 1.5; }
  .footer { margin-top: 20px; text-align: center; font-size: 9px; color: #aaa; border-top: 1px solid #eee; padding-top: 10px; }

  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
</style></head><body>

<div class="header">
  <div class="header-left">
    <h1>fina</h1>
    <div class="sub">Informe de Rendimentos — Declaração IRPF</div>
  </div>
  <div class="header-right">
    <div class="year">${r.year}</div>
    <div class="year-label">Ano-Calendário</div>
  </div>
</div>

<div class="declarante">
  <div style="font-size:9px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px">Declarante</div>
  <strong>${esc(r.user_name)}</strong>
  <span style="color:#888;margin-left:12px;font-size:10px">Gerado em ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
</div>

<div class="grid2">
  ${section('1. Rendimentos Tributáveis', r.rendimentos_tributaveis.length === 0
    ? `<table><tbody><tr><td style="color:#999;padding:8px 10px">Nenhum rendimento tributável no período</td></tr></tbody></table>`
    : table(r.rendimentos_tributaveis.map(i => ({ label: i.category, value: i.total })), r.total_rendimentos_tributaveis)
  )}

  ${section('2. Rendimentos Isentos e Não Tributáveis', r.rendimentos_isentos.length === 0
    ? `<table><tbody><tr><td style="color:#999;padding:8px 10px">Nenhum rendimento isento identificado</td></tr></tbody></table>`
    : table(r.rendimentos_isentos.map(i => ({ label: i.category, value: i.total })), r.total_rendimentos_isentos)
  )}
</div>

${section('3. Deduções (Saúde e Educação)', r.deducoes.length === 0
  ? `<table><tbody><tr><td style="color:#999;padding:8px 10px">Nenhuma despesa dedutível encontrada — verifique se suas categorias incluem "Saúde" ou "Educação"</td></tr></tbody></table>`
  : table(r.deducoes.map(d => ({ label: d.categoria, value: d.total })), r.total_deducoes, 'Total de deduções')
)}

${section('4. Bens e Direitos', `
  <table class="bens-table">
    <tbody>
      ${r.bens.map(b => `<tr>
        <td>${esc(b.descricao)}</td>
        <td>${esc(b.tipo)}</td>
        <td class="val">${brl(b.valor)}</td>
      </tr>`).join('') || `<tr><td colspan="3" style="color:#999;padding:8px 10px">Nenhum bem cadastrado</td></tr>`}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="2"><strong>Total de bens declarados</strong></td>
        <td class="val total">${brl(r.total_bens)}</td>
      </tr>
    </tfoot>
  </table>`
)}

${section('5. Dívidas e Ônus Reais', `
  <table>
    <tbody>
      ${r.dividas.map(d => `<tr>
        <td>${esc(d.descricao)}</td>
        <td style="color:#555;font-size:10px;width:160px">${esc(d.credor)}</td>
        <td class="val">${brl(d.saldo)}</td>
      </tr>`).join('') || `<tr><td colspan="3" style="color:#999;padding:8px 10px">Nenhuma dívida cadastrada</td></tr>`}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="2"><strong>Total de dívidas</strong></td>
        <td class="val total" style="color:#c0392b">${brl(r.total_dividas)}</td>
      </tr>
    </tfoot>
  </table>`
)}

<div class="aviso">
  <strong>⚠️ Atenção:</strong> Este informe é gerado com base nos dados lançados no aplicativo Fina e tem caráter auxiliar.
  Os valores podem não refletir a totalidade dos seus rendimentos e bens. Consulte os informes oficiais emitidos pelas
  instituições financeiras e, se necessário, um contador ou especialista tributário antes de submeter sua declaração à Receita Federal.
</div>

<div class="footer">
  Fina — Gerenciador de Finanças Pessoais · Documento gerado automaticamente · Não possui validade legal
</div>

</body></html>`;
}
