export interface DonutSegment { value: number; color: string; label: string; }

export function createDonut(segments: DonutSegment[], size = 170, line1 = '', line2 = ''): string {
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
  const arcs = segments.map(seg => {
    const dash = (seg.value / total) * circ;
    const gap  = circ - dash;
    const el   = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
      stroke="${seg.color}" stroke-width="26"
      stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}"
      stroke-dashoffset="${(-offset).toFixed(2)}"
      transform="rotate(-90 ${cx} ${cy})"/>`;
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
