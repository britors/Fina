import { invoke } from '../api';

type AIProvider = 'openai' | 'gemini';

interface AISettings {
  provider: AIProvider;
}

interface SummaryPreview {
  fieldsShared: string[];
  fieldsNotShared: string[];
  summary: {
    expenses_by_category_current_month: { category: string; total: number }[];
  };
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

      <div class="card" style="margin-top:16px">
        <div class="card-header">Perguntar ao assistente</div>
        <div class="card-hr"></div>
        <div class="card-body">
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px">
            ${quickQuestions(preview).map(q => `<button type="button" class="badge ai-quick-question" style="cursor:pointer;border:0.5px solid var(--border);background:var(--bg)">${esc(q)}</button>`).join('')}
          </div>
          <div class="form-group">
            <label class="form-label">Pergunta</label>
            <textarea class="form-ctrl" id="ai-question" rows="3" placeholder="Ex: Como posso melhorar minha situação financeira nos próximos 3 meses?"></textarea>
          </div>
          <label style="display:flex;align-items:flex-start;gap:10px;margin-bottom:14px;color:var(--text-2);line-height:1.5">
            <input id="ai-send-consent" type="checkbox" style="margin-top:3px;accent-color:var(--accent)">
            <span>Confirmo o envio do resumo financeiro agregado para ${settings.provider === 'openai' ? 'OpenAI' : 'Google/Gemini'} nesta pergunta.</span>
          </label>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn btn-primary" id="btn-ask-ai"><i class="ti ti-send"></i> Enviar pergunta</button>
            <button class="btn btn-secondary" id="btn-monthly-summary"><i class="ti ti-file-text"></i> Gerar resumo do mês</button>
          </div>
          <div id="ai-result" style="margin-top:18px">${answer ? answerBlock(answer) : ''}</div>
        </div>
      </div>
    `;

    el.querySelector('#btn-ask-ai')?.addEventListener('click', ask);
    el.querySelector('#btn-monthly-summary')?.addEventListener('click', generateMonthlySummary);
    el.querySelectorAll<HTMLButtonElement>('.ai-quick-question').forEach(btn => {
      btn.addEventListener('click', () => {
        const textarea = el.querySelector<HTMLTextAreaElement>('#ai-question')!;
        textarea.value = btn.textContent ?? '';
        textarea.focus();
      });
    });
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

  async function generateMonthlySummary(): Promise<void> {
    const btn = el.querySelector<HTMLButtonElement>('#btn-monthly-summary')!;
    const consentConfirmed = el.querySelector<HTMLInputElement>('#ai-send-consent')!.checked;
    if (!consentConfirmed) {
      alert('Confirme o consentimento de envio antes de gerar o resumo.');
      return;
    }
    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-loader ti-spin"></i> Gerando...';
    try {
      answer = await invoke<AIAnswer>('ai:summary', { consentConfirmed });
      await renderPage();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Não foi possível gerar o resumo do mês.');
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-file-text"></i> Gerar resumo do mês';
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

function quickQuestions(preview: SummaryPreview): string[] {
  const topCategory = preview.summary.expenses_by_category_current_month[0]?.category;
  const questions = [
    'Por que meu score caiu esse mês?',
    'Minha reserva de emergência está no nível ideal?',
    'Como está minha situação financeira geral esse mês?',
  ];
  if (topCategory) {
    questions.splice(1, 0, `Como reduzir despesas em ${topCategory}?`);
  }
  return questions;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
