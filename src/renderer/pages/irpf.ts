import { invoke } from '../api';
import { formatCurrency } from '../../shared/utils';
import { setTopbarActions } from '../components/topbar';
import type { IRPFReport } from '../../shared/types';

export async function render(el: HTMLElement): Promise<void> {
  const currentYear = new Date().getFullYear();
  let year = currentYear - 1; // padrão: ano anterior (ano-calendário)
  let report: IRPFReport | null = null;
  let loading = false;

  setTopbarActions(`
    <select class="form-ctrl" id="irpf-year" style="width:110px">
      ${[0, 1, 2, 3, 4].map(i => {
        const y = currentYear - i;
        return `<option value="${y}" ${y === year ? 'selected' : ''}>${y}</option>`;
      }).join('')}
    </select>
    <button class="btn btn-secondary" id="btn-irpf-load">
      <i class="ti ti-refresh"></i> Gerar
    </button>
    <button class="btn btn-secondary" id="btn-irpf-csv" disabled>
      <i class="ti ti-table-export"></i> Exportar CSV
    </button>
    <button class="btn btn-primary" id="btn-irpf-pdf" disabled>
      <i class="ti ti-file-type-pdf"></i> Exportar PDF
    </button>
  `);

  document.getElementById('irpf-year')?.addEventListener('change', (e) => {
    year = parseInt((e.target as HTMLSelectElement).value);
  });

  document.getElementById('btn-irpf-load')?.addEventListener('click', fetchAndRender);

  document.getElementById('btn-irpf-csv')?.addEventListener('click', async () => {
    if (!report) return;
    await invoke('irpf:exportCSV', report);
  });

  document.getElementById('btn-irpf-pdf')?.addEventListener('click', async () => {
    if (!report) return;
    const btn = document.getElementById('btn-irpf-pdf') as HTMLButtonElement;
    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-loader ti-spin"></i> Gerando...';
    await invoke('irpf:exportPDF', report);
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-file-type-pdf"></i> Exportar PDF';
  });

  async function fetchAndRender(): Promise<void> {
    loading = true;
    renderPage();
    report = await invoke<IRPFReport>('irpf:getReport', year);
    loading = false;
    const pdfBtn = document.getElementById('btn-irpf-pdf') as HTMLButtonElement | null;
    if (pdfBtn) pdfBtn.disabled = false;
    const csvBtn = document.getElementById('btn-irpf-csv') as HTMLButtonElement | null;
    if (csvBtn) csvBtn.disabled = false;
    renderPage();
  }

  function renderPage(): void {
    if (loading) {
      el.innerHTML = '<div class="loading"><i class="ti ti-loader-2"></i> Calculando...</div>';
      return;
    }

    if (!report) {
      el.innerHTML = `
        <div class="empty">
          <i class="ti ti-file-invoice" style="font-size:2.5rem;color:var(--text-4)"></i>
          <div class="empty-title">Selecione o ano e clique em Gerar</div>
          <div class="empty-desc">O informe reúne rendimentos, deduções, bens e dívidas lançados no Fina para auxiliar na declaração do IRPF.</div>
          <button class="btn btn-primary" id="btn-empty-gen">
            <i class="ti ti-file-invoice"></i> Gerar informe de ${year}
          </button>
        </div>`;
      el.querySelector('#btn-empty-gen')?.addEventListener('click', fetchAndRender);
      return;
    }

    const r = report;

    el.innerHTML = `
      <div style="max-width:860px;display:flex;flex-direction:column;gap:16px">

        <!-- Cabeçalho -->
        <div class="card" style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px">
          <div>
            <div style="font-size:1.1rem;font-weight:600">Informe de Rendimentos — IRPF ${r.year}</div>
            <div style="font-size:0.8rem;color:var(--text-3);margin-top:2px">Ano-calendário ${r.year} · ${esc(r.user_name)}</div>
          </div>
          <div style="display:flex;gap:20px;text-align:right">
            <div>
              <div style="font-size:0.72rem;color:var(--text-3);text-transform:uppercase;letter-spacing:0.5px">Total bens</div>
              <div style="font-weight:600;color:var(--accent)">${formatCurrency(r.total_bens)}</div>
            </div>
            <div>
              <div style="font-size:0.72rem;color:var(--text-3);text-transform:uppercase;letter-spacing:0.5px">Total dívidas</div>
              <div style="font-weight:600;color:var(--danger)">${formatCurrency(r.total_dividas)}</div>
            </div>
            <div>
              <div style="font-size:0.72rem;color:var(--text-3);text-transform:uppercase;letter-spacing:0.5px">Patrimônio líquido</div>
              <div style="font-weight:600">${formatCurrency(r.total_bens - r.total_dividas)}</div>
            </div>
          </div>
        </div>

        <!-- Rendimentos -->
        <div class="grid-2" style="gap:16px">
          ${sectionCard('1. Rendimentos Tributáveis', 'ti-receipt-tax', '#D85A30',
            r.rendimentos_tributaveis,
            r.total_rendimentos_tributaveis,
            'Nenhum rendimento tributável encontrado'
          )}
          ${sectionCard('2. Rendimentos Isentos', 'ti-shield-check', '#1D9E75',
            r.rendimentos_isentos,
            r.total_rendimentos_isentos,
            'Nenhum rendimento isento identificado'
          )}
        </div>

        <!-- Deduções -->
        ${sectionCard('3. Deduções (Saúde e Educação)', 'ti-heart', '#8B5CF6',
          r.deducoes.map(d => ({ category: d.categoria, total: d.total })),
          r.total_deducoes,
          'Nenhuma dedução encontrada — verifique se suas categorias incluem "Saúde" ou "Educação"'
        )}

        <!-- Bens -->
        <div class="card">
          <div class="card-header">
            <span style="display:flex;align-items:center;gap:8px">
              <i class="ti ti-building-bank" style="color:#3B82F6"></i> 4. Bens e Direitos
            </span>
            <span style="font-weight:600;color:var(--accent)">${formatCurrency(r.total_bens)}</span>
          </div>
          <div class="card-hr"></div>
          ${r.bens.length === 0
            ? `<div class="empty" style="padding:20px"><div class="empty-title">Nenhum bem cadastrado</div></div>`
            : `<table class="table">
                <thead><tr><th>BEM</th><th>TIPO</th><th style="text-align:right">VALOR</th></tr></thead>
                <tbody>
                  ${r.bens.map(b => `<tr>
                    <td style="font-weight:500">${esc(b.descricao)}</td>
                    <td style="color:var(--text-3);font-size:0.78rem">${esc(b.tipo)}</td>
                    <td style="text-align:right">${formatCurrency(b.valor)}</td>
                  </tr>`).join('')}
                </tbody>
              </table>`}
        </div>

        <!-- Dívidas -->
        <div class="card">
          <div class="card-header">
            <span style="display:flex;align-items:center;gap:8px">
              <i class="ti ti-receipt" style="color:#D85A30"></i> 5. Dívidas e Ônus Reais
            </span>
            <span style="font-weight:600;color:var(--danger)">${formatCurrency(r.total_dividas)}</span>
          </div>
          <div class="card-hr"></div>
          ${r.dividas.length === 0
            ? `<div class="empty" style="padding:20px"><div class="empty-title">Nenhuma dívida cadastrada</div></div>`
            : `<table class="table">
                <thead><tr><th>DÍVIDA</th><th>CREDOR</th><th style="text-align:right">SALDO</th></tr></thead>
                <tbody>
                  ${r.dividas.map(d => `<tr>
                    <td style="font-weight:500">${esc(d.descricao)}</td>
                    <td style="color:var(--text-3);font-size:0.78rem">${esc(d.credor)}</td>
                    <td style="text-align:right;color:var(--danger)">${formatCurrency(d.saldo)}</td>
                  </tr>`).join('')}
                </tbody>
              </table>`}
        </div>

        <!-- Exportação para o programa IRPF -->
        <div style="background:rgba(29,158,117,.08);border:1px solid rgba(29,158,117,.2);border-radius:8px;padding:12px 16px;font-size:0.8rem;color:var(--text-2);line-height:1.6">
          <i class="ti ti-table-export" style="color:var(--accent)"></i>
          <strong>Exportar para o programa da Receita Federal:</strong>
          O botão <em>Exportar CSV</em> gera um arquivo com os dados organizados por ficha (Rendimentos, Deduções, Bens, Dívidas).
          Use-o como guia para preencher o programa IRPF da RFB. O formato <code>.DEC</code> de importação direta é proprietário
          e não documentado pela Receita Federal, por isso não é suportado.
        </div>

        <!-- Aviso legal -->
        <div style="background:rgba(239,159,39,.08);border:1px solid rgba(239,159,39,.25);border-radius:8px;padding:12px 16px;font-size:0.8rem;color:var(--text-2);line-height:1.6">
          <i class="ti ti-alert-triangle" style="color:var(--warning)"></i>
          <strong>Atenção:</strong> Este informe é gerado com base nos dados lançados no Fina e tem caráter auxiliar.
          Consulte os informes oficiais das suas instituições financeiras e, se necessário, um contador antes de submeter a declaração à Receita Federal.
        </div>

      </div>
    `;
  }

  await fetchAndRender();
}

function sectionCard(
  title: string,
  icon: string,
  color: string,
  items: { category: string; total: number }[],
  total: number,
  emptyMsg: string,
): string {
  return `
    <div class="card">
      <div class="card-header">
        <span style="display:flex;align-items:center;gap:8px">
          <i class="ti ${icon}" style="color:${color}"></i> ${title}
        </span>
        <span style="font-weight:600">${formatCurrency(total)}</span>
      </div>
      <div class="card-hr"></div>
      ${items.length === 0
        ? `<div class="empty" style="padding:16px"><div class="empty-title" style="font-size:0.82rem">${emptyMsg}</div></div>`
        : `<table class="table">
            <tbody>
              ${items.map(i => `<tr>
                <td>${esc(i.category)}</td>
                <td style="text-align:right;font-weight:500">${formatCurrency(i.total)}</td>
              </tr>`).join('')}
            </tbody>
          </table>`}
    </div>`;
}

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
