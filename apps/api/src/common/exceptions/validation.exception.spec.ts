import { describe, expect, it } from 'vitest';
import { ValidationException } from './validation.exception.js';

describe('ValidationException.fromIssues', () => {
  it('flattens Standard Schema issue paths into dot notation', () => {
    const error = ValidationException.fromIssues([
      { message: 'Required', path: ['portfolio', 'allocations', 0, 'percent'] },
      { message: 'Bad key', path: [{ key: 'portfolio' }, { key: 'name' }] },
      { message: 'Root problem' },
    ]);

    expect(error.fieldErrors).toEqual([
      { path: 'portfolio.allocations.0.percent', message: 'Required' },
      { path: 'portfolio.name', message: 'Bad key' },
      { path: '', message: 'Root problem' },
    ]);
  });
});
