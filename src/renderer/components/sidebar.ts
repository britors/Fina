import { invoke } from '../api';

const NAV: { section: string; items: { route: string; label: string; icon: string }[] }[] = [
  {
    section: 'PRINCIPAL',
    items: [
      { route: 'dashboard',    label: 'Dashboard',    icon: 'ti-layout-dashboard' },
      { route: 'transactions', label: 'Transações',   icon: 'ti-arrows-transfer'  },
      { route: 'accounts',     label: 'Contas',       icon: 'ti-building-bank'    },
      { route: 'budget',       label: 'Orçamento',    icon: 'ti-target'           },
    ],
  },
  {
    section: 'ANÁLISE',
    items: [
      { route: 'reports',      label: 'Relatórios',    icon: 'ti-chart-bar'     },
      { route: 'agenda',       label: 'Agenda',         icon: 'ti-calendar'      },
      { route: 'patrimonio',   label: 'Patrimônio',     icon: 'ti-home'          },
      { route: 'investments',  label: 'Investimentos',  icon: 'ti-trending-up'   },
    ],
  },
  {
    section: 'SISTEMA',
    items: [
      { route: 'settings', label: 'Configurações', icon: 'ti-settings' },
    ],
  },
];

export async function initSidebar(el: HTMLElement): Promise<void> {
  let userName = 'Usuário';
  try {
    const s = await invoke<Record<string, string>>('settings:getAll');
    userName = s.user_name ?? userName;
  } catch { /* noop */ }

  const initials = userName.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

  el.innerHTML = `
    <div class="sidebar-header">
      <span class="sidebar-logo">Fina</span>
      <span class="sidebar-sub">Finanças pessoais</span>
    </div>
    <div class="sidebar-hr"></div>
    <nav class="sidebar-nav">
      ${NAV.map(sec => `
        <div class="nav-section">
          <div class="nav-section-label">${sec.section}</div>
          ${sec.items.map(it => `
            <a class="nav-item" data-route="${it.route}" href="#${it.route}">
              <i class="ti ${it.icon}"></i>
              ${it.label}
            </a>
          `).join('')}
        </div>
      `).join('')}
    </nav>
    <div class="sidebar-user">
      <div class="sidebar-user-hr"></div>
      <div class="user-row">
        <div class="user-avatar">${initials}</div>
        <div>
          <div class="user-name">${userName}</div>
          <div class="user-sub">Conta pessoal</div>
        </div>
      </div>
    </div>
  `;
}

export function setActiveRoute(route: string): void {
  document.querySelectorAll<HTMLElement>('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.route === route);
  });
}
