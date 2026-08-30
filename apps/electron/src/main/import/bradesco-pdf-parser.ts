import type { ImportPreviewRow } from '../../shared/types';

export interface PdfTextItem {
  text: string;
  x: number;
  y: number;
}

export interface PdfTextPage {
  items: PdfTextItem[];
}

function money(value: string): number | null {
  const normalized = value.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  if (!/^\d+(?:\.\d{2})$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function isoDate(value: string): string | null {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const result = `${match[3]}-${match[2]}-${match[1]}`;
  const date = new Date(`${result}T00:00:00`);
  return date.getFullYear() === Number(match[3]) && date.getMonth() + 1 === Number(match[2]) && date.getDate() === Number(match[1])
    ? result
    : null;
}

/** Parses the positioned text emitted by Bradesco's account-statement PDF. */
export function parseBradescoPdfPages(pages: PdfTextPage[]): ImportPreviewRow[] {
  const allText = pages.flatMap(page => page.items).map(item => item.text).join(' ');
  if (!/Bradesco/i.test(allText) || !/Cr[eé]dito\s*\(R\$\)/i.test(allText) || !/D[eé]bito\s*\(R\$\)/i.test(allText)) {
    throw new Error('Este PDF não parece ser um extrato de conta do Bradesco.');
  }

  const rows: ImportPreviewRow[] = [];
  let currentDate: string | null = null;

  for (const page of pages) {
    const groups = new Map<number, PdfTextItem[]>();
    for (const item of page.items) {
      const y = Math.round(item.y);
      const group = groups.get(y) ?? [];
      group.push(item);
      groups.set(y, group);
    }
    const lines = [...groups.entries()]
      .map(([y, items]) => ({ y, items: items.sort((a, b) => a.x - b.x) }))
      .sort((a, b) => b.y - a.y);

    const anchors = lines.filter(line => line.items.some(item => item.x >= 385 && item.x < 520 && money(item.text) !== null));
    for (let index = 0; index < anchors.length; index++) {
      const anchor = anchors[index];
      const creditItem = anchor.items.find(item => item.x >= 385 && item.x < 452 && money(item.text) !== null);
      const debitItem = anchor.items.find(item => item.x >= 452 && item.x < 520 && money(item.text) !== null);
      const amountItem = creditItem ?? debitItem;
      if (!amountItem) continue;

      const explicitDate = anchor.items.find(item => item.x < 90 && /^\d{2}\/\d{2}\/\d{4}$/.test(item.text));
      if (explicitDate) currentDate = isoDate(explicitDate.text);
      if (!currentDate) continue;

      const upper = index === 0 ? anchor.y + 16 : (anchors[index - 1].y + anchor.y) / 2;
      const lower = index === anchors.length - 1 ? anchor.y - 16 : (anchor.y + anchors[index + 1].y) / 2;
      const description = lines
        .filter(line => line.y < upper && line.y > lower)
        .flatMap(line => line.items.filter(item => item.x >= 90 && item.x < 300).map(item => item.text.trim()))
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!description || /^Total$/i.test(description)) continue;

      const amount = money(amountItem.text);
      if (amount === null) continue;
      const documentNumber = anchor.items.find(item => item.x >= 300 && item.x < 385)?.text.trim() ?? '';
      const type = creditItem ? 'income' : 'expense';
      rows.push({
        date: currentDate,
        description,
        amount,
        type,
        fitid: documentNumber ? `BRADESCO:${currentDate}:${documentNumber}:${type}:${amount.toFixed(2)}` : null,
        duplicate: false,
      });
    }
  }
  return rows;
}
