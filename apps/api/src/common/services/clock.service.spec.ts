import { describe, expect, it } from 'vitest';
import { SystemClock } from './clock.service.js';

describe('SystemClock', () => {
  it('returns the current wall-clock time', () => {
    const before = Date.now();
    const now = new SystemClock().now().getTime();

    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});
