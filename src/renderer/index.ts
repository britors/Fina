import { initSidebar } from './components/sidebar';
import { initTopbar  } from './components/topbar';
import { initRouter  } from './router';
import { invoke } from './api';
import { applyAccent, applyTheme } from './theme';

interface FocusSnapshot {
  el: HTMLElement | null;
  start: number | null;
  end: number | null;
}

function installDialogFocusRestore(): void {
  const originalAlert = window.alert.bind(window);
  const originalConfirm = window.confirm.bind(window);
  let lastEditable: HTMLElement | null = null;

  document.addEventListener('focusin', (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
      lastEditable = target;
    }
  });

  const captureFocus = (): FocusSnapshot => {
    const el = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      return { el, start: el.selectionStart, end: el.selectionEnd };
    }
    return { el, start: null, end: null };
  };

  const fallbackControl = (): HTMLElement | null =>
    document.querySelector<HTMLElement>('.overlay input, .overlay select, .overlay textarea, input, select, textarea');

  const isEditable = (el: HTMLElement | null): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement =>
    el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;

  const restoreFocus = (snapshot: FocusSnapshot): void => {
    const savedEditable = lastEditable && document.contains(lastEditable) ? lastEditable : null;
    const target = isEditable(snapshot.el) && document.contains(snapshot.el)
      ? snapshot.el
      : savedEditable ?? fallbackControl();
    const restore = (): void => {
      void invoke('window:focus').catch(() => {});
      window.focus();
      target?.focus({ preventScroll: true });
      if (
        (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) &&
        snapshot.start != null &&
        snapshot.end != null
      ) {
        target.setSelectionRange(snapshot.start, snapshot.end);
      }
    };

    requestAnimationFrame(restore);
    window.setTimeout(restore, 50);
  };

  window.alert = (message?: unknown): void => {
    const snapshot = captureFocus();
    originalAlert(message);
    restoreFocus(snapshot);
  };

  window.confirm = (message?: string): boolean => {
    const snapshot = captureFocus();
    const result = originalConfirm(message);
    restoreFocus(snapshot);
    return result;
  };
}

installDialogFocusRestore();

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
