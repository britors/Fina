import { invoke } from '../api';
import { formatDate } from '../../shared/utils';
import { showAlert, showConfirm } from '../components/alertDialog';

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

interface AIConversation {
  id: string;
  question: string;
  answer: string;
  provider: AIProvider;
  model: string;
  created_at: string;
}

export async function render(el: HTMLElement): Promise<void> {
  let settings = await invoke<AISettings>('ai:getSettings');
  let preview = await invoke<SummaryPreview>('ai:getSummaryPreview');
  let history = await invoke<AIConversation[]>('ai:history');
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
            ${quickQuestions(preview).map(q => `<button type="button" class="badge ai-quick-question" style="cursor:pointer;border:0.5px solid var(--border);background:var(--bg);color:var(--text-2)">${esc(q)}</button>`).join('')}
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
            <button class="btn btn-secondary btn-summary" data-period="day"><i class="ti ti-file-text"></i> Resumo do dia</button>
            <button class="btn btn-secondary btn-summary" data-period="week"><i class="ti ti-file-text"></i> Resumo da semana</button>
            <button class="btn btn-secondary btn-summary" data-period="month"><i class="ti ti-file-text"></i> Resumo do mês</button>
          </div>
          <div id="ai-result" style="margin-top:18px">${answer ? answerBlock(answer) : ''}</div>
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="card-header">
          <span>Histórico de perguntas</span>
          ${history.length > 0 ? `<button class="btn btn-secondary btn-sm" id="btn-clear-history"><i class="ti ti-trash"></i> Limpar histórico</button>` : ''}
        </div>
        <div class="card-hr"></div>
        <div class="card-body">
          ${history.length === 0 ? `
            <div class="empty" style="padding:12px 0">
              <div class="empty-title">Nenhuma pergunta registrada ainda</div>
            </div>
          ` : history.map(historyItem).join('')}
        </div>
      </div>
    `;

    el.querySelector('#btn-ask-ai')?.addEventListener('click', ask);
    el.querySelectorAll<HTMLButtonElement>('.btn-summary').forEach(btn => {
      btn.addEventListener('click', () => generateSummary(btn.dataset.period as 'day' | 'week' | 'month', btn));
    });
    el.querySelector('#btn-clear-history')?.addEventListener('click', clearHistory);
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
      history = await invoke<AIConversation[]>('ai:history');
      await renderPage();
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Não foi possível consultar o assistente.');
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-send"></i> Enviar pergunta';
    }
  }

  async function clearHistory(): Promise<void> {
    if (!await showConfirm('Apagar todo o histórico de perguntas e respostas?', { danger: true, okLabel: 'Apagar' })) return;
    await invoke('ai:clearHistory');
    history = [];
    await renderPage();
  }

  const SUMMARY_LABELS: Record<'day' | 'week' | 'month', string> = {
    day: 'Resumo do dia',
    week: 'Resumo da semana',
    month: 'Resumo do mês',
  };

  async function generateSummary(period: 'day' | 'week' | 'month', btn: HTMLButtonElement): Promise<void> {
    const consentConfirmed = el.querySelector<HTMLInputElement>('#ai-send-consent')!.checked;
    if (!consentConfirmed) {
      showAlert('Confirme o consentimento de envio antes de gerar o resumo.');
      return;
    }
    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-loader ti-spin"></i> Gerando...';
    try {
      answer = period === 'month'
        ? await invoke<AIAnswer>('ai:summary', { consentConfirmed })
        : await invoke<AIAnswer>('ai:periodSummary', { period, consentConfirmed });
      await renderPage();
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'Não foi possível gerar o resumo.');
      btn.disabled = false;
      btn.innerHTML = `<i class="ti ti-file-text"></i> ${SUMMARY_LABELS[period]}`;
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

function historyItem(item: AIConversation): string {
  const when = `${formatDate(item.created_at.slice(0, 10))} ${item.created_at.slice(11, 16)}`;
  return `
    <details style="margin-bottom:10px;padding-bottom:10px;border-bottom:0.5px solid var(--border)">
      <summary style="cursor:pointer;color:var(--text-2)">
        <span style="color:var(--text-3);font-size:0.76rem">${when}</span> — ${esc(item.question)}
      </summary>
      <div style="white-space:pre-wrap;margin-top:8px;color:var(--text-3);line-height:1.6">${esc(item.answer)}</div>
    </details>
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
