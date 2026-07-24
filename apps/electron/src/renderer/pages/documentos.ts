import { invoke } from '../api';
import type { FinancialDocument } from '../../shared/types';

export async function render(el: HTMLElement): Promise<void> {
  let documents = await invoke<FinancialDocument[]>('documents:list');
  const draw = (): void => {
    el.innerHTML = `<div class="card" style="margin-bottom:20px"><div class="card-header"><i class="ti ti-lock"></i> Cofre local</div><div class="card-hr"></div><div class="card-body"><p style="color:var(--text-2);font-size:.85rem">Seus comprovantes ficam no computador e não são enviados a terceiros.</p><button class="btn btn-primary" id="document-import"><i class="ti ti-upload"></i> Importar documentos</button></div></div>
      <div class="card"><div class="card-header">${documents.length} documento${documents.length === 1 ? '' : 's'}</div><div class="card-hr"></div><div class="card-body">${documents.length ? `<div style="display:flex;flex-direction:column;gap:8px">${documents.map(documentRow).join('')}</div>` : '<div class="empty"><i class="ti ti-folder-off"></i><div class="empty-title">Nenhum documento</div><p>Importe um comprovante para começar.</p></div>'}</div></div>`;
    el.querySelector('#document-import')?.addEventListener('click', async () => {
      const result = await invoke<{ canceled: boolean; filePaths: string[] }>('dialog:openDocument');
      if (result.canceled) return;
      for (const file of result.filePaths) await invoke('documents:import', file);
      documents = await invoke<FinancialDocument[]>('documents:list'); draw();
    });
    el.querySelectorAll<HTMLElement>('[data-open-document]').forEach(button => button.addEventListener('click', () => invoke('documents:open', button.dataset.openDocument)));
    el.querySelectorAll<HTMLElement>('[data-delete-document]').forEach(button => button.addEventListener('click', async () => {
      if (!window.confirm('Remover este documento do cofre?')) return;
      await invoke('documents:delete', button.dataset.deleteDocument); documents = await invoke<FinancialDocument[]>('documents:list'); draw();
    }));
  };
  draw();
}

function documentRow(doc: FinancialDocument): string {
  const size = doc.size_bytes < 1024 * 1024 ? `${Math.max(1, Math.round(doc.size_bytes / 1024))} KB` : `${(doc.size_bytes / 1024 / 1024).toFixed(1)} MB`;
  return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:0.5px solid var(--border)"><i class="ti ti-file-description" style="color:var(--accent);font-size:1.2rem"></i><div style="flex:1"><strong>${escapeHtml(doc.filename)}</strong><div style="font-size:.76rem;color:var(--text-3)">${size} · ${new Date(doc.created_at).toLocaleDateString('pt-BR')}</div></div><button class="btn btn-ghost btn-sm" data-open-document="${doc.id}">Abrir</button><button class="btn btn-ghost btn-sm" data-delete-document="${doc.id}" aria-label="Remover">Remover</button></div>`;
}

function escapeHtml(value: string): string { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
