function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

interface DialogOptions {
  title: string;
  message: string;
  okLabel: string;
  cancelLabel?: string;
  danger?: boolean;
}

function openDialog(opts: DialogOptions): Promise<boolean> {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="modal" role="alertdialog" aria-modal="true" style="min-width:360px;max-width:460px">
        <div class="modal-header">
          <span class="modal-title">${esc(opts.title)}</span>
          <button class="modal-close" aria-label="Fechar">✕</button>
        </div>
        <div class="modal-body" style="color:var(--text-2);line-height:1.6;white-space:pre-wrap">${esc(opts.message)}</div>
        <div class="modal-footer">
          ${opts.cancelLabel ? `<button class="btn btn-secondary" data-cancel>${esc(opts.cancelLabel)}</button>` : ''}
          <button class="btn ${opts.danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(opts.okLabel)}</button>
        </div>
      </div>
    `;

    let settled = false;
    const finish = (result: boolean): void => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKeydown);
      overlay.remove();
      // No Windows, janelas frameless podem perder o foco se o elemento focado for removido.
      document.body.focus();
      resolve(result);
    };

    const onKeydown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') finish(false);
      else if (e.key === 'Enter' && !opts.cancelLabel) finish(true);
    };
    document.addEventListener('keydown', onKeydown);

    overlay.querySelector('.modal-close')?.addEventListener('click', () => finish(false));
    overlay.querySelector('[data-cancel]')?.addEventListener('click', () => finish(false));
    overlay.querySelector('[data-ok]')?.addEventListener('click', () => finish(true));
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) finish(false); });

    document.body.appendChild(overlay);
    overlay.querySelector<HTMLButtonElement>('[data-ok]')!.focus();
  });
}

/** Substitui window.alert(): aviso com um único botão OK, sem travar o processo de renderização. */
export function showAlert(message: string, title = 'Aviso'): Promise<void> {
  return openDialog({ title, message, okLabel: 'OK' }).then(() => undefined);
}

export interface ConfirmOptions {
  title?: string;
  okLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

/** Substitui window.confirm(): resolve true/false conforme o botão clicado. */
export function showConfirm(message: string, opts: ConfirmOptions = {}): Promise<boolean> {
  return openDialog({
    title: opts.title ?? 'Confirmar',
    message,
    okLabel: opts.okLabel ?? 'Confirmar',
    cancelLabel: opts.cancelLabel ?? 'Cancelar',
    danger: opts.danger,
  });
}
