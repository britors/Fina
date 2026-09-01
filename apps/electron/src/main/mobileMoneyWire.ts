import { fromCents, toExactCents } from '../shared/money';

export interface MobileMoneyWireValue {
  amount?: unknown;
  amount_cents?: unknown;
}

export function decodeMobileMoney(value: MobileMoneyWireValue): number {
  const hasDecimal = Object.prototype.hasOwnProperty.call(value, 'amount');
  const hasCents = Object.prototype.hasOwnProperty.call(value, 'amount_cents');
  if (hasDecimal === hasCents) throw new Error('mobile-money-unit-ambiguous');

  if (hasCents) {
    if (typeof value.amount_cents !== 'number' || !Number.isSafeInteger(value.amount_cents)) {
      throw new Error('mobile-money-cents-invalid');
    }
    return fromCents(value.amount_cents);
  }

  if (typeof value.amount !== 'number') throw new Error('mobile-money-decimal-invalid');
  return fromCents(toExactCents(value.amount));
}
