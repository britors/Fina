import { invoke } from '../api';
import { isSidebarCollapsed, setSidebarCollapsed } from './layoutPrefs';

export function initTopbar(el: HTMLElement): void {
  el.innerHTML = `
    <div class="topbar-left" style="-webkit-app-region:no-drag">
      <button class="tb-menu-toggle" id="tb-menu-toggle" type="button" title="Mostrar/ocultar menu"><i class="ti ti-menu-2"></i></button>
      <div class="topbar-info">
        <div class="topbar-title"  id="topbar-title"></div>
        <div class="topbar-subtitle" id="topbar-subtitle"></div>
      </div>
    </div>
    <div class="topbar-right" style="-webkit-app-region:no-drag">
      <div class="topbar-actions" id="topbar-actions"></div>
      <div class="win-controls">
        <button class="wc-btn" id="wc-min"   title="Minimizar">&#x2013;</button>
        <button class="wc-btn" id="wc-max"   title="Maximizar">&#x25A1;</button>
        <button class="wc-btn wc-close" id="wc-close" title="Fechar">&#x2715;</button>
      </div>
    </div>
  `;

  document.getElementById('wc-min')?.addEventListener('click', () => invoke('window:minimize'));
  document.getElementById('wc-max')?.addEventListener('click', () => invoke('window:toggleMaximize'));
  document.getElementById('wc-close')?.addEventListener('click', () => invoke('window:close'));
  document.getElementById('tb-menu-toggle')?.addEventListener('click', () => setSidebarCollapsed(!isSidebarCollapsed()));

  initTopbarDropdowns();
}

let dropdownsInitialized = false;

// Menus de ações do topbar são <details class="topbar-dropdown">; fecha ao
// clicar fora ou ao selecionar um item, sem interferir no toggle nativo do
// clique no <summary>.
function initTopbarDropdowns(): void {
  if (dropdownsInitialized) return;
  dropdownsInitialized = true;
  document.addEventListener('click', e => {
    const target = e.target as HTMLElement;
    document.querySelectorAll<HTMLDetailsElement>('.topbar-dropdown[open]').forEach(dd => {
      if (!dd.contains(target) || target.closest('.dd-item')) dd.open = false;
    });
  });

  // .topbar-actions precisa de overflow horizontal para nunca empurrar os
  // botões de janela para fora da tela; posicionamos o menu com `fixed` (via
  // JS, na abertura) para que ele escape desse clipping em vez de position:
  // absolute, que seria cortado pelo overflow do container.
  document.addEventListener('toggle', e => {
    const dd = e.target as HTMLDetailsElement;
    if (!dd.classList?.contains('topbar-dropdown')) return;
    const menu = dd.querySelector<HTMLElement>('.topbar-dropdown-menu');
    if (!menu || !dd.open) return;
    const r = dd.getBoundingClientRect();
    menu.style.top = `${r.bottom + 6}px`;
    menu.style.right = `${window.innerWidth - r.right}px`;
  }, true);
}

export function setTopbar(title: string, subtitle?: string): void {
  const t = document.getElementById('topbar-title');
  const s = document.getElementById('topbar-subtitle');
  if (t) t.textContent = title;
  if (s) { s.textContent = subtitle ?? ''; s.style.display = subtitle ? '' : 'none'; }
}

export function setTopbarActions(html: string): void {
  const el = document.getElementById('topbar-actions');
  if (el) el.innerHTML = html;
}
