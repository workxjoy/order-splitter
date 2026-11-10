import { CURRENCY, LOCALE } from './constants';

const MIN_MONEY_DECIMALS = 2;
const MAX_PRICE_DECIMALS = 4;

const usdFormatter = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: CURRENCY,
  minimumFractionDigits: MIN_MONEY_DECIMALS,
  maximumFractionDigits: MAX_PRICE_DECIMALS,
});

// One formatter per time zone.
const marketTimeFormatters = new Map<string, Intl.DateTimeFormat>();

function marketTimeFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = marketTimeFormatters.get(timeZone);
  if (!formatter) {
    // dateStyle/timeStyle cannot be combined with timeZoneName, so list the fields.
    formatter = new Intl.DateTimeFormat(LOCALE, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone,
      timeZoneName: 'short',
    });
    marketTimeFormatters.set(timeZone, formatter);
  }
  return formatter;
}

// Intl formats numeric strings exactly, so amounts never go through floating point.
export function formatUsd(amount: string): string {
  return usdFormatter.format(amount as Intl.StringNumericLiteral);
}

export function formatPercent(percent: string): string {
  return `${percent}%`;
}

// e.g. "Nov 16, 2026, 9:30 AM EST", in the time zone of the market the order runs on.
export function formatMarketTime(isoTimestamp: string, timeZone: string): string {
  return marketTimeFormatter(timeZone).format(new Date(isoTimestamp));
}
