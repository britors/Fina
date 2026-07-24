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
      { route: 'score',        label: 'Score',       icon: 'ti-gauge'             },
      { route: 'revisao-semanal', label: 'Revisão semanal', icon: 'ti-checklist' },
      { route: 'decisoes',    label: 'Decisões',    icon: 'ti-route'             },
      { route: 'plano-mensal', label: 'Plano mensal', icon: 'ti-calendar-stats'   },
      { route: 'alertas',      label: 'Alertas',     icon: 'ti-alert-triangle'    },
      { route: 'assistente',   label: 'Assistente IA', icon: 'ti-sparkles'        },
    ],
  },
  {
    id: 'movement',
    label: 'Movimentação',
    icon: 'ti-transfer',
    items: [
      { route: 'transactions', label: 'Lançamentos', icon: 'ti-receipt' },
      { route: 'accounts',     label: 'Contas e Cartões', icon: 'ti-building-bank' },
      { route: 'agenda',       label: 'Contas a pagar',     icon: 'ti-calendar'        },
      { route: 'contas-receber', label: 'Contas a receber', icon: 'ti-calendar-dollar' },
      { route: 'pix',          label: 'Pix',                 icon: 'ti-qrcode'          },
      { route: 'fixas',        label: 'Despesas fixas', icon: 'ti-repeat'          },
      { route: 'fixas-receber', label: 'Receitas fixas', icon: 'ti-repeat' },
      { route: 'calendario',   label: 'Calendário', icon: 'ti-calendar-month'  },
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
      { route: 'renegociacao',   label: 'Renegociação',     icon: 'ti-message-dollar' },
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
      { route: 'aposentadoria', label: 'Aposentadoria', icon: 'ti-beach' },
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
      { route: 'openfinance', label: 'Open Finance', icon: 'ti-plug-connected' },
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

interface SearchEntry extends NavItem {
  group: string;
}

const SEARCH_INDEX: SearchEntry[] = NAV.flatMap(group =>
  group.items.map(item => ({ ...item, group: group.label }))
);

function normalize(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function searchNav(query: string): SearchEntry[] {
  const q = normalize(query.trim());
  if (!q) return [];
  return SEARCH_INDEX
    .filter(entry => normalize(entry.label).includes(q) || normalize(entry.group).includes(q))
    .slice(0, 8);
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
    <div class="sidebar-search">
      <i class="ti ti-search sidebar-search-icon"></i>
      <input type="text" class="sidebar-search-input" id="sidebar-search-input" placeholder="Buscar no menu... (Ctrl+K)" autocomplete="off">
      <div class="sidebar-search-results" id="sidebar-search-results"></div>
    </div>
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

  initSidebarSearch(el);
}

function initSidebarSearch(el: HTMLElement): void {
  const searchWrap  = el.querySelector<HTMLElement>('.sidebar-search')!;
  const searchInput = el.querySelector<HTMLInputElement>('#sidebar-search-input')!;
  const resultsEl   = el.querySelector<HTMLElement>('#sidebar-search-results')!;

  let matches: SearchEntry[] = [];
  let highlighted = 0;

  function closeResults(): void {
    resultsEl.classList.remove('open');
    resultsEl.innerHTML = '';
    matches = [];
  }

  function renderResults(): void {
    if (matches.length === 0) { closeResults(); return; }
    resultsEl.innerHTML = matches.map((m, i) => `
      <div class="sidebar-search-item ${i === highlighted ? 'hl' : ''}" data-route="${m.route}">
        <i class="ti ${m.icon}"></i>
        <span>${m.label}</span>
        <span class="ssi-group">${m.group}</span>
      </div>
    `).join('');
    resultsEl.classList.add('open');
  }

  function selectMatch(route: string): void {
    window.location.hash = `#${route}`;
    searchInput.value = '';
    closeResults();
    searchInput.blur();
  }

  searchInput.addEventListener('input', () => {
    matches = searchNav(searchInput.value);
    highlighted = 0;
    renderResults();
  });

  searchInput.addEventListener('keydown', e => {
    if (matches.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); highlighted = (highlighted + 1) % matches.length; renderResults(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlighted = (highlighted - 1 + matches.length) % matches.length; renderResults(); }
    else if (e.key === 'Enter') { e.preventDefault(); selectMatch(matches[highlighted].route); }
    else if (e.key === 'Escape') { closeResults(); searchInput.blur(); }
  });

  resultsEl.addEventListener('click', e => {
    const item = (e.target as HTMLElement).closest<HTMLElement>('.sidebar-search-item');
    if (item?.dataset.route) selectMatch(item.dataset.route);
  });

  document.addEventListener('click', e => {
    if (!searchWrap.contains(e.target as Node)) closeResults();
  });

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
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
