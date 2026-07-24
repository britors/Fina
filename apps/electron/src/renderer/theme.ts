export function applyAccent(color: string): void {
  document.documentElement.style.setProperty('--accent', color);
  document.documentElement.style.setProperty('--accent-h', darken(color, 0.1));
}

export function applyTheme(theme: string): void {
  document.body.classList.toggle('theme-light', theme === 'light');
}

function darken(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.round(((n >> 16) & 0xff) * (1 - amount)));
  const g = Math.max(0, Math.round(((n >> 8)  & 0xff) * (1 - amount)));
  const b = Math.max(0, Math.round((n          & 0xff) * (1 - amount)));
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}
