export interface ModalOptions {
  title: string;
  body: string;
  saveLabel?: string;
  onSave?: (overlay: HTMLElement) => void | boolean | Promise<void | boolean | false | undefined>;
}

export function openModal(opts: ModalOptions): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <span class="modal-title">${opts.title}</span>
        <button class="modal-close" aria-label="Fechar">✕</button>
      </div>
      <div class="modal-body">${opts.body}</div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-close>Cancelar</button>
        <button class="btn btn-primary" data-save>${opts.saveLabel ?? 'Salvar'}</button>
      </div>
    </div>
  `;

  const close = (): void => { overlay.remove(); };

  overlay.querySelector<HTMLButtonElement>('.modal-close')!.addEventListener('click', close);
  overlay.querySelector<HTMLButtonElement>('[data-close]')!.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  overlay.querySelector<HTMLButtonElement>('[data-save]')!.addEventListener('click', () => {
    if (opts.onSave) {
      const keep = opts.onSave(overlay);
      if (keep !== false) close();
    } else {
      close();
    }
  });

  document.body.appendChild(overlay);
  (overlay.querySelector('input, select, textarea') as HTMLElement | null)?.focus();
  return overlay;
}

export function closeAllModals(): void {
  document.querySelectorAll('.overlay').forEach(el => el.remove());
}
