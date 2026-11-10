import { Clock } from '../../src/common/services/clock.service.js';

/** Deterministic clock for tests. */
export class FixedClock extends Clock {
  constructor(private current: Date) {
    super();
  }

  now(): Date {
    return new Date(this.current);
  }

  set(date: Date): void {
    this.current = date;
  }
}
