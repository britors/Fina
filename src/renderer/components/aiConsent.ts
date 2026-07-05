import { invoke } from '../api';
import { openModal } from './modal';
import { showAlert } from './alertDialog';

type AIProvider = 'openai' | 'gemini';

interface AISettingsLite {
  enabled: boolean;
  provider: AIProvider;
}

interface AIAnswer {
  provider: AIProvider;
  model: string;
  answer: string;
  disclaimer: string;
}

export interface AIActionOptions {
  title: string;
  consentText: string;
  channel: string;
  payload?: Record<string, unknown>;
}

// Fluxo reutilizável para ações pontuais de IA fora da tela Assistente IA
// (ex: detalhar uma decisão, rascunhar uma renegociação): mostra o que será
// enviado, exige confirmação por ação e chama o handler informado.
export async function runAIAction(opts: AIActionOptions): Promise<void> {
  const settings = await invoke<AISettingsLite>('ai:getSettings');
  if (!settings.enabled) {
    await showAlert('Ative a IA em Configurações > IA para usar este recurso.');
    return;
  }

  openModal({
    title: opts.title,
    body: `
      <p style="color:var(--text-2);line-height:1.6;margin-bottom:14px">${opts.consentText}</p>
      <label style="display:flex;align-items:flex-start;gap:10px;color:var(--text-2)">
        <input type="checkbox" id="ai-action-consent" style="margin-top:3px;accent-color:var(--accent)">
        <span>Confirmo o envio do resumo agregado para ${settings.provider === 'openai' ? 'OpenAI' : 'Google/Gemini'}.</span>
      </label>
      <div id="ai-action-result" style="margin-top:16px"></div>
    `,
    saveLabel: 'Gerar',
    onSave: async overlay => {
      const checkbox = overlay.querySelector<HTMLInputElement>('#ai-action-consent')!;
      const resultEl = overlay.querySelector<HTMLElement>('#ai-action-result')!;
      if (!checkbox.checked) {
        resultEl.innerHTML = `<div style="color:var(--danger);font-size:0.82rem">Confirme o consentimento para continuar.</div>`;
        return false;
      }

      const saveBtn = overlay.querySelector<HTMLButtonElement>('[data-save]')!;
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="ti ti-loader ti-spin"></i> Gerando...';
      try {
        const result = await invoke<AIAnswer>(opts.channel, { ...opts.payload, consentConfirmed: true });
        resultEl.innerHTML = `
          <div style="background:var(--bg);border:0.5px solid var(--border);border-radius:8px;padding:14px;white-space:pre-wrap;line-height:1.7;color:var(--text-2)">${esc(result.answer)}</div>
          <div style="margin-top:10px;font-size:0.76rem;color:var(--warning)">${esc(result.disclaimer)}</div>
        `;
        overlay.querySelector('.modal-footer')?.remove();
      } catch (err) {
        resultEl.innerHTML = `<div style="color:var(--danger);font-size:0.82rem">${esc(err instanceof Error ? err.message : 'Não foi possível consultar o assistente.')}</div>`;
        saveBtn.disabled = false;
        saveBtn.innerHTML = 'Gerar';
      }
      return false;
    },
  });
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
