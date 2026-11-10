import { describe, expect, it } from 'vitest';
import { formatMarketTime, formatPercent, formatUsd } from './format';

describe('formatUsd', () => {
  it.each([
    ['100.00', '$100.00'],
    ['1234567.5', '$1,234,567.50'],
    ['0.1234', '$0.1234'],
    // Beyond Number.MAX_SAFE_INTEGER: formatted exactly from the string.
    ['90071992547409931.23', '$90,071,992,547,409,931.23'],
  ])('formats %s as %s', (amount, expected) => {
    expect(formatUsd(amount)).toBe(expected);
  });
});

describe('formatPercent', () => {
  it('appends a percent sign without reformatting the value', () => {
    expect(formatPercent('33.3333')).toBe('33.3333%');
  });
});

describe('formatMarketTime', () => {
  it('renders instants in the market time zone with the zone abbreviation', () => {
    expect(formatMarketTime('2026-11-16T14:30:00.000Z', 'America/New_York')).toBe(
      'Nov 16, 2026, 9:30 AM EST',
    );
    expect(formatMarketTime('2026-07-15T13:30:00.000Z', 'America/New_York')).toBe(
      'Jul 15, 2026, 9:30 AM EDT',
    );
  });

  it('follows the market time zone the API reports', () => {
    expect(formatMarketTime('2026-11-16T08:00:00.000Z', 'Europe/London')).toBe(
      'Nov 16, 2026, 8:00 AM GMT',
    );
  });
});
