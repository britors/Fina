import { invoke } from '../api';
import { formatCurrency } from '../../shared/utils';
import { setTopbarActions } from '../components/topbar';
import { showAlert } from '../components/alertDialog';
import type { IRPFReport, IRPFImportPreview } from '../../shared/types';

export async function render(el: HTMLElement): Promise<void> {
  const currentYear = new Date().getFullYear();
  let year = currentYear - 1;
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
    <button class="btn btn-secondary" id="btn-irpf-import">
      <i class="ti ti-upload"></i> Importar ano anterior
    </button>
    <details class="topbar-dropdown">
      <summary class="btn btn-primary"><i class="ti ti-download"></i> Exportar <i class="ti ti-chevron-down" style="font-size:11px"></i></summary>
      <div class="topbar-dropdown-menu">
        <button class="dd-item" id="btn-irpf-csv" disabled><i class="ti ti-table-export"></i> Exportar CSV</button>
        <button class="dd-item" id="btn-irpf-pdf" disabled><i class="ti ti-file-type-pdf"></i> Exportar PDF</button>
      </div>
    </details>
  `);

  document.getElementById('irpf-year')?.addEventListener('change', (e) => {
    year = parseInt((e.target as HTMLSelectElement).value);
  });

  document.getElementById('btn-irpf-load')?.addEventListener('click', fetchAndRender);

  document.getElementById('btn-irpf-import')?.addEventListener('click', () => { void openImportModal(); });

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

async function openImportModal(): Promise<void> {
  const accounts = await invoke<{ id: string; name: string }[]>('accounts:list');
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:620px">
      <div class="modal-header">
        <span class="modal-title"><i class="ti ti-upload"></i> Importar declaração de ano anterior</span>
        <button class="btn btn-ghost btn-sm modal-close"><i class="ti ti-x"></i></button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
        <div style="background:rgba(29,158,117,.08);border:1px solid rgba(29,158,117,.2);border-radius:8px;padding:12px;font-size:0.82rem;color:var(--text-2);line-height:1.6">
          <i class="ti ti-info-circle" style="color:var(--accent)"></i>
          Selecione o CSV exportado pelo Fina (botão <strong>Exportar CSV</strong>) de um ano anterior.
          Os rendimentos e deduções serão criados como transações em 31/12 do ano selecionado.
          Bens e dívidas serão adicionados ao cadastro se ainda não existirem.
          <br><br>
          Não tem o CSV? <button class="btn btn-ghost btn-sm" id="btn-dl-template" style="font-size:0.78rem;padding:2px 8px">
            <i class="ti ti-download"></i> Baixar modelo CSV
          </button>
        </div>
        <div class="form-row">
          <div class="form-group" style="flex:1">
            <label class="form-label">Arquivo CSV *</label>
            <input class="form-ctrl" id="imp-file" type="file" accept=".csv">
          </div>
          <div class="form-group" style="flex:0 0 120px">
            <label class="form-label">Ano-calendário *</label>
            <input class="form-ctrl" id="imp-year" type="number" min="2000" max="${new Date().getFullYear() - 1}" value="${new Date().getFullYear() - 1}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Meio de pagamento para lançar os rendimentos *</label>
          <select class="form-ctrl" id="imp-account">
            <option value="">— Selecione —</option>
            ${accounts.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}
          </select>
        </div>
        <div id="imp-preview"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary modal-close">Cancelar</button>
        <button class="btn btn-secondary" id="btn-imp-preview-irpf">
          <i class="ti ti-eye"></i> Pré-visualizar
        </button>
        <button class="btn btn-primary" id="btn-imp-confirm-irpf" disabled>
          <i class="ti ti-check"></i> Importar
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.querySelectorAll('.modal-close').forEach(b => b.addEventListener('click', () => overlay.remove()));

  overlay.querySelector('#btn-dl-template')?.addEventListener('click', () => invoke('irpf:downloadTemplate'));

  let previewData: IRPFImportPreview | null = null;

  overlay.querySelector('#btn-imp-preview-irpf')?.addEventListener('click', async () => {
    const fileInput = overlay.querySelector<HTMLInputElement>('#imp-file')!;
    const file = fileInput.files?.[0];
    if (!file) { showAlert('Selecione um arquivo CSV.'); return; }
    const filePath = (file as File & { path?: string }).path ?? '';
    if (!filePath) { showAlert('Não foi possível ler o caminho do arquivo.'); return; }

    previewData = await invoke<IRPFImportPreview>('irpf:previewImport', filePath);
    const pvEl = overlay.querySelector('#imp-preview')!;
    pvEl.innerHTML = `
      <div style="font-size:0.82rem;font-weight:600;color:var(--text-2);margin-bottom:8px">Prévia dos dados:</div>
      <div class="grid-2" style="gap:10px;font-size:0.8rem">
        ${previewRow('Rendimentos', previewData.total_rendimentos, previewData.rendimentos.length)}
        ${previewRow('Deduções', previewData.total_deducoes, previewData.deducoes.length)}
        ${previewRow('Bens e Direitos', previewData.total_bens, previewData.bens.length)}
        ${previewRow('Dívidas', previewData.total_dividas, previewData.dividas.length)}
      </div>`;

    const confirmBtn = overlay.querySelector<HTMLButtonElement>('#btn-imp-confirm-irpf')!;
    confirmBtn.disabled = (previewData.rendimentos.length + previewData.deducoes.length + previewData.bens.length + previewData.dividas.length) === 0;
  });

  overlay.querySelector('#btn-imp-confirm-irpf')?.addEventListener('click', async () => {
    if (!previewData) return;
    const accountId = (overlay.querySelector<HTMLSelectElement>('#imp-account')!).value;
    const importYear = parseInt((overlay.querySelector<HTMLInputElement>('#imp-year')!).value);
    if (!accountId) { showAlert('Selecione o meio de pagamento de destino.'); return; }
    if (!importYear) { showAlert('Informe o ano.'); return; }

    const result = await invoke<{ imported: number }>('irpf:confirmImport', { preview: previewData, year: importYear, accountId });
    overlay.remove();
    showAlert(`Importação concluída: ${result.imported} registros criados no Fina.`);
  });
}

function previewRow(label: string, total: number, count: number): string {
  return `<div class="card" style="padding:10px 14px">
    <div style="font-size:0.75rem;color:var(--text-3)">${label} (${count})</div>
    <div style="font-weight:600;margin-top:2px">${formatCurrency(total)}</div>
  </div>`;
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
