import { initSidebar } from './components/sidebar';
import { initTopbar  } from './components/topbar';
import { initRouter  } from './router';

document.addEventListener('DOMContentLoaded', async () => {
  const sidebarEl = document.getElementById('sidebar')!;
  const topbarEl  = document.getElementById('topbar')!;
  const contentEl = document.getElementById('content')!;

  await initSidebar(sidebarEl);
  initTopbar(topbarEl);
  initRouter(contentEl);
});
