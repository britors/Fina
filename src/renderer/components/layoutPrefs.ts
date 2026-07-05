const KEY = 'fina.sidebar.collapsed';

export function isSidebarCollapsed(): boolean {
  return localStorage.getItem(KEY) === '1';
}

export function setSidebarCollapsed(collapsed: boolean): void {
  document.body.classList.toggle('sidebar-collapsed', collapsed);
  localStorage.setItem(KEY, collapsed ? '1' : '0');
}

export function applyInitialSidebarState(): void {
  document.body.classList.toggle('sidebar-collapsed', isSidebarCollapsed());
}
