import type { ImportPreviewRow } from '../../shared/types';

function tag(content: string, name: string): string | null {
  const m = content.match(new RegExp(`<${name}>([^<]+)`, 'i'));
  return m ? m[1].trim() : null;
}

function allTags(content: string, name: string): string[] {
  const re = new RegExp(`<${name}>([\\s\\S]*?)<\/${name}>`, 'gi');
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) results.push(m[1]);
  return results;
}

function ofxDate(raw: string): string {
  // YYYYMMDDHHMMSS[.mmm][+HH:mm] → YYYY-MM-DD
  const d = raw.replace(/[^0-9]/g, '').slice(0, 8);
  if (d.length < 8) return new Date().toISOString().slice(0, 10);
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

export function parseOFX(content: string): ImportPreviewRow[] {
  const stmttrns = allTags(content, 'STMTTRN');
  if (stmttrns.length === 0) {
    // SGML format: split by <STMTTRN> blocks without closing tags
    const blocks = content.split(/<STMTTRN>/i).slice(1);
    return blocks.map(block => parseSgmlBlock(block)).filter(Boolean) as ImportPreviewRow[];
  }

  return stmttrns.map(block => {
    const dtposted = tag(block, 'DTPOSTED') ?? '';
    const trnamt   = parseFloat(tag(block, 'TRNAMT') ?? '0');
    const memo     = tag(block, 'MEMO') ?? tag(block, 'NAME') ?? '';
    const fitid    = tag(block, 'FITID') ?? null;

    return {
      date: ofxDate(dtposted),
      description: memo,
      amount: Math.abs(trnamt),
      type: trnamt >= 0 ? 'income' : 'expense',
      fitid,
      duplicate: false,
    } as ImportPreviewRow;
  });
}

function parseSgmlBlock(block: string): ImportPreviewRow | null {
  const dtposted = tag(block, 'DTPOSTED') ?? '';
  const trnamt   = parseFloat(tag(block, 'TRNAMT') ?? '0');
  const memo     = tag(block, 'MEMO') ?? tag(block, 'NAME') ?? '';
  const fitid    = tag(block, 'FITID') ?? null;

  if (!dtposted && !memo) return null;

  return {
    date: ofxDate(dtposted),
    description: memo,
    amount: Math.abs(trnamt),
    type: trnamt >= 0 ? 'income' : 'expense',
    fitid,
    duplicate: false,
  };
}
