import { invoke } from '../api';

export function initTopbar(el: HTMLElement): void {
  el.innerHTML = `
    <div class="topbar-info">
      <div class="topbar-title"  id="topbar-title"></div>
      <div class="topbar-subtitle" id="topbar-subtitle"></div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;-webkit-app-region:no-drag">
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
