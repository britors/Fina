export interface DonutSegment { value: number; color: string; label: string; }

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// `ids` é opcional e alinhado por índice a `segments`: quando informado, cada
// fatia recebe `data-cat-id` e cursor de ponteiro, para que a página chamadora
// implemente drill-down (ex.: clicar na fatia e navegar para os lançamentos
// daquela categoria) via delegação de evento, sem acoplar este componente a
// nenhuma lógica de navegação.
export function createDonut(segments: DonutSegment[], size = 170, line1 = '', line2 = '', ids: (string | null)[] = []): string {
  const total = segments.reduce((s, g) => s + g.value, 0);
  const cx = size / 2, cy = size / 2, r = size / 2 - 20;
  const circ = 2 * Math.PI * r;

  if (total === 0) {
    return `<svg width="${size}" height="${size}">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#2A2D3A" stroke-width="28"/>
      ${centerText(cx, cy, 'Sem dados', '')}
    </svg>`;
  }

  let offset = 0;
  const arcs = segments.map((seg, index) => {
    const dash = (seg.value / total) * circ;
    const gap  = circ - dash;
    const id = ids[index];
    const clickAttrs = id !== undefined ? `data-cat-id="${id ?? ''}" style="cursor:pointer"` : '';
    const el   = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
      stroke="${seg.color}" stroke-width="26"
      stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}"
      stroke-dashoffset="${(-offset).toFixed(2)}"
      transform="rotate(-90 ${cx} ${cy})" ${clickAttrs}><title>${esc(seg.label)}</title></circle>`;
    offset += dash;
    return el;
  });

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${arcs.join('')}
    ${centerText(cx, cy, line1, line2)}
  </svg>`;
}

function centerText(cx: number, cy: number, l1: string, l2: string): string {
  if (!l1) return '';
  return `
    <text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="11" font-weight="500" fill="#FFFFFF" font-family="Inter,system-ui">${l1}</text>
    ${l2 ? `<text x="${cx}" y="${cy + 10}" text-anchor="middle" font-size="10" fill="#9CA3AF" font-family="Inter,system-ui">${l2}</text>` : ''}
  `;
}

export interface AreaPoint { date: string; balance: number; }

export function createAreaChart(data: AreaPoint[], width = 560, height = 160): string {
  if (data.length < 2) return '';

  const padL = 40, padR = 12, padT = 12, padB = 24;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  const values  = data.map(d => d.balance);
  const minVal  = Math.min(...values);
  const maxVal  = Math.max(...values);
  const range   = maxVal - minVal || 1;

  function xPos(i: number): number { return padL + (i / (data.length - 1)) * chartW; }
  function yPos(v: number): number { return padT + chartH - ((v - minVal) / range) * chartH; }

  const pts = data.map((d, i) => `${xPos(i).toFixed(1)},${yPos(d.balance).toFixed(1)}`).join(' ');
  const areaPath = `M ${xPos(0).toFixed(1)},${yPos(data[0].balance).toFixed(1)} ` +
    data.slice(1).map((d, i) => `L ${xPos(i + 1).toFixed(1)},${yPos(d.balance).toFixed(1)}`).join(' ') +
    ` L ${xPos(data.length - 1).toFixed(1)},${(padT + chartH).toFixed(1)}` +
    ` L ${xPos(0).toFixed(1)},${(padT + chartH).toFixed(1)} Z`;

  // Marcadores de data (início, meio, fim)
  const ticks = [0, Math.floor((data.length - 1) / 2), data.length - 1].map(i => {
    const d = data[i];
    const label = new Date(d.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    return `<text x="${xPos(i).toFixed(1)}" y="${height - 4}" text-anchor="middle" font-size="9" fill="#6B7280" font-family="Inter,system-ui">${label}</text>`;
  });

  // Linha zero se houver valores negativos
  const zeroLine = minVal < 0 ? `<line x1="${padL}" y1="${yPos(0).toFixed(1)}" x2="${padL + chartW}" y2="${yPos(0).toFixed(1)}" stroke="#D85A30" stroke-width="0.8" stroke-dasharray="3,2" opacity="0.5"/>` : '';

  // Cor varia se o saldo final for negativo
  const endNegative = data[data.length - 1].balance < 0;
  const lineColor   = endNegative ? '#D85A30' : '#1D9E75';
  const areaColor   = endNegative ? 'rgba(216,90,48,0.12)' : 'rgba(29,158,117,0.12)';

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="overflow:visible">
    <defs>
      <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${lineColor}" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="${lineColor}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + chartH}" stroke="#2A2D3A" stroke-width="0.5"/>
    <line x1="${padL}" y1="${padT + chartH}" x2="${padL + chartW}" y2="${padT + chartH}" stroke="#2A2D3A" stroke-width="0.5"/>
    ${zeroLine}
    <path d="${areaPath}" fill="url(#area-grad)"/>
    <polyline points="${pts}" fill="none" stroke="${lineColor}" stroke-width="1.8" stroke-linejoin="round"/>
    ${ticks.join('')}
  </svg>`;
}

export interface BarPair { label: string; income: number; expense: number; }

export function createBarChart(data: BarPair[], width = 560, height = 200): string {
  if (data.length === 0) return '';

  const padL = 8, padR = 8, padT = 20, padB = 24;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const maxVal = Math.max(...data.flatMap(d => [d.income, d.expense]), 1);

  const n = data.length;
  const pairW   = chartW / n;
  const barW    = Math.floor(pairW * 0.28);
  const pairGap = Math.floor(pairW * 0.08);

  const bars = data.map((d, i) => {
    const x0 = padL + i * pairW + (pairW - 2 * barW - pairGap) / 2;
    const ih  = (d.income  / maxVal) * chartH;
    const eh  = (d.expense / maxVal) * chartH;
    const iLast = i === n - 1;

    return `
      <rect x="${x0.toFixed(1)}" y="${(padT + chartH - ih).toFixed(1)}" width="${barW}" height="${ih.toFixed(1)}"
        rx="2" fill="#1D9E75" opacity="${iLast ? 1 : 0.72}"/>
      <rect x="${(x0 + barW + pairGap).toFixed(1)}" y="${(padT + chartH - eh).toFixed(1)}" width="${barW}" height="${eh.toFixed(1)}"
        rx="2" fill="#D85A30" opacity="${iLast ? 1 : 0.72}"/>
      <text x="${(x0 + barW + pairGap / 2).toFixed(1)}" y="${height - 4}"
        text-anchor="middle" font-size="9" fill="${iLast ? '#FFFFFF' : '#6B7280'}"
        font-family="Inter,system-ui">${d.label}</text>
    `;
  });

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <line x1="${padL}" y1="${padT + chartH}" x2="${width - padR}" y2="${padT + chartH}" stroke="#2A2D3A" stroke-width="0.5"/>
    ${bars.join('')}
  </svg>`;
}
