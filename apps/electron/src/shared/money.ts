export type Cents = number & { readonly __brand: 'Cents' };

export const MAX_SAFE_CENTS = Number.MAX_SAFE_INTEGER;

function shiftDecimal(value: number, places: number): number {
  const [coefficient, exponent = '0'] = value.toString().split('e');
  return Number(`${coefficient}e${Number(exponent) + places}`);
}

export function toCents(value: number): Cents {
  if (!Number.isFinite(value)) throw new Error('money-not-finite');
  // Deslocar pelo expoente decimal evita tanto 1.005 * 100 = 100.4999…
  // quanto uma tolerância crescente que alteraria vários centavos em valores
  // grandes. O sinal separado mantém empate arredondado para longe de zero.
  const cents = Math.sign(value) * Math.round(shiftDecimal(Math.abs(value), 2));
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

export function toExactCents(value: number): Cents {
  const cents = toCents(value);
  if (fromCents(cents) !== value) throw new Error('money-precision-unsupported');
  return cents;
}

export function reconcileMoneyParts(total: number, parts: readonly number[]): number[] {
  const totalCents = toExactCents(total);
  const partCents = parts.map(toExactCents);
  const sum = partCents.reduce((result, value) => result + BigInt(value), 0n);
  if (sum !== BigInt(totalCents)) throw new Error('money-total-mismatch');
  return partCents.map(fromCents);
}

// Parser canônico para integrações que já normalizaram o separador decimal.
// Rejeita expoente e mais de duas casas para não arredondar silenciosamente.
export function parseDecimalCents(value: string): Cents {
  const match = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new Error('money-format-invalid');
  const [, sign, whole, fraction = ''] = match;
  const absoluteCents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (absoluteCents > BigInt(MAX_SAFE_CENTS)) throw new Error('money-out-of-range');
  const cents = Number(absoluteCents);
  return (sign === '-' ? -cents : cents) as Cents;
}

export function splitCents(total: Cents, parts: number): Cents[] {
  if (!Number.isSafeInteger(total)) throw new Error('cents-invalid');
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
