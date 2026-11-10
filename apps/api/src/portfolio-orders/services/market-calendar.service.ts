import { Inject, Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { marketConfig, type MarketConfig } from '../../config/market.config.js';
import { MAX_DAYS_TO_NEXT_SESSION, TRADING_WEEKDAYS } from '../portfolio-orders.constants.js';

interface Session {
  readonly open: DateTime;
  readonly close: DateTime;
}

const YEAR_LENGTH = 4;

// The holiday list is taken to cover whole years, up to the latest year it mentions.
function lastCoveredDate({ holidays, earlyCloses }: MarketConfig): string | null {
  const latest = [...holidays, ...earlyCloses].sort().at(-1);
  return latest === undefined ? null : `${latest.slice(0, YEAR_LENGTH)}-12-31`;
}

// Orders execute immediately during a trading session, otherwise at the next open. Sessions run
// Monday to Friday in the market time zone, skipping holidays and ending early on early-close days.
@Injectable()
export class MarketCalendarService {
  private readonly logger = new Logger(MarketCalendarService.name);
  private readonly calendarEnd: string | null;
  private warnedPastCalendarEnd = false;

  constructor(@Inject(marketConfig.KEY) private readonly config: MarketConfig) {
    this.calendarEnd = lastCoveredDate(config);
  }

  get marketTimezone(): string {
    return this.config.timezone;
  }

  nextExecutionTime(now: Date): Date {
    const marketNow = DateTime.fromJSDate(now, { zone: this.config.timezone });

    for (let dayOffset = 0; dayOffset <= MAX_DAYS_TO_NEXT_SESSION; dayOffset += 1) {
      const session = this.sessionOn(marketNow.plus({ days: dayOffset }).startOf('day'));
      if (!session) continue;
      if (marketNow < session.open) return session.open.toJSDate();
      if (marketNow < session.close) return now;
    }

    throw new Error(
      `No trading session found within ${MAX_DAYS_TO_NEXT_SESSION} days of ${now.toISOString()}`,
    );
  }

  // null when the market is closed all day.
  private sessionOn(day: DateTime): Session | null {
    const date = day.toISODate();
    if (date === null || !TRADING_WEEKDAYS.has(day.weekday)) return null;
    if (this.calendarEnd !== null && date > this.calendarEnd) this.warnPastCalendarEnd();
    if (this.config.holidays.has(date)) return null;
    const closeTime = this.config.earlyCloses.has(date)
      ? this.config.earlyCloseTime
      : this.config.closeTime;
    return { open: day.set(this.config.openTime), close: day.set(closeTime) };
  }

  // Once per process, so the logs explain why a holiday may have been treated as a trading day.
  private warnPastCalendarEnd(): void {
    if (this.warnedPastCalendarEnd) return;
    this.warnedPastCalendarEnd = true;
    this.logger.warn(
      `The market holiday calendar ends on ${String(this.calendarEnd)}. Later dates are treated as ` +
        'full trading days until MARKET_HOLIDAYS and MARKET_EARLY_CLOSES are extended.',
    );
  }
}
