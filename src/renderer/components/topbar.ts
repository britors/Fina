export function initTopbar(el: HTMLElement): void {
  el.innerHTML = `
    <div class="topbar-info">
      <div class="topbar-title"  id="topbar-title"></div>
      <div class="topbar-subtitle" id="topbar-subtitle"></div>
    </div>
    <div class="topbar-actions" id="topbar-actions"></div>
  `;
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
