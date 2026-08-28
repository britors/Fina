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

function ofxDate(raw: string): string | null {
  // YYYYMMDDHHMMSS[.mmm][+HH:mm] → YYYY-MM-DD
  const d = raw.replace(/[^0-9]/g, '').slice(0, 8);
  if (d.length < 8) return null;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

function buildRow(block: string): ImportPreviewRow | null {
  const dtposted = tag(block, 'DTPOSTED') ?? '';
  const amountRaw = tag(block, 'TRNAMT');
  // TRNAMT deve usar ponto decimal por especificação OFX; vírgula indica
  // um export fora do padrão — não adivinhamos o valor, descartamos a linha.
  const trnamt = amountRaw !== null && /^-?\d+(\.\d+)?$/.test(amountRaw.trim()) ? parseFloat(amountRaw) : NaN;
  const memo   = tag(block, 'MEMO') ?? tag(block, 'NAME') ?? '';
  const fitid  = tag(block, 'FITID') ?? null;
  const date   = ofxDate(dtposted);

  if (!date || !Number.isFinite(trnamt) || trnamt === 0) return null;

  return {
    date,
    description: memo,
    amount: Math.abs(trnamt),
    type: trnamt >= 0 ? 'income' : 'expense',
    fitid,
    duplicate: false,
  };
}

export function parseOFX(content: string): ImportPreviewRow[] {
  const stmttrns = allTags(content, 'STMTTRN');
  const blocks = stmttrns.length > 0
    ? stmttrns
    // SGML format: split by <STMTTRN> blocks without closing tags
    : content.split(/<STMTTRN>/i).slice(1);

  return blocks.map(block => buildRow(block)).filter(Boolean) as ImportPreviewRow[];
}
