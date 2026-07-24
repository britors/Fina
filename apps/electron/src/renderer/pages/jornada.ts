const STORAGE_KEY = 'fina.journey.completedSteps';

interface Step {
  id: string;
  title: string;
  body: string;
  route: string;
  action: string;
  icon: string;
}

const STEPS: Step[] = [
  {
    id: 'diagnosis',
    title: 'Entender a situação atual',
    body: 'Veja renda, despesas, dívidas, reserva e patrimônio líquido em uma leitura única.',
    route: 'diagnostico',
    action: 'Abrir diagnóstico',
    icon: 'ti-stethoscope',
  },
  {
    id: 'organize',
    title: 'Organizar contas e lançamentos',
    body: 'Cadastre contas e mantenha transações atualizadas para o Fina refletir a realidade.',
    route: 'transactions',
    action: 'Organizar transações',
    icon: 'ti-transfer',
  },
  {
    id: 'leaks',
    title: 'Identificar vazamentos',
    body: 'Use orçamento, relatórios e alertas para encontrar categorias que estão pesando.',
    route: 'alertas',
    action: 'Ver alertas',
    icon: 'ti-alert-triangle',
  },
  {
    id: 'debts',
    title: 'Montar plano contra dívidas',
    body: 'Compare estratégias e defina onde colocar pagamentos extras primeiro.',
    route: 'plano-dividas',
    action: 'Planejar quitação',
    icon: 'ti-route',
  },
  {
    id: 'reserve',
    title: 'Construir reserva de emergência',
    body: 'Defina um objetivo de 3, 6 ou 12 meses de despesas e acompanhe o progresso.',
    route: 'reserva',
    action: 'Calcular reserva',
    icon: 'ti-shield',
  },
  {
    id: 'growth',
    title: 'Aumentar patrimônio',
    body: 'Projete aportes, acompanhe investimentos e conecte metas ao crescimento financeiro.',
    route: 'simulador-patrimonio',
    action: 'Simular patrimônio',
    icon: 'ti-trending-up',
  },
];

export function render(el: HTMLElement): void {
  let completed = readCompleted();

  function renderPage(): void {
    const done = STEPS.filter(step => completed.has(step.id)).length;
    const pct = (done / STEPS.length) * 100;

    el.innerHTML = `
      <div class="card" style="margin-bottom:20px">
        <div class="card-body">
          <div style="display:flex;justify-content:space-between;gap:16px;margin-bottom:10px">
            <div>
              <div style="font-size:1.15rem;font-weight:700">Jornada financeira</div>
              <div style="font-size:0.85rem;color:var(--text-3);margin-top:3px">Siga os passos para sair da desorganização e avançar até crescimento patrimonial.</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:1.4rem;font-weight:700;color:var(--accent)">${done}/${STEPS.length}</div>
              <div style="font-size:0.75rem;color:var(--text-3)">etapas concluídas</div>
            </div>
          </div>
          <div class="prog-track" style="height:10px;margin:0">
            <div class="prog-fill" style="width:${pct.toFixed(0)}%;background:var(--accent)"></div>
          </div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:12px">
        ${STEPS.map((step, index) => stepCard(step, index, completed.has(step.id))).join('')}
      </div>
    `;

    el.querySelectorAll<HTMLInputElement>('[data-step-check]').forEach(input => {
      input.addEventListener('change', () => {
        const id = input.dataset.stepCheck!;
        if (input.checked) completed.add(id);
        else completed.delete(id);
        writeCompleted(completed);
        renderPage();
      });
    });
  }

  renderPage();
}

function stepCard(step: Step, index: number, done: boolean): string {
  return `
    <div class="card" style="${done ? 'border-color:rgba(29,158,117,.45)' : ''}">
      <div class="card-body" style="display:flex;align-items:flex-start;gap:14px">
        <label style="display:flex;align-items:center;gap:12px;flex:1;cursor:pointer">
          <input type="checkbox" data-step-check="${step.id}" ${done ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--accent);flex-shrink:0">
          <div style="width:38px;height:38px;border-radius:9px;background:${done ? 'rgba(29,158,117,.16)' : 'var(--bg)'};display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <i class="ti ${step.icon}" style="color:${done ? 'var(--accent)' : 'var(--text-3)'};font-size:1.15rem"></i>
          </div>
          <div style="flex:1">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <span class="badge ${done ? 'badge-confirmed' : 'badge-pending'}">${index + 1}</span>
              <strong>${step.title}</strong>
            </div>
            <div style="font-size:0.82rem;color:var(--text-3);line-height:1.55">${step.body}</div>
          </div>
        </label>
        <a class="btn btn-secondary btn-sm" href="#${step.route}" style="flex-shrink:0">${step.action}</a>
      </div>
    </div>
  `;
}

function readCompleted(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? new Set(parsed.filter(v => typeof v === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

function writeCompleted(completed: Set<string>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...completed]));
}
