import { invoke } from '../api';
import { openModal } from './modal';
import { showAlert } from './alertDialog';
import type { AICreateDraft, AICreateDraftTarget } from '../../shared/types';

type AIProvider = 'openai' | 'gemini';

interface AISettingsLite {
  enabled: boolean;
  provider: AIProvider;
}

interface Options<T extends AICreateDraft> {
  target: AICreateDraftTarget;
  title: string;
  placeholder: string;
  onDraft: (draft: T) => void;
}

export async function openAICreateDraft<T extends AICreateDraft>(opts: Options<T>): Promise<void> {
  const settings = await invoke<AISettingsLite>('ai:getSettings');
  if (!settings.enabled) {
    await showAlert('Ative a IA em Configurações > IA para usar este recurso.');
    return;
  }

  openModal({
    title: opts.title,
    saveLabel: 'Gerar rascunho',
    body: `
      <div class="form-group">
        <label class="form-label">Descreva o que criar</label>
        <textarea class="form-ctrl" id="ai-create-prompt" rows="4" placeholder="${esc(opts.placeholder)}"></textarea>
      </div>
      <div style="background:rgba(239,159,39,.08);border:1px solid rgba(239,159,39,.25);border-radius:8px;padding:12px;font-size:0.8rem;color:var(--text-2);line-height:1.6;margin-bottom:12px">
        A IA vai gerar apenas um rascunho. Nada será salvo automaticamente; revise o formulário e confirme em Salvar.
      </div>
      <label style="display:flex;align-items:flex-start;gap:10px;color:var(--text-2);font-size:0.84rem">
        <input type="checkbox" id="ai-create-consent" style="margin-top:3px;accent-color:var(--accent)">
        <span>Confirmo o envio do pedido em texto e do resumo financeiro agregado para ${settings.provider === 'openai' ? 'OpenAI' : 'Google/Gemini'}.</span>
      </label>
      <div id="ai-create-result" style="margin-top:12px"></div>
    `,
    onSave: async overlay => {
      const prompt = overlay.querySelector<HTMLTextAreaElement>('#ai-create-prompt')!.value.trim();
      const consent = overlay.querySelector<HTMLInputElement>('#ai-create-consent')!.checked;
      const resultEl = overlay.querySelector<HTMLElement>('#ai-create-result')!;
      if (!prompt) {
        resultEl.innerHTML = `<div style="color:var(--danger);font-size:0.82rem">Descreva o que você quer criar.</div>`;
        return false;
      }
      if (!consent) {
        resultEl.innerHTML = `<div style="color:var(--danger);font-size:0.82rem">Confirme o consentimento para continuar.</div>`;
        return false;
      }

      const saveBtn = overlay.querySelector<HTMLButtonElement>('[data-save]')!;
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="ti ti-loader ti-spin"></i> Gerando...';
      try {
        const draft = await invoke<T>('ai:createDraft', { target: opts.target, prompt, consentConfirmed: true });
        overlay.remove();
        opts.onDraft(draft);
      } catch (err) {
        resultEl.innerHTML = `<div style="color:var(--danger);font-size:0.82rem">${esc(err instanceof Error ? err.message : 'Não foi possível gerar o rascunho.')}</div>`;
        saveBtn.disabled = false;
        saveBtn.innerHTML = 'Gerar rascunho';
      }
      return false;
    },
  });
}

export function aiDraftNotice(draft: AICreateDraft): string {
  const warnings = draft.warnings.length
    ? `<ul style="margin:8px 0 0 18px;color:var(--warning);font-size:0.78rem;line-height:1.5">${draft.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>`
    : '';
  return `
    <div style="background:rgba(29,158,117,.08);border:1px solid rgba(29,158,117,.2);border-radius:8px;padding:12px;margin-bottom:12px">
      <div style="font-size:0.82rem;color:var(--text-2);line-height:1.5">
        <strong style="color:var(--accent)">Rascunho gerado por IA.</strong> ${esc(draft.explanation)}
      </div>
      ${warnings}
    </div>
  `;
}

function esc(s?: string | null): string {
  return (s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g, '&quot;');
}
