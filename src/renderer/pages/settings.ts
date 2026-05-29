import { invoke, send } from '../api';
import { setTopbarActions } from '../components/topbar';
import { applyAccent, applyTheme } from '../theme';

type Settings = Record<string, string>;

export async function render(el: HTMLElement): Promise<void> {
  setTopbarActions('');

  const settings = await invoke<Settings>('settings:getAll');
  const dbPath   = await invoke<string>('db:path').catch(() => '—');

  let activeSection = 'profile';

  const sections: { id: string; label: string }[] = [
    { id: 'profile',       label: 'Perfil'           },
    { id: 'appearance',    label: 'Aparência'         },
    { id: 'notifications', label: 'Notificações'      },
    { id: 'data',          label: 'Dados e backup'    },
    { id: 'about',         label: 'Sobre'             },
  ];

  function buildLayout(): void {
    el.innerHTML = `
      <div class="settings-layout" style="height:calc(100vh - 68px - 48px)">
        <div class="settings-subnav">
          ${sections.map(s => `
            <a class="${activeSection === s.id ? 'active' : ''}" data-sec="${s.id}">${s.label}</a>
          `).join('')}
        </div>
        <div class="settings-content" id="settings-content"></div>
      </div>
    `;

    el.querySelectorAll<HTMLElement>('[data-sec]').forEach(a => {
      a.addEventListener('click', () => {
        activeSection = a.dataset.sec!;
        buildLayout();
      });
    });

    const content = el.querySelector<HTMLElement>('#settings-content')!;
    renderSection(content, activeSection, settings, dbPath);
  }

  buildLayout();
}

function renderSection(el: HTMLElement, id: string, s: Settings, dbPath: string): void {
  if (id === 'profile')       renderProfile(el, s);
  else if (id === 'appearance')    renderAppearance(el, s);
  else if (id === 'notifications') renderNotifications(el, s);
  else if (id === 'data')     renderData(el, s, dbPath);
  else if (id === 'about')    renderAbout(el);
}

function renderProfile(el: HTMLElement, s: Settings): void {
  const name  = s.user_name  ?? 'Usuário';
  const email = s.user_email ?? '';
  const initials = name.split(' ').slice(0,2).map((w: string) => w[0]).join('').toUpperCase();

  el.innerHTML = `
    <!-- Profile card -->
    <div class="card" style="display:flex;align-items:center;gap:16px;padding:20px;margin-bottom:20px">
      <div style="width:56px;height:56px;border-radius:50%;background:#085041;color:#9FE1CB;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:500;flex-shrink:0">
        ${initials}
      </div>
      <div>
        <div style="font-size:15px;font-weight:500">${esc(name)}</div>
        <div style="font-size:12px;color:var(--text-3)">${esc(email)}</div>
      </div>
    </div>

    <div class="settings-section-label">PERFIL</div>
    <div class="settings-hr"></div>

    <div class="settings-row">
      <div><div class="settings-row-label">Nome completo</div>
           <div class="settings-row-sub">Aparece no cabeçalho e relatórios</div></div>
      <div class="settings-row-right">
        <input class="form-ctrl" id="s-name" value="${esc(name)}" style="width:200px">
      </div>
    </div>
    <div class="settings-row">
      <div><div class="settings-row-label">E-mail</div>
           <div class="settings-row-sub">Para notificações</div></div>
      <div class="settings-row-right">
        <input class="form-ctrl" id="s-email" value="${esc(email)}" style="width:200px">
      </div>
    </div>
    <div style="margin-top:16px;display:flex;justify-content:flex-end">
      <button class="btn btn-primary" id="save-profile">Salvar alterações</button>
    </div>
  `;

  el.querySelector('#save-profile')?.addEventListener('click', async () => {
    const newName  = (document.getElementById('s-name')  as HTMLInputElement).value.trim();
    const newEmail = (document.getElementById('s-email') as HTMLInputElement).value.trim();
    if (!newName) { alert('Informe o nome.'); return; }
    await invoke('settings:setMany', { user_name: newName, user_email: newEmail });
    s.user_name  = newName;
    s.user_email = newEmail;
    renderProfile(el, s);
  });
}

function renderAppearance(el: HTMLElement, s: Settings): void {
  const accent    = s.accent_color ?? '#1D9E75';
  const theme     = s.theme        ?? 'dark';
  const colors    = ['#1D9E75', '#3B82F6', '#8B5CF6', '#EF9F27', '#D85A30', '#EC4899'];

  el.innerHTML = `
    <div class="settings-section-label">APARÊNCIA</div>
    <div class="settings-hr"></div>

    <div class="settings-row">
      <div><div class="settings-row-label">Tema</div>
           <div class="settings-row-sub">Modo escuro ou claro para a interface</div></div>
      <div class="settings-row-right">
        <select class="form-ctrl" id="s-theme" style="width:150px">
          <option value="dark"  ${theme === 'dark'  ? 'selected' : ''}>Escuro</option>
          <option value="light" ${theme === 'light' ? 'selected' : ''}>Claro</option>
        </select>
      </div>
    </div>

    <div class="settings-row">
      <div><div class="settings-row-label">Cor de destaque</div>
           <div class="settings-row-sub">Usada em botões e elementos ativos</div></div>
      <div class="settings-row-right" style="gap:10px">
        ${colors.map(c => `
          <div style="width:26px;height:26px;border-radius:50%;background:${c};cursor:pointer;
            border:2px solid ${c === accent ? '#fff' : 'transparent'};transition:border 0.15s"
            data-color="${c}"></div>
        `).join('')}
      </div>
    </div>
  `;

  el.querySelector<HTMLSelectElement>('#s-theme')?.addEventListener('change', async (ev) => {
    const val = (ev.target as HTMLSelectElement).value;
    await invoke('settings:set', { key: 'theme', value: val });
    s.theme = val;
    applyTheme(val);
  });

  el.querySelectorAll<HTMLElement>('[data-color]').forEach(dot => {
    dot.addEventListener('click', async () => {
      const color = dot.dataset.color!;
      await invoke('settings:set', { key: 'accent_color', value: color });
      s.accent_color = color;
      applyAccent(color);
      renderAppearance(el, s);
    });
  });
}

function renderNotifications(el: HTMLElement, s: Settings): void {
  const notifBills   = s.notif_bills   !== 'false';
  const notifBudget  = s.notif_budget  !== 'false';
  const notifSummary = s.notif_summary === 'true';

  el.innerHTML = `
    <div class="settings-section-label">NOTIFICAÇÕES</div>
    <div class="settings-hr"></div>
    ${[
      { id: 'bills',   key: 'notif_bills',   label: 'Contas a vencer',      sub: 'Alerta 3 dias antes do vencimento',     val: notifBills   },
      { id: 'budget',  key: 'notif_budget',  label: 'Orçamento excedido',   sub: 'Notifica ao ultrapassar o limite',      val: notifBudget  },
      { id: 'summary', key: 'notif_summary', label: 'Resumo semanal',       sub: 'Relatório toda segunda-feira',          val: notifSummary },
    ].map(row => `
      <div class="settings-row">
        <div>
          <div class="settings-row-label">${row.label}</div>
          <div class="settings-row-sub">${row.sub}</div>
        </div>
        <div class="settings-row-right">
          <label class="toggle">
            <input type="checkbox" ${row.val ? 'checked' : ''} data-key="${row.key}">
            <div class="toggle-track"></div>
            <div class="toggle-thumb"></div>
          </label>
        </div>
      </div>
    `).join('')}
  `;

  el.querySelectorAll<HTMLInputElement>('.toggle input').forEach(input => {
    input.addEventListener('change', () => {
      invoke('settings:set', { key: input.dataset.key!, value: input.checked ? 'true' : 'false' });
    });
  });
}

function renderData(el: HTMLElement, _s: Settings, dbPath: string): void {
  el.innerHTML = `
    <div class="settings-section-label">BANCO DE DADOS</div>
    <div class="settings-hr"></div>
    <div class="settings-row">
      <div><div class="settings-row-label">Arquivo do banco</div>
           <div class="settings-row-sub" style="word-break:break-all;max-width:380px">${esc(dbPath)}</div></div>
    </div>
    <div class="settings-section-label" style="margin-top:20px">BACKUP</div>
    <div class="settings-hr"></div>
    <div class="settings-row">
      <div><div class="settings-row-label">Exportar dados</div>
           <div class="settings-row-sub">Copia o arquivo SQLite para outro local</div></div>
      <div class="settings-row-right">
        <button class="btn btn-ghost btn-sm" id="btn-export">Exportar</button>
      </div>
    </div>
  `;

  el.querySelector('#btn-export')?.addEventListener('click', () => {
    send('shell:openExternal', 'https://github.com');
    alert(`Copie manualmente o arquivo:\n${dbPath}`);
  });
}

type UpdateInfo = {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  isAur: boolean;
  releaseUrl: string;
};

async function renderAbout(el: HTMLElement): Promise<void> {
  const version = await invoke<string>('app:version');

  el.innerHTML = `
    <div class="settings-section-label">SOBRE O FINA</div>
    <div class="settings-hr"></div>
    <div class="settings-row">
      <div class="settings-row-label">Versão</div>
      <div class="settings-row-right">
        <span style="font-weight:500">v${version}</span>
        <span class="badge badge-confirmed">Estável</span>
      </div>
    </div>
    <div class="settings-row">
      <div class="settings-row-label">Banco de dados</div>
      <div class="settings-row-right" style="color:var(--text-2)">SQLite (better-sqlite3)</div>
    </div>
    <div class="settings-row">
      <div class="settings-row-label">Runtime</div>
      <div class="settings-row-right" style="color:var(--text-2)">Electron + TypeScript</div>
    </div>
    <div class="settings-row">
      <div class="settings-row-label">Desenvolvido por</div>
      <div class="settings-row-right" style="font-weight:500">Rodrigo Brito</div>
    </div>

    <div class="settings-section-label" style="margin-top:20px">ATUALIZAÇÃO</div>
    <div class="settings-hr"></div>
    <div class="settings-row" id="update-row">
      <div>
        <div class="settings-row-label">Verificar atualizações</div>
        <div class="settings-row-sub" id="update-sub">Clique para verificar se há uma nova versão</div>
      </div>
      <div class="settings-row-right">
        <button class="btn btn-ghost btn-sm" id="btn-check-update">Verificar</button>
      </div>
    </div>
  `;

  el.querySelector('#btn-check-update')?.addEventListener('click', async () => {
    const btn = el.querySelector<HTMLButtonElement>('#btn-check-update')!;
    const sub = el.querySelector<HTMLElement>('#update-sub')!;
    btn.disabled = true;
    btn.textContent = 'Verificando…';

    const info = await invoke<UpdateInfo>('app:checkUpdate').catch(() => null);

    if (!info) {
      sub.textContent = 'Não foi possível verificar. Verifique sua conexão.';
      btn.textContent = 'Tentar novamente';
      btn.disabled = false;
      return;
    }

    if (info.isAur) {
      sub.textContent = 'Instalado via AUR — atualize pelo gerenciador de pacotes.';
      btn.textContent = 'Atualizar via AUR';
      btn.disabled = true;
      return;
    }

    if (info.hasUpdate) {
      sub.textContent = `Nova versão disponível: v${info.latestVersion}`;
      btn.textContent = 'Baixar atualização';
      btn.disabled = false;
      btn.className = 'btn btn-primary btn-sm';
      btn.onclick = () => send('shell:openExternal', info.releaseUrl);
    } else {
      sub.textContent = `Você está na versão mais recente (v${info.currentVersion}).`;
      btn.textContent = 'Atualizado';
      btn.disabled = true;
    }
  });
}

function esc(s?: string): string {
  return (s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
