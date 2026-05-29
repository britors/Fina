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
      { route: 'goals',        label: 'Metas',          icon: 'ti-target'        },
      { route: 'debts',        label: 'Dívidas',        icon: 'ti-receipt'       },
      { route: 'market',       label: 'Mercado',        icon: 'ti-chart-line'    },
      { route: 'irpf',         label: 'IRPF',           icon: 'ti-file-invoice'  },
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
      <div style="display:flex;align-items:center;gap:10px">
        <svg width="32" height="32" viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
          <circle cx="80" cy="80" r="78" fill="none" stroke="#1D9E75" stroke-width="2" opacity="0.3"/>
          <circle cx="80" cy="80" r="68" fill="#0C2E22"/>
          <rect x="30" y="98" width="18" height="26" rx="3" fill="#1D9E75" opacity="0.5"/>
          <rect x="56" y="76" width="18" height="48" rx="3" fill="#1D9E75" opacity="0.75"/>
          <rect x="82" y="54" width="18" height="70" rx="3" fill="#1D9E75"/>
          <rect x="108" y="66" width="18" height="58" rx="3" fill="#1D9E75" opacity="0.85"/>
          <polyline points="39,92 65,72 91,48 117,60" fill="none" stroke="#9FE1CB" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="91" cy="48" r="5" fill="#9FE1CB"/>
        </svg>
        <span class="sidebar-logo">fina</span>
      </div>
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
