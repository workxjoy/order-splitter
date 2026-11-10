import { describe, expect, it } from 'vitest';
import { NYSE_EARLY_CLOSES, NYSE_HOLIDAYS } from './nyse-holidays.js';

const SATURDAY = 6;
const SUNDAY = 0;

const weekday = (date: string): number => new Date(`${date}T12:00:00Z`).getUTCDay();

describe('NYSE calendar (2026–2028, from nyse.com)', () => {
  it.each([
    ['holidays', NYSE_HOLIDAYS],
    ['early closes', NYSE_EARLY_CLOSES],
  ])('lists %s as sorted, unique weekdays', (_name, dates) => {
    expect([...dates].sort()).toEqual(dates);
    expect(new Set(dates).size).toBe(dates.length);
    for (const date of dates) expect([SATURDAY, SUNDAY]).not.toContain(weekday(date));
  });

  it('lists the published number of closures for each year', () => {
    const perYear = (year: string) => NYSE_HOLIDAYS.filter((date) => date.startsWith(year)).length;

    // 2028 has no New Year's Day closure: 1 January falls on a Saturday.
    expect([perYear('2026'), perYear('2027'), perYear('2028')]).toEqual([10, 10, 9]);
  });

  it('never lists a day as both a holiday and an early close', () => {
    expect(NYSE_EARLY_CLOSES.filter((date) => NYSE_HOLIDAYS.includes(date))).toEqual([]);
  });
});
