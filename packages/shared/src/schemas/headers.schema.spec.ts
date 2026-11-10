import { describe, expect, it } from 'vitest';
import { OrderLimits } from '../limits.js';
import { requestKeySchema } from './headers.schema.js';

describe('requestKeySchema', () => {
  it.each(['order-123', '7f9c2ba4-e88f-11ee-a951-0242ac120002', '  padded  '])(
    'accepts %j',
    (key) => {
      expect(requestKeySchema.safeParse(key).success).toBe(true);
    },
  );

  it('trims surrounding whitespace', () => {
    expect(requestKeySchema.parse('  key-1 ')).toBe('key-1');
  });

  it.each([
    ['empty', ''],
    ['blank', '   '],
    ['too long', 'k'.repeat(OrderLimits.REQUEST_KEY_MAX_LENGTH + 1)],
    ['containing spaces', 'two words'],
    ['non-ASCII', 'clé'],
  ])('rejects a key that is %s', (_case, key) => {
    expect(requestKeySchema.safeParse(key).success).toBe(false);
  });
});
