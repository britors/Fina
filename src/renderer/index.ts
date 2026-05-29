import { initSidebar } from './components/sidebar';
import { initTopbar  } from './components/topbar';
import { initRouter  } from './router';
import { invoke } from './api';
import { applyAccent, applyTheme } from './theme';

document.addEventListener('DOMContentLoaded', async () => {
  const sidebarEl = document.getElementById('sidebar')!;
  const topbarEl  = document.getElementById('topbar')!;
  const contentEl = document.getElementById('content')!;

  try {
    const s = await invoke<Record<string, string>>('settings:getAll');
    if (s.accent_color) applyAccent(s.accent_color);
    if (s.theme)        applyTheme(s.theme);
  } catch { /* noop */ }

  await initSidebar(sidebarEl);
  initTopbar(topbarEl);
  initRouter(contentEl);
});
