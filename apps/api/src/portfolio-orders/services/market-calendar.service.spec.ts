import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { marketConfigFixture } from '../../../test/fixtures/config.fixtures.js';
import type { MarketConfig } from '../../config/market.config.js';
import { MarketCalendarService } from './market-calendar.service.js';

function nextExecution(nowIso: string, config: Partial<MarketConfig> = {}): string {
  return new MarketCalendarService(marketConfigFixture(config))
    .nextExecutionTime(new Date(nowIso))
    .toISOString();
}

// November 2026 is EST (UTC-5): 09:30 ET = 14:30Z, 16:00 ET = 21:00Z.
describe('MarketCalendarService (New York, 09:30-16:00, Monday-Friday)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['before the open on a weekday', '2026-11-11T13:00:00.000Z', '2026-11-11T14:30:00.000Z'],
    ['exactly at the open', '2026-11-11T14:30:00.000Z', '2026-11-11T14:30:00.000Z'],
    [
      'during the session (executes immediately)',
      '2026-11-11T17:45:12.345Z',
      '2026-11-11T17:45:12.345Z',
    ],
    ['one millisecond before the close', '2026-11-11T20:59:59.999Z', '2026-11-11T20:59:59.999Z'],
    ['exactly at the close', '2026-11-11T21:00:00.000Z', '2026-11-12T14:30:00.000Z'],
    ['after the close on a weekday', '2026-11-11T23:00:00.000Z', '2026-11-12T14:30:00.000Z'],
    ['after the close on Friday', '2026-11-13T22:00:00.000Z', '2026-11-16T14:30:00.000Z'],
    ['on Saturday', '2026-11-14T17:00:00.000Z', '2026-11-16T14:30:00.000Z'],
    [
      'late on Sunday in New York (already Monday in UTC)',
      '2026-11-16T04:00:00.000Z',
      '2026-11-16T14:30:00.000Z',
    ],
    [
      'late on Friday in New York (already Saturday in UTC)',
      '2026-11-14T03:30:00.000Z',
      '2026-11-16T14:30:00.000Z',
    ],
  ])('%s', (_case, now, expected) => {
    expect(nextExecution(now)).toBe(expected);
  });

  it('follows daylight saving time: Friday close in EST, Monday open in EDT', () => {
    // US DST starts Sunday 8 March 2026, so Monday's 09:30 open is 13:30Z, not 14:30Z.
    expect(nextExecution('2026-03-06T22:00:00.000Z')).toBe('2026-03-09T13:30:00.000Z');
  });

  it.each([
    [
      'after the close on the eve of Thanksgiving',
      '2026-11-25T22:00:00.000Z',
      '2026-11-27T14:30:00.000Z',
    ],
    ['on Thanksgiving Day (closed)', '2026-11-26T16:00:00.000Z', '2026-11-27T14:30:00.000Z'],
    [
      'before the 13:00 early close the day after Thanksgiving',
      '2026-11-27T17:59:00.000Z',
      '2026-11-27T17:59:00.000Z',
    ],
    ['after the 13:00 early close', '2026-11-27T18:00:00.000Z', '2026-11-30T14:30:00.000Z'],
    [
      'after the Christmas Eve early close, before Christmas Day and the weekend',
      '2026-12-24T18:30:00.000Z',
      '2026-12-28T14:30:00.000Z',
    ],
    ['on New Year’s Day 2027 (a Friday)', '2027-01-01T15:00:00.000Z', '2027-01-04T14:30:00.000Z'],
  ])('follows the NYSE calendar %s', (_case, now, expected) => {
    expect(nextExecution(now)).toBe(expected);
  });

  it('treats every weekday as a full session when the calendar is empty', () => {
    const noCalendar = { holidays: new Set<string>(), earlyCloses: new Set<string>() };

    expect(nextExecution('2026-11-26T16:00:00.000Z', noCalendar)).toBe('2026-11-26T16:00:00.000Z');
    expect(nextExecution('2026-11-27T19:00:00.000Z', noCalendar)).toBe('2026-11-27T19:00:00.000Z');
  });

  it('fails loudly when the calendar leaves no session to schedule into', () => {
    const everyDay = Array.from({ length: 40 }, (_, day) =>
      new Date(Date.UTC(2026, 10, 9 + day)).toISOString().slice(0, 10),
    );

    expect(() =>
      nextExecution('2026-11-09T12:00:00.000Z', { holidays: new Set(everyDay) }),
    ).toThrow('No trading session found');
  });

  it('warns once when it schedules past the end of the holiday calendar', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const calendar = new MarketCalendarService(marketConfigFixture());

    // Inside the calendar: no warning.
    calendar.nextExecutionTime(new Date('2028-12-27T15:00:00.000Z'));
    expect(warn).not.toHaveBeenCalled();

    // After the close on Friday 29 Dec 2028 the next weekday is 1 Jan 2029, which the list no
    // longer covers. It is scheduled as a normal session, and the gap is logged once.
    const twice = [1, 2].map(() =>
      calendar.nextExecutionTime(new Date('2028-12-29T22:00:00.000Z')).toISOString(),
    );
    expect(twice).toEqual(['2029-01-01T14:30:00.000Z', '2029-01-01T14:30:00.000Z']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('ends on 2028-12-31');
  });

  it('does not warn when no holiday calendar is configured', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    nextExecution('2031-06-02T15:00:00.000Z', {
      holidays: new Set<string>(),
      earlyCloses: new Set<string>(),
    });

    expect(warn).not.toHaveBeenCalled();
  });

  it('uses the configured market time zone and session hours', () => {
    const london = {
      timezone: 'Europe/London',
      openTime: { hour: 8, minute: 0 },
      closeTime: { hour: 16, minute: 30 },
    };

    expect(nextExecution('2026-11-11T07:00:00.000Z', london)).toBe('2026-11-11T08:00:00.000Z');
    expect(nextExecution('2026-11-11T16:29:00.000Z', london)).toBe('2026-11-11T16:29:00.000Z');
    expect(nextExecution('2026-11-11T16:30:00.000Z', london)).toBe('2026-11-12T08:00:00.000Z');
  });
});
