import { describe, expect, it } from 'vitest';
import { toFieldErrorList } from './error-response.schema.js';

describe('toFieldErrorList', () => {
  it('flattens Zod and Standard Schema issue paths into dot notation', () => {
    expect(
      toFieldErrorList([
        { message: 'Required', path: ['portfolio', 'allocations', 0, 'percent'] },
        { message: 'Bad key', path: [{ key: 'portfolio' }, { key: 'allocations' }, { key: 1 }] },
        { message: 'Empty path', path: [] },
        { message: 'No path' },
      ]),
    ).toEqual([
      { path: 'portfolio.allocations.0.percent', message: 'Required' },
      { path: 'portfolio.allocations.1', message: 'Bad key' },
      { path: '', message: 'Empty path' },
      { path: '', message: 'No path' },
    ]);
  });
});
