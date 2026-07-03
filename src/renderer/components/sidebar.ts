import { invoke } from '../api';

interface NavItem {
  route: string;
  label: string;
  icon: string;
}

interface NavGroup {
  id: string;
  label: string;
  icon: string;
  items: NavItem[];
}

const STORAGE_KEY = 'fina.sidebar.openGroups';

const NAV: NavGroup[] = [
  {
    id: 'overview',
    label: 'Visão geral',
    icon: 'ti-layout-dashboard',
    items: [
      { route: 'dashboard',    label: 'Dashboard',   icon: 'ti-layout-dashboard' },
      { route: 'diagnostico',  label: 'Diagnóstico', icon: 'ti-stethoscope'       },
      { route: 'plano-mensal', label: 'Plano mensal', icon: 'ti-calendar-stats'   },
      { route: 'alertas',      label: 'Alertas',     icon: 'ti-alert-triangle'    },
    ],
  },
  {
    id: 'movement',
    label: 'Movimentação',
    icon: 'ti-arrows-transfer',
    items: [
      { route: 'transactions', label: 'Transações', icon: 'ti-arrows-transfer' },
      { route: 'accounts',     label: 'Contas',     icon: 'ti-building-bank'   },
      { route: 'agenda',       label: 'Agenda',     icon: 'ti-calendar'        },
      { route: 'budget',       label: 'Orçamento',  icon: 'ti-target'          },
    ],
  },
  {
    id: 'debt-protection',
    label: 'Dívidas e proteção',
    icon: 'ti-shield-dollar',
    items: [
      { route: 'debts',          label: 'Dívidas',          icon: 'ti-receipt'    },
      { route: 'plano-dividas',  label: 'Plano de saída',   icon: 'ti-route'      },
      { route: 'reserva',        label: 'Reserva',          icon: 'ti-shield'     },
    ],
  },
  {
    id: 'wealth',
    label: 'Patrimônio e crescimento',
    icon: 'ti-trending-up',
    items: [
      { route: 'patrimonio',  label: 'Patrimônio',    icon: 'ti-home'        },
      { route: 'investments', label: 'Investimentos', icon: 'ti-trending-up' },
      { route: 'goals',       label: 'Metas',         icon: 'ti-target'      },
      { route: 'simulador-patrimonio', label: 'Simulador', icon: 'ti-chart-area-line' },
      { route: 'jornada',     label: 'Jornada',       icon: 'ti-map-2'       },
    ],
  },
  {
    id: 'analysis',
    label: 'Análise',
    icon: 'ti-chart-bar',
    items: [
      { route: 'reports', label: 'Relatórios', icon: 'ti-chart-bar'    },
      { route: 'market',  label: 'Mercado',    icon: 'ti-chart-line'   },
      { route: 'irpf',    label: 'IRPF',       icon: 'ti-file-invoice' },
    ],
  },
  {
    id: 'system',
    label: 'Sistema',
    icon: 'ti-settings',
    items: [
      { route: 'manual',   label: 'Manual',         icon: 'ti-book'     },
      { route: 'settings', label: 'Configurações', icon: 'ti-settings' },
    ],
  },
];

function groupForRoute(route: string): string | null {
  return NAV.find(group => group.items.some(item => item.route === route))?.id ?? null;
}

function readOpenGroups(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set(['overview', 'movement']);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter(v => typeof v === 'string')) : new Set(['overview', 'movement']);
  } catch {
    return new Set(['overview', 'movement']);
  }
}

function writeOpenGroups(groups: Set<string>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...groups]));
}

export async function initSidebar(el: HTMLElement): Promise<void> {
  let userName = 'Usuário';
  try {
    const s = await invoke<Record<string, string>>('settings:getAll');
    userName = s.user_name ?? userName;
  } catch { /* noop */ }

  const initials = userName.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const currentRoute = window.location.hash.replace(/^#/, '') || 'dashboard';
  const openGroups = readOpenGroups();
  const activeGroup = groupForRoute(currentRoute);
  if (activeGroup) openGroups.add(activeGroup);
  writeOpenGroups(openGroups);

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
      ${NAV.map(group => `
        <div class="nav-section ${openGroups.has(group.id) ? 'open' : ''}" data-group="${group.id}">
          <button class="nav-group" type="button" data-toggle-group="${group.id}" aria-expanded="${openGroups.has(group.id) ? 'true' : 'false'}">
            <span class="nav-group-main">
              <i class="ti ${group.icon}"></i>
              ${group.label}
            </span>
            <i class="ti ti-chevron-down nav-group-chevron"></i>
          </button>
          <div class="nav-subitems">
          ${group.items.map(it => `
            <a class="nav-item" data-route="${it.route}" href="#${it.route}">
              <i class="ti ${it.icon}"></i>
              ${it.label}
            </a>
          `).join('')}
          </div>
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

  el.querySelectorAll<HTMLElement>('[data-toggle-group]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.toggleGroup!;
      const groups = readOpenGroups();
      const section = el.querySelector<HTMLElement>(`[data-group="${id}"]`);
      const isOpen = groups.has(id);
      if (isOpen) groups.delete(id);
      else groups.add(id);
      writeOpenGroups(groups);
      section?.classList.toggle('open', !isOpen);
      btn.setAttribute('aria-expanded', String(!isOpen));
    });
  });
}

export function setActiveRoute(route: string): void {
  const activeGroup = groupForRoute(route);
  if (activeGroup) {
    const groups = readOpenGroups();
    groups.add(activeGroup);
    writeOpenGroups(groups);
  }

  document.querySelectorAll<HTMLElement>('.nav-section').forEach(el => {
    const isActiveGroup = el.dataset.group === activeGroup;
    if (isActiveGroup) {
      el.classList.add('open');
      el.querySelector<HTMLElement>('.nav-group')?.setAttribute('aria-expanded', 'true');
    }
    el.classList.toggle('active-group', isActiveGroup);
  });

  document.querySelectorAll<HTMLElement>('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.route === route);
  });
}
