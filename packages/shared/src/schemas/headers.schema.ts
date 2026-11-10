import { z } from 'zod';
import { OrderLimits } from '../limits.js';

// Printable ASCII only.
const REQUEST_KEY_PATTERN = /^[\x21-\x7E]+$/;

export const requestKeySchema = z
  .string()
  .trim()
  .min(1, { error: 'Request-Key must not be empty', abort: true })
  .max(
    OrderLimits.REQUEST_KEY_MAX_LENGTH,
    `Request-Key must be at most ${OrderLimits.REQUEST_KEY_MAX_LENGTH} characters`,
  )
  .regex(REQUEST_KEY_PATTERN, 'Request-Key must contain visible ASCII characters only');
