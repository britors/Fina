import { setTopbarActions } from '../components/topbar';

type ListState = 'none' | 'ul' | 'ol';

export async function render(el: HTMLElement): Promise<void> {
  setTopbarActions('');
  el.innerHTML = '<div class="loading"><i class="ti ti-loader-2"></i> Carregando manual...</div>';

  try {
    const res = await fetch('../MANUAL_USUARIO.md');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const md = await res.text();
    el.innerHTML = `
      <article class="manual-doc">
        ${renderMarkdown(md)}
      </article>
    `;
  } catch {
    el.innerHTML = `
      <div class="empty">
        <i class="ti ti-book-off"></i>
        <div class="empty-title">Manual indisponível</div>
        <p>Não foi possível carregar o manual do usuário.</p>
      </div>
    `;
  }
}

function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let paragraph: string[] = [];
  let list: ListState = 'none';

  function flushParagraph(): void {
    if (paragraph.length === 0) return;
    out.push(`<p>${inline(paragraph.join(' '))}</p>`);
    paragraph = [];
  }

  function closeList(): void {
    if (list === 'none') return;
    out.push(list === 'ul' ? '</ul>' : '</ol>');
    list = 'none';
  }

  function openList(next: Exclude<ListState, 'none'>): void {
    if (list === next) return;
    closeList();
    out.push(next === 'ul' ? '<ul>' : '<ol>');
    list = next;
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      closeList();
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    const bullet = /^-\s+(.+)$/.exec(trimmed);
    if (bullet) {
      flushParagraph();
      openList('ul');
      out.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }

    const numbered = /^\d+\.\s+(.+)$/.exec(trimmed);
    if (numbered) {
      flushParagraph();
      openList('ol');
      out.push(`<li>${inline(numbered[1])}</li>`);
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  closeList();
  return out.join('\n');
}

function inline(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
