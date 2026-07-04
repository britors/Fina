import { invoke, send, on } from '../api';
import { setTopbarActions } from '../components/topbar';
import { applyAccent, applyTheme } from '../theme';
import { openCategoryModal } from '../components/categoryModal';
import type { Category, UpdateStatus } from '../../shared/types';

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
    { id: 'family',        label: 'Família/Casal'     },
    { id: 'categories',    label: 'Categorias'        },
    { id: 'ai',            label: 'IA'                },
    { id: 'data',          label: 'Dados e backup'    },
    { id: 'security',      label: 'Segurança'         },
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
  if (id === 'profile')            renderProfile(el, s);
  else if (id === 'appearance')    renderAppearance(el, s);
  else if (id === 'notifications') renderNotifications(el, s);
  else if (id === 'family')        renderFamily(el, s);
  else if (id === 'categories')    renderCategories(el);
  else if (id === 'ai')            renderAI(el);
  else if (id === 'data')          renderData(el, s, dbPath);
  else if (id === 'security')      renderSecurity(el);
  else if (id === 'about')         renderAbout(el);
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
  const notifBills        = s.notif_bills        !== 'false';
  const notifBudget       = s.notif_budget       !== 'false';
  const notifSubscription = s.notif_subscription !== 'false';
  const notifSummary      = s.notif_summary      === 'true';
  const smtpEnabled       = s.smtp_enabled === 'true';
  const smtpSecure        = s.smtp_secure === 'true';
  const webhookEnabled    = s.webhook_enabled === 'true';

  el.innerHTML = `
    <div class="settings-section-label">NOTIFICAÇÕES</div>
    <div class="settings-hr"></div>
    ${[
      { id: 'bills',        key: 'notif_bills',        label: 'Contas a vencer',           sub: 'Alerta 3 dias antes do vencimento',      val: notifBills        },
      { id: 'budget',       key: 'notif_budget',       label: 'Orçamento excedido',        sub: 'Notifica ao ultrapassar o limite',       val: notifBudget       },
      { id: 'subscription', key: 'notif_subscription', label: 'Assinatura aumentou de preço', sub: 'Notifica quando uma fixa/assinatura sobe de valor', val: notifSubscription },
      { id: 'summary',      key: 'notif_summary',      label: 'Resumo semanal',            sub: 'Relatório toda segunda-feira',           val: notifSummary      },
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

    <div class="settings-section-label" style="margin-top:22px">E-MAIL SMTP</div>
    <div class="settings-hr"></div>
    <div class="settings-row">
      <div>
        <div class="settings-row-label">Enviar alertas por e-mail</div>
        <div class="settings-row-sub">Usa as configurações SMTP abaixo para alertas de vencimento e orçamento</div>
      </div>
      <div class="settings-row-right">
        <label class="toggle">
          <input type="checkbox" id="smtp-enabled" ${smtpEnabled ? 'checked' : ''}>
          <div class="toggle-track"></div>
          <div class="toggle-thumb"></div>
        </label>
      </div>
    </div>
    <div class="settings-row">
      <div>
        <div class="settings-row-label">Servidor SMTP</div>
        <div class="settings-row-sub">Host e porta do servidor de envio</div>
      </div>
      <div class="settings-row-right">
        <input class="form-ctrl" id="smtp-host" value="${esc(s.smtp_host ?? '')}" placeholder="smtp.exemplo.com" style="width:220px">
        <input class="form-ctrl" id="smtp-port" type="number" min="1" max="65535" value="${esc(s.smtp_port ?? '587')}" style="width:90px">
      </div>
    </div>
    <div class="settings-row">
      <div>
        <div class="settings-row-label">Conexão segura</div>
        <div class="settings-row-sub">Ative para SMTP SSL/TLS direto, normalmente porta 465</div>
      </div>
      <div class="settings-row-right">
        <label class="toggle">
          <input type="checkbox" id="smtp-secure" ${smtpSecure ? 'checked' : ''}>
          <div class="toggle-track"></div>
          <div class="toggle-thumb"></div>
        </label>
      </div>
    </div>
    <div class="settings-row">
      <div>
        <div class="settings-row-label">Autenticação</div>
        <div class="settings-row-sub">Usuário e senha do provedor SMTP</div>
      </div>
      <div class="settings-row-right">
        <input class="form-ctrl" id="smtp-user" value="${esc(s.smtp_user ?? '')}" placeholder="usuário" style="width:180px">
        <input class="form-ctrl" id="smtp-pass" type="password" value="${esc(s.smtp_pass ?? '')}" placeholder="senha" style="width:180px">
      </div>
    </div>
    <div class="settings-row">
      <div>
        <div class="settings-row-label">Remetente e destinatário</div>
        <div class="settings-row-sub">E-mails usados no envio dos alertas</div>
      </div>
      <div class="settings-row-right">
        <input class="form-ctrl" id="smtp-from" value="${esc(s.smtp_from ?? '')}" placeholder="Fina <alertas@exemplo.com>" style="width:220px">
        <input class="form-ctrl" id="smtp-to" value="${esc(s.smtp_to ?? s.user_email ?? '')}" placeholder="destino@exemplo.com" style="width:220px">
      </div>
    </div>
    <div style="margin-top:16px;display:flex;justify-content:flex-end">
      <button class="btn btn-primary" id="save-smtp">Salvar SMTP</button>
    </div>

    <div class="settings-section-label" style="margin-top:22px">WEBHOOK</div>
    <div class="settings-hr"></div>
    <div class="settings-row">
      <div>
        <div class="settings-row-label">Enviar alertas por webhook</div>
        <div class="settings-row-sub">Faz um POST em JSON para a URL abaixo a cada alerta</div>
      </div>
      <div class="settings-row-right">
        <label class="toggle">
          <input type="checkbox" id="webhook-enabled" data-key="webhook_enabled" ${webhookEnabled ? 'checked' : ''}>
          <div class="toggle-track"></div>
          <div class="toggle-thumb"></div>
        </label>
      </div>
    </div>
    <div class="settings-row">
      <div>
        <div class="settings-row-label">URL do webhook</div>
        <div class="settings-row-sub">Endpoint que recebe { title, body, source, sentAt } em JSON</div>
      </div>
      <div class="settings-row-right">
        <input class="form-ctrl" id="webhook-url" value="${esc(s.webhook_url ?? '')}" placeholder="https://exemplo.com/webhooks/fina" style="width:280px">
      </div>
    </div>
    <div style="margin-top:16px;display:flex;justify-content:flex-end">
      <button class="btn btn-primary" id="save-webhook">Salvar webhook</button>
    </div>
  `;

  el.querySelectorAll<HTMLInputElement>('.toggle input').forEach(input => {
    input.addEventListener('change', () => {
      invoke('settings:set', { key: input.dataset.key!, value: input.checked ? 'true' : 'false' });
    });
  });

  el.querySelector('#save-smtp')?.addEventListener('click', async () => {
    const smtp_enabled = el.querySelector<HTMLInputElement>('#smtp-enabled')!.checked ? 'true' : 'false';
    const smtp_host = el.querySelector<HTMLInputElement>('#smtp-host')!.value.trim();
    const smtp_port = el.querySelector<HTMLInputElement>('#smtp-port')!.value.trim() || '587';
    const smtp_secure = el.querySelector<HTMLInputElement>('#smtp-secure')!.checked ? 'true' : 'false';
    const smtp_user = el.querySelector<HTMLInputElement>('#smtp-user')!.value.trim();
    const smtp_pass = el.querySelector<HTMLInputElement>('#smtp-pass')!.value;
    const smtp_from = el.querySelector<HTMLInputElement>('#smtp-from')!.value.trim();
    const smtp_to = el.querySelector<HTMLInputElement>('#smtp-to')!.value.trim();

    if (smtp_enabled === 'true' && (!smtp_host || !smtp_port || !smtp_from || !smtp_to)) {
      alert('Informe servidor, porta, remetente e destinatário para ativar o envio por e-mail.');
      return;
    }

    await invoke('settings:setMany', {
      smtp_enabled,
      smtp_host,
      smtp_port,
      smtp_secure,
      smtp_user,
      smtp_pass,
      smtp_from,
      smtp_to,
    });
    Object.assign(s, { smtp_enabled, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, smtp_from, smtp_to });
    alert('Configurações SMTP salvas.');
    renderNotifications(el, s);
  });

  el.querySelector('#save-webhook')?.addEventListener('click', async () => {
    const webhook_enabled = el.querySelector<HTMLInputElement>('#webhook-enabled')!.checked ? 'true' : 'false';
    const webhook_url = el.querySelector<HTMLInputElement>('#webhook-url')!.value.trim();

    if (webhook_enabled === 'true') {
      try {
        const parsed = new URL(webhook_url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error();
      } catch {
        alert('Informe uma URL http(s) válida para ativar o webhook.');
        return;
      }
    }

    await invoke('settings:setMany', { webhook_enabled, webhook_url });
    Object.assign(s, { webhook_enabled, webhook_url });
    alert('Configurações de webhook salvas.');
    renderNotifications(el, s);
  });
}

function renderFamily(el: HTMLElement, s: Settings): void {
  const enabled = s.family_mode === 'true';
  const members = s.family_members ?? '';

  el.innerHTML = `
    <div class="settings-section-label">FAMÍLIA / CASAL</div>
    <div class="settings-hr"></div>
    <div class="settings-row">
      <div>
        <div class="settings-row-label">Ativar modo família/casal</div>
        <div class="settings-row-sub">Permite marcar lançamentos por responsável</div>
      </div>
      <div class="settings-row-right">
        <label class="toggle">
          <input type="checkbox" id="family-enabled" ${enabled ? 'checked' : ''}>
          <div class="toggle-track"></div>
          <div class="toggle-thumb"></div>
        </label>
      </div>
    </div>
    <div class="settings-row">
      <div>
        <div class="settings-row-label">Membros</div>
        <div class="settings-row-sub">Separe nomes por vírgula. Ex: Rodrigo, Ana, Casa</div>
      </div>
      <div class="settings-row-right">
        <input class="form-ctrl" id="family-members" value="${esc(members)}" style="width:320px" placeholder="Pessoa 1, Pessoa 2, Casa">
      </div>
    </div>
    <div style="margin-top:16px;display:flex;justify-content:flex-end">
      <button class="btn btn-primary" id="save-family">Salvar família/casal</button>
    </div>
  `;

  el.querySelector('#save-family')?.addEventListener('click', async () => {
    const family_mode = el.querySelector<HTMLInputElement>('#family-enabled')!.checked ? 'true' : 'false';
    const family_members = el.querySelector<HTMLInputElement>('#family-members')!.value
      .split(',')
      .map(v => v.trim())
      .filter(Boolean)
      .join(', ');
    await invoke('settings:setMany', { family_mode, family_members });
    s.family_mode = family_mode;
    s.family_members = family_members;
    alert('Configurações de família/casal salvas.');
    renderFamily(el, s);
  });
}

const AUTOBACKUP_TRIGGERS: { value: string; label: string }[] = [
  { value: 'off',      label: 'Desativado' },
  { value: 'on_open',  label: 'Ao abrir o programa' },
  { value: 'on_close', label: 'Ao fechar o programa' },
  { value: 'daily',    label: 'Diariamente' },
  { value: 'weekly',   label: 'Semanalmente' },
  { value: 'monthly',  label: 'Mensalmente' },
];

function renderData(el: HTMLElement, s: Settings, dbPath: string): void {
  const trigger = s.autobackup_trigger ?? 'off';
  const folder  = s.autobackup_folder ?? '';

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
           <div class="settings-row-sub">Salva um backup completo (.fin) com todos os seus dados</div></div>
      <div class="settings-row-right">
        <button class="btn btn-ghost btn-sm" id="btn-export">Exportar</button>
      </div>
    </div>
    <div class="settings-row">
      <div><div class="settings-row-label">Importar dados</div>
           <div class="settings-row-sub">Restaura um backup (.fin) — substitui todos os dados atuais</div></div>
      <div class="settings-row-right">
        <button class="btn btn-ghost btn-sm" id="btn-import-backup">Importar</button>
      </div>
    </div>
    <div class="settings-section-label" style="margin-top:20px">AUTO-BACKUP</div>
    <div class="settings-hr"></div>
    <div class="settings-row">
      <div><div class="settings-row-label">Quando fazer backup</div>
           <div class="settings-row-sub">Gera um arquivo .fin automaticamente na pasta escolhida</div></div>
      <div class="settings-row-right">
        <select class="form-ctrl" id="autobackup-trigger" style="width:auto">
          ${AUTOBACKUP_TRIGGERS.map(t => `<option value="${t.value}" ${trigger === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="settings-row">
      <div><div class="settings-row-label">Pasta de destino</div>
           <div class="settings-row-sub" style="word-break:break-all;max-width:380px">${folder ? esc(folder) : 'Nenhuma pasta selecionada'}</div></div>
      <div class="settings-row-right">
        <button class="btn btn-ghost btn-sm" id="btn-autobackup-folder">Escolher pasta</button>
      </div>
    </div>
  `;

  el.querySelector('#btn-export')?.addEventListener('click', async () => {
    const savedPath = await invoke<string | null>('backup:export');
    if (savedPath) alert(`Backup salvo em:\n${savedPath}`);
  });

  el.querySelector('#btn-import-backup')?.addEventListener('click', async () => {
    if (!confirm('Importar um backup substituirá TODOS os dados atuais do app. Esta ação não pode ser desfeita. Deseja continuar?')) return;
    try {
      const result = await invoke<{ imported: boolean }>('backup:import');
      if (result.imported) {
        alert('Backup importado com sucesso. O aplicativo será reiniciado.');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Não foi possível importar o backup.');
    }
  });

  el.querySelector<HTMLSelectElement>('#autobackup-trigger')?.addEventListener('change', e => {
    const value = (e.target as HTMLSelectElement).value;
    invoke('settings:set', { key: 'autobackup_trigger', value });
    s.autobackup_trigger = value;
    if (value !== 'off' && !s.autobackup_folder) {
      alert('Escolha também uma pasta de destino para o auto-backup funcionar.');
    }
  });

  el.querySelector('#btn-autobackup-folder')?.addEventListener('click', async () => {
    const chosen = await invoke<string | null>('backup:chooseFolder');
    if (!chosen) return;
    await invoke('settings:set', { key: 'autobackup_folder', value: chosen });
    s.autobackup_folder = chosen;
    renderData(el, s, dbPath);
  });
}

async function renderSecurity(el: HTMLElement): Promise<void> {
  const { active } = await invoke<{ active: boolean }>('security:status');

  el.innerHTML = `
    <div class="settings-section-label">CRIPTOGRAFIA DO BANCO DE DADOS</div>
    <div class="settings-hr"></div>
    <div class="settings-row">
      <div>
        <div class="settings-row-label">Status</div>
        <div class="settings-row-sub">${active
          ? 'O banco de dados está criptografado com uma senha mestre.'
          : 'O banco de dados está em texto plano (sem criptografia).'}</div>
      </div>
      <span class="badge" style="background:${active ? 'var(--accent)' : 'var(--text-3)'}18;color:${active ? 'var(--accent)' : 'var(--text-3)'}">
        ${active ? 'Ativada' : 'Desativada'}
      </span>
    </div>

    ${!active ? `
      <div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:10px">
        <div>
          <div class="settings-row-label">Ativar criptografia</div>
          <div class="settings-row-sub">
            Protege o arquivo do banco com uma senha mestre. <strong>Não há como recuperar seus dados se você esquecer essa senha</strong> — guarde-a em um lugar seguro. Considere exportar um backup antes de ativar.
          </div>
        </div>
        <div class="form-row" style="width:100%">
          <input class="form-ctrl" type="password" id="sec-new-pass" placeholder="Senha mestre">
          <input class="form-ctrl" type="password" id="sec-new-pass-confirm" placeholder="Confirme a senha">
        </div>
        <label style="display:flex;align-items:center;gap:8px;font-weight:400;font-size:12px;color:var(--text-2)">
          <input type="checkbox" id="sec-ack">
          Entendo que não há como recuperar meus dados se eu esquecer a senha.
        </label>
        <button class="btn btn-primary" id="btn-enable-encryption">Ativar criptografia</button>
      </div>
    ` : `
      <div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:10px">
        <div>
          <div class="settings-row-label">Trocar senha</div>
          <div class="settings-row-sub">Define uma nova senha mestre para o banco já criptografado.</div>
        </div>
        <input class="form-ctrl" type="password" id="sec-current-pass" placeholder="Senha atual" style="width:100%">
        <div class="form-row" style="width:100%">
          <input class="form-ctrl" type="password" id="sec-change-pass" placeholder="Nova senha">
          <input class="form-ctrl" type="password" id="sec-change-pass-confirm" placeholder="Confirme a nova senha">
        </div>
        <button class="btn btn-secondary" id="btn-change-password">Trocar senha</button>
      </div>
      <div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:10px">
        <div>
          <div class="settings-row-label">Desativar criptografia</div>
          <div class="settings-row-sub">Volta o banco de dados a texto plano, sem exigir senha.</div>
        </div>
        <input class="form-ctrl" type="password" id="sec-disable-pass" placeholder="Senha atual" style="width:100%;max-width:320px">
        <button class="btn btn-danger" id="btn-disable-encryption">Desativar criptografia</button>
      </div>
    `}
  `;

  el.querySelector('#btn-enable-encryption')?.addEventListener('click', async () => {
    const pass = (el.querySelector('#sec-new-pass') as HTMLInputElement).value;
    const confirm_ = (el.querySelector('#sec-new-pass-confirm') as HTMLInputElement).value;
    const ack = (el.querySelector('#sec-ack') as HTMLInputElement).checked;
    if (!ack) { alert('Confirme que você entende o risco de perda de dados antes de continuar.'); return; }
    if (pass.length < 4) { alert('Use uma senha de pelo menos 4 caracteres.'); return; }
    if (pass !== confirm_) { alert('As senhas não conferem.'); return; }
    try {
      await invoke('security:enable', pass);
      alert('Criptografia ativada.');
      renderSecurity(el);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Não foi possível ativar a criptografia.');
    }
  });

  el.querySelector('#btn-change-password')?.addEventListener('click', async () => {
    const oldPassword = (el.querySelector('#sec-current-pass') as HTMLInputElement).value;
    const pass = (el.querySelector('#sec-change-pass') as HTMLInputElement).value;
    const confirm_ = (el.querySelector('#sec-change-pass-confirm') as HTMLInputElement).value;
    if (pass.length < 4) { alert('Use uma senha de pelo menos 4 caracteres.'); return; }
    if (pass !== confirm_) { alert('As senhas não conferem.'); return; }
    try {
      await invoke('security:changePassword', { oldPassword, newPassword: pass });
      alert('Senha alterada.');
      renderSecurity(el);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Não foi possível trocar a senha.');
    }
  });

  el.querySelector('#btn-disable-encryption')?.addEventListener('click', async () => {
    const currentPass = (el.querySelector('#sec-disable-pass') as HTMLInputElement).value;
    if (!confirm('Desativar a criptografia deixa o banco de dados em texto plano. Deseja continuar?')) return;
    try {
      await invoke('security:disable', currentPass);
      alert('Criptografia desativada.');
      renderSecurity(el);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Não foi possível desativar a criptografia.');
    }
  });
}

type UpdateInfo = {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  isAur: boolean;
  releaseUrl: string;
};

// O box de atualização é recriado a cada visita à página; o listener do
// electron-updater fica registrado uma única vez e só redesenha o box
// se ele ainda estiver montado (evita empilhar listeners a cada navegação).
let updateBoxEl: HTMLElement | null = null;
let lastUpdateStatus: UpdateStatus | null = null;
let updateListenerBound = false;

function bindUpdateListener(): void {
  if (updateListenerBound) return;
  updateListenerBound = true;
  on('updater:status', (status) => {
    lastUpdateStatus = status as UpdateStatus;
    if (updateBoxEl) renderAutoUpdateBox(updateBoxEl, lastUpdateStatus);
  });
}

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
    <div id="update-box"></div>
  `;

  const box = el.querySelector<HTMLElement>('#update-box')!;
  const supported = await invoke<boolean>('updater:supported').catch(() => false);

  if (supported) {
    updateBoxEl = box;
    bindUpdateListener();
    renderAutoUpdateBox(box, lastUpdateStatus);
    if (!lastUpdateStatus) void invoke('updater:check');
  } else {
    updateBoxEl = null;
    renderManualUpdateBox(box);
  }
}

/** Windows: download e instalação automáticos via electron-updater. */
function renderAutoUpdateBox(el: HTMLElement, status: UpdateStatus | null): void {
  const row = (sub: string, right: string) => `
    <div class="settings-row">
      <div>
        <div class="settings-row-label">Verificar atualizações</div>
        <div class="settings-row-sub">${sub}</div>
      </div>
      <div class="settings-row-right">${right}</div>
    </div>
  `;
  const btn = (label: string, id: string, opts: { primary?: boolean; disabled?: boolean } = {}) =>
    `<button class="btn ${opts.primary ? 'btn-primary' : 'btn-ghost'} btn-sm" id="${id}" ${opts.disabled ? 'disabled' : ''}>${label}</button>`;

  switch (status?.state) {
    case 'checking':
      el.innerHTML = row('Verificando se há uma nova versão…', btn('Verificando…', 'btn-update', { disabled: true }));
      break;

    case 'available':
      el.innerHTML = row(`Nova versão disponível: v${status.version}`, btn('Baixar agora', 'btn-update', { primary: true }));
      el.querySelector('#btn-update')?.addEventListener('click', () => void invoke('updater:download'));
      break;

    case 'downloading': {
      const pct = Math.round(status.percent ?? 0);
      el.innerHTML = `
        ${row(`Baixando atualização… ${pct}%`, '')}
        <div class="prog-track"><div class="prog-fill prog-ok" style="width:${pct}%"></div></div>
      `;
      break;
    }

    case 'downloaded':
      el.innerHTML = row('Atualização pronta para instalar.', btn('Reiniciar e instalar', 'btn-update', { primary: true }));
      el.querySelector('#btn-update')?.addEventListener('click', () => void invoke('updater:install'));
      break;

    case 'error':
      el.innerHTML = row(status.message || 'Erro ao verificar atualizações.', btn('Tentar novamente', 'btn-update'));
      el.querySelector('#btn-update')?.addEventListener('click', () => void invoke('updater:check'));
      break;

    case 'up-to-date':
      el.innerHTML = row('Você está na versão mais recente.', btn('Verificar', 'btn-update'));
      el.querySelector('#btn-update')?.addEventListener('click', () => void invoke('updater:check'));
      break;

    default:
      el.innerHTML = row('Clique para verificar se há uma nova versão', btn('Verificar', 'btn-update'));
      el.querySelector('#btn-update')?.addEventListener('click', () => void invoke('updater:check'));
  }
}

/** Linux (deb/rpm/AUR): não há instalação automática — só aponta para a release no GitHub. */
function renderManualUpdateBox(el: HTMLElement): void {
  el.innerHTML = `
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

async function renderCategories(el: HTMLElement): Promise<void> {
  const cats = await invoke<Category[]>('categories:list');

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div class="settings-section-label" style="margin-bottom:0">CATEGORIAS</div>
      <button class="btn btn-primary btn-sm" id="btn-add-cat"><i class="ti ti-plus"></i> Nova</button>
    </div>
    <div class="settings-hr" style="margin-top:8px"></div>
    ${cats.length === 0 ? `<div style="color:var(--text-3);padding:12px 0;font-size:12px">Nenhuma categoria cadastrada.</div>` : ''}
    ${cats.map(c => `
      <div class="settings-row">
        <div style="display:flex;align-items:center;gap:12px">
          <div class="cat-dot" style="background:${c.color}22">
            <i class="ti ${c.icon}" style="color:${c.color};font-size:15px"></i>
          </div>
          <div>
            <div class="settings-row-label">${esc(c.name)}</div>
            <div class="settings-row-sub">${categoryTypeLabel(c)}</div>
          </div>
        </div>
        <div class="settings-row-right">
          <button class="btn btn-ghost btn-sm" data-edit-cat="${c.id}">Editar</button>
          <button class="btn btn-danger btn-sm" data-del-cat="${c.id}">✕</button>
        </div>
      </div>
    `).join('')}
  `;

  el.querySelector('#btn-add-cat')?.addEventListener('click', () =>
    openCategoryModal(null, () => renderCategories(el))
  );

  el.querySelectorAll<HTMLElement>('[data-edit-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = cats.find(c => c.id === btn.dataset.editCat);
      if (cat) openCategoryModal(cat, () => renderCategories(el));
    });
  });

  el.querySelectorAll<HTMLElement>('[data-del-cat]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remover esta categoria? Transações vinculadas podem ser afetadas.')) return;
      try {
        await invoke('categories:delete', btn.dataset.delCat);
        renderCategories(el);
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Não foi possível remover a categoria.');
      }
    });
  });
}

type AISettings = {
  enabled: boolean;
  provider: 'openai' | 'gemini';
  model: string;
  consent: boolean;
  hasKey: boolean;
  encryptionAvailable: boolean;
};

async function renderAI(el: HTMLElement): Promise<void> {
  let ai = await invoke<AISettings>('ai:getSettings');

  el.innerHTML = `
    <div class="settings-section-label">ASSISTENTE DE IA</div>
    <div class="settings-hr"></div>
    ${!ai.encryptionAvailable ? `
      <div class="alert alert-error" style="margin-top:14px">
        A criptografia segura do sistema não está disponível. A chave de API não poderá ser salva.
      </div>
    ` : ''}
    <div class="settings-row">
      <div>
        <div class="settings-row-label">Ativar IA</div>
        <div class="settings-row-sub">A integração fica desligada até você ativar explicitamente</div>
      </div>
      <div class="settings-row-right">
        <label class="toggle">
          <input type="checkbox" id="ai-enabled" ${ai.enabled ? 'checked' : ''}>
          <div class="toggle-track"></div>
          <div class="toggle-thumb"></div>
        </label>
      </div>
    </div>
    <div class="settings-row">
      <div>
        <div class="settings-row-label">Provedor</div>
        <div class="settings-row-sub">Escolha quem receberá o resumo financeiro agregado</div>
      </div>
      <div class="settings-row-right">
        <select class="form-ctrl" id="ai-provider" style="width:180px">
          <option value="openai" ${ai.provider === 'openai' ? 'selected' : ''}>ChatGPT / OpenAI</option>
          <option value="gemini" ${ai.provider === 'gemini' ? 'selected' : ''}>Gemini / Google</option>
        </select>
      </div>
    </div>
    <div class="settings-row">
      <div>
        <div class="settings-row-label">Modelo</div>
        <div class="settings-row-sub">Modelo usado nas respostas do assistente</div>
      </div>
      <div class="settings-row-right">
        <input class="form-ctrl" id="ai-model" value="${esc(ai.model)}" style="width:180px">
      </div>
    </div>
    <div class="settings-row">
      <div>
        <div class="settings-row-label">Chave de API</div>
        <div class="settings-row-sub">${ai.hasKey ? 'Chave salva de forma criptografada fora do banco de dados' : 'Nenhuma chave salva'}</div>
      </div>
      <div class="settings-row-right">
        <input class="form-ctrl" id="ai-key" type="password" placeholder="${ai.hasKey ? 'Nova chave' : 'Chave de API'}" style="width:220px">
        <button class="btn btn-ghost btn-sm" id="ai-clear-key">Remover</button>
      </div>
    </div>
    <div class="settings-row">
      <div>
        <div class="settings-row-label">Consentimento de envio</div>
        <div class="settings-row-sub">Dados agregados só são enviados quando você confirma o uso</div>
      </div>
      <div class="settings-row-right">
        <label class="toggle">
          <input type="checkbox" id="ai-consent" ${ai.consent ? 'checked' : ''}>
          <div class="toggle-track"></div>
          <div class="toggle-thumb"></div>
        </label>
      </div>
    </div>
    <div style="background:rgba(239,159,39,.08);border:1px solid rgba(239,159,39,.25);border-radius:8px;padding:12px 16px;font-size:0.8rem;color:var(--text-2);line-height:1.6;margin-top:16px">
      O Fina envia apenas um resumo financeiro agregado quando você solicita uma análise. Por padrão, não envia nome, e-mail, bancos, descrições de transações, observações pessoais nem dados linha a linha.
    </div>
    <div style="margin-top:16px;display:flex;justify-content:flex-end">
      <button class="btn btn-primary" id="ai-save">Salvar IA</button>
    </div>
  `;

  el.querySelector('#ai-save')?.addEventListener('click', async () => {
    const provider = el.querySelector<HTMLSelectElement>('#ai-provider')!.value as 'openai' | 'gemini';
    const model = el.querySelector<HTMLInputElement>('#ai-model')!.value.trim();
    const enabled = el.querySelector<HTMLInputElement>('#ai-enabled')!.checked;
    const consent = el.querySelector<HTMLInputElement>('#ai-consent')!.checked;
    const apiKey = el.querySelector<HTMLInputElement>('#ai-key')!.value.trim();
    ai = await invoke<AISettings>('ai:saveSettings', { provider, model, enabled, consent });
    if (apiKey) ai = await invoke<AISettings>('ai:setApiKey', { provider, apiKey });
    alert('Configurações de IA salvas.');
    renderAI(el);
  });

  el.querySelector('#ai-clear-key')?.addEventListener('click', async () => {
    if (!confirm('Remover a chave de API salva para o provedor atual?')) return;
    ai = await invoke<AISettings>('ai:clearApiKey', ai.provider);
    renderAI(el);
  });
}

function esc(s?: string): string {
  return (s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g, '&quot;');
}

function categoryTypeLabel(c: Category): string {
  if (c.type === 'income') return 'Receita';
  return c.kind === 'essential' ? 'Despesa essencial' : 'Despesa variável';
}
