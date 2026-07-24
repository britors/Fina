import { invoke, send } from './api';

const form = document.getElementById('unlock-form') as HTMLFormElement;
const input = document.getElementById('password') as HTMLInputElement;
const btn = document.getElementById('submit-btn') as HTMLButtonElement;
const errorEl = document.getElementById('error') as HTMLElement;

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  btn.disabled = true;
  errorEl.textContent = '';
  try {
    const ok = await invoke<boolean>('security:unlock', input.value);
    if (ok) {
      send('security:unlocked');
    } else {
      errorEl.textContent = 'Senha incorreta. Tente novamente.';
      input.value = '';
      input.focus();
    }
  } finally {
    btn.disabled = false;
  }
});
