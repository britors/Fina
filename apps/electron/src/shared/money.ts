export type Cents = number & { readonly __brand: 'Cents' };

export const MAX_SAFE_CENTS = Number.MAX_SAFE_INTEGER;

export function toCents(value: number): Cents {
  if (!Number.isFinite(value)) throw new Error('money-not-finite');
  const absoluteScaled = Math.abs(value) * 100;
  const tolerance = Number.EPSILON * Math.max(1, absoluteScaled) * 4;
  const cents = Math.sign(value) * Math.floor(absoluteScaled + 0.5 + tolerance);
  if (!Number.isSafeInteger(cents)) throw new Error('money-out-of-range');
  return cents as Cents;
}

export function fromCents(cents: number): number {
  if (!Number.isSafeInteger(cents)) throw new Error('cents-invalid');
  return cents / 100;
}

export function roundMoney(value: number): number {
  return fromCents(toCents(value));
}

// Parser canônico para integrações que já normalizaram o separador decimal.
// Rejeita expoente e mais de duas casas para não arredondar silenciosamente.
export function parseDecimalCents(value: string): Cents {
  const match = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new Error('money-format-invalid');
  const [, sign, whole, fraction = ''] = match;
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) throw new Error('money-out-of-range');
  return (sign === '-' ? -cents : cents) as Cents;
}

export function splitCents(total: Cents, parts: number): Cents[] {
  if (!Number.isInteger(parts) || parts < 1) throw new Error('money-parts-invalid');
  const sign = Math.sign(total) || 1;
  const absolute = Math.abs(total);
  const base = Math.floor(absolute / parts);
  let remainder = absolute % parts;
  return Array.from({ length: parts }, () => {
    const value = base + (remainder-- > 0 ? 1 : 0);
    return (value * sign) as Cents;
  });
}
