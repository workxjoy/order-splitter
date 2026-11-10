import { Decimal } from 'decimal.js';

// amount / price can need ~23 significant digits (1e13 shares at 9 dp). 40 leaves enough headroom
// that rounding down never sees a value that was already rounded up.
const MONEY_PRECISION = 40;

// A separate clone, so the global decimal.js settings are never changed.
export const Money = Decimal.clone({ precision: MONEY_PRECISION, rounding: Decimal.ROUND_HALF_UP });
export type Money = Decimal;

export const CENTS_DECIMALS = 2;
const MIN_PRICE_DISPLAY_DECIMALS = 2;

export function sumOf(values: readonly Money[]): Money {
  return values.reduce((total, value) => total.plus(value), new Money(0));
}

export function formatAmount(amount: Money): string {
  return amount.toFixed(CENTS_DECIMALS);
}

// At least two decimals, more for sub-penny prices: 100 -> "100.00", 0.1234 -> "0.1234".
export function formatPrice(price: Money): string {
  return price.toFixed(Math.max(MIN_PRICE_DISPLAY_DECIMALS, price.decimalPlaces()));
}
