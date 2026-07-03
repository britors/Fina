import { invoke } from '../api';

type AIProvider = 'openai' | 'gemini';

interface AISettings {
  enabled: boolean;
  provider: AIProvider;
  model: string;
  consent: boolean;
  hasKey: boolean;
  encryptionAvailable: boolean;
}

interface SummaryPreview {
  fieldsShared: string[];
  fieldsNotShared: string[];
}

interface AIAnswer {
  provider: AIProvider;
  model: string;
  answer: string;
  disclaimer: string;
}

export async function render(el: HTMLElement): Promise<void> {
  let settings = await invoke<AISettings>('ai:getSettings');
  let preview = await invoke<SummaryPreview>('ai:getSummaryPreview');
  let answer: AIAnswer | null = null;

  async function renderPage(): Promise<void> {
    el.innerHTML = `
      <div class="grid-2" style="grid-template-columns:.9fr 1.1fr">
        <div class="card">
          <div class="card-header">Configuração rápida</div>
          <div class="card-hr"></div>
          <div class="card-body">
            ${!settings.encryptionAvailable ? `
              <div class="alert alert-error">A criptografia segura do sistema não está disponível. A chave de IA não poderá ser salva.</div>
            ` : ''}
            <div class="form-group">
              <label class="form-label">Provedor</label>
              <select class="form-ctrl" id="ai-provider">
                <option value="openai" ${settings.provider === 'openai' ? 'selected' : ''}>ChatGPT / OpenAI</option>
                <option value="gemini" ${settings.provider === 'gemini' ? 'selected' : ''}>Gemini / Google</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Modelo</label>
              <input class="form-ctrl" id="ai-model" value="${esc(settings.model)}">
            </div>
            <div class="form-group">
              <label class="form-label">API key ${settings.hasKey ? '(salva)' : ''}</label>
              <input class="form-ctrl" id="ai-key" type="password" placeholder="${settings.hasKey ? 'Digite uma nova chave para substituir' : 'Cole sua chave de API'}">
            </div>
            <label style="display:flex;align-items:flex-start;gap:10px;margin-bottom:12px;color:var(--text-2);line-height:1.5">
              <input id="ai-enabled" type="checkbox" ${settings.enabled ? 'checked' : ''} style="margin-top:3px;accent-color:var(--accent)">
              <span>Ativar assistente de IA</span>
            </label>
            <label style="display:flex;align-items:flex-start;gap:10px;margin-bottom:16px;color:var(--text-2);line-height:1.5">
              <input id="ai-consent" type="checkbox" ${settings.consent ? 'checked' : ''} style="margin-top:3px;accent-color:var(--accent)">
              <span>Entendo que dados financeiros agregados poderão ser enviados ao provedor escolhido quando eu solicitar uma análise.</span>
            </label>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-primary" id="btn-save-ai"><i class="ti ti-device-floppy"></i> Salvar</button>
              <button class="btn btn-ghost" id="btn-clear-key"><i class="ti ti-key-off"></i> Remover chave</button>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">Privacidade dos dados</div>
          <div class="card-hr"></div>
          <div class="card-body" style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
            <div>
              <div style="font-weight:600;margin-bottom:8px;color:var(--accent)">Enviado somente com consentimento</div>
              <ul style="padding-left:18px;color:var(--text-2);line-height:1.7">
                ${preview.fieldsShared.map(f => `<li>${esc(f)}</li>`).join('')}
              </ul>
            </div>
            <div>
              <div style="font-weight:600;margin-bottom:8px;color:var(--danger)">Não enviado por padrão</div>
              <ul style="padding-left:18px;color:var(--text-2);line-height:1.7">
                ${preview.fieldsNotShared.map(f => `<li>${esc(f)}</li>`).join('')}
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">Perguntar ao assistente</div>
        <div class="card-hr"></div>
        <div class="card-body">
          <div class="form-group">
            <label class="form-label">Pergunta</label>
            <textarea class="form-ctrl" id="ai-question" rows="3" placeholder="Ex: Como posso melhorar minha situação financeira nos próximos 3 meses?"></textarea>
          </div>
          <label style="display:flex;align-items:flex-start;gap:10px;margin-bottom:14px;color:var(--text-2);line-height:1.5">
            <input id="ai-send-consent" type="checkbox" style="margin-top:3px;accent-color:var(--accent)">
            <span>Confirmo o envio do resumo financeiro agregado para ${settings.provider === 'openai' ? 'OpenAI' : 'Google/Gemini'} nesta pergunta.</span>
          </label>
          <button class="btn btn-primary" id="btn-ask-ai"><i class="ti ti-send"></i> Enviar pergunta</button>
          <div id="ai-result" style="margin-top:18px">${answer ? answerBlock(answer) : ''}</div>
        </div>
      </div>
    `;

    el.querySelector('#btn-save-ai')?.addEventListener('click', saveSettings);
    el.querySelector('#btn-clear-key')?.addEventListener('click', clearKey);
    el.querySelector('#btn-ask-ai')?.addEventListener('click', ask);
  }

  async function saveSettings(): Promise<void> {
    const provider = (el.querySelector<HTMLSelectElement>('#ai-provider')!).value as AIProvider;
    const model = el.querySelector<HTMLInputElement>('#ai-model')!.value.trim();
    const enabled = el.querySelector<HTMLInputElement>('#ai-enabled')!.checked;
    const consent = el.querySelector<HTMLInputElement>('#ai-consent')!.checked;
    const apiKey = el.querySelector<HTMLInputElement>('#ai-key')!.value.trim();
    settings = await invoke<AISettings>('ai:saveSettings', { provider, model, enabled, consent });
    if (apiKey) settings = await invoke<AISettings>('ai:setApiKey', { provider, apiKey });
    alert('Configurações de IA salvas.');
    await renderPage();
  }

  async function clearKey(): Promise<void> {
    if (!confirm('Remover a chave de API salva para o provedor atual?')) return;
    settings = await invoke<AISettings>('ai:clearApiKey', settings.provider);
    await renderPage();
  }

  async function ask(): Promise<void> {
    const btn = el.querySelector<HTMLButtonElement>('#btn-ask-ai')!;
    const question = el.querySelector<HTMLTextAreaElement>('#ai-question')!.value.trim();
    const consentConfirmed = el.querySelector<HTMLInputElement>('#ai-send-consent')!.checked;
    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-loader ti-spin"></i> Consultando...';
    try {
      answer = await invoke<AIAnswer>('ai:ask', { question, consentConfirmed });
      await renderPage();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Não foi possível consultar o assistente.');
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-send"></i> Enviar pergunta';
    }
  }

  await renderPage();
}

function answerBlock(answer: AIAnswer): string {
  return `
    <div style="background:var(--bg);border:0.5px solid var(--border);border-radius:8px;padding:16px">
      <div style="font-size:0.78rem;color:var(--text-3);margin-bottom:10px">
        Provedor: ${answer.provider === 'openai' ? 'OpenAI' : 'Gemini'} · Modelo: ${esc(answer.model)}
      </div>
      <div style="white-space:pre-wrap;line-height:1.7;color:var(--text-2)">${esc(answer.answer)}</div>
      <div style="margin-top:12px;font-size:0.78rem;color:var(--warning)">${esc(answer.disclaimer)}</div>
    </div>
  `;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
