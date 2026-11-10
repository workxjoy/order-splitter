import { Decimal } from 'decimal.js';
import { z } from 'zod';

// Digits with an optional fraction: no sign, exponent or thousands separators.
const PLAIN_DECIMAL_PATTERN = /^\d+(\.\d+)?$/;

export interface DecimalStringOptions {
  maxDecimals: number;
  max: string;
  description: string;
  example: string;
}

export function tryParseDecimal(value: string): Decimal | null {
  return PLAIN_DECIMAL_PATTERN.test(value) ? new Decimal(value) : null;
}

// Positive decimal sent as a number or a string, normalised to a canonical string ("060.50" -> "60.5").
export function positiveDecimalString({
  maxDecimals,
  max,
  description,
  example,
}: DecimalStringOptions) {
  return z
    .union([z.number(), z.string()], {
      error: (issue) =>
        issue.input === undefined ? 'Required' : 'Must be a number or a decimal string',
    })
    .transform((value) => (typeof value === 'number' ? String(value) : value.trim()))
    .pipe(
      z
        .string()
        .superRefine((value, ctx) => {
          if (value === '') {
            ctx.addIssue({ code: 'custom', message: 'Required' });
            return;
          }
          const decimal = tryParseDecimal(value);
          if (decimal === null) {
            ctx.addIssue({
              code: 'custom',
              message: 'Enter a positive number, e.g. 100 or 100.25',
            });
            return;
          }
          if (decimal.decimalPlaces() > maxDecimals) {
            ctx.addIssue({
              code: 'custom',
              message: `Must have at most ${maxDecimals} decimal places`,
            });
          }
          if (decimal.lte(0)) {
            ctx.addIssue({ code: 'custom', message: 'Must be greater than 0' });
          }
          if (decimal.gt(max)) {
            ctx.addIssue({ code: 'custom', message: `Must be at most ${max}` });
          }
        })
        .transform((value) => new Decimal(value).toFixed()),
    )
    .meta({
      description: `${description}. At most ${maxDecimals} decimal places, greater than 0 and at most ${max}.`,
      examples: [example],
      // OpenAPI hints: `pattern` describes the string form, the bounds describe the number form.
      // The document is OpenAPI 3.0, where an exclusive bound is `minimum` plus a boolean flag.
      pattern: `^\\d+(\\.\\d{1,${maxDecimals}}0*)?$`,
      minimum: 0,
      exclusiveMinimum: true,
      maximum: Number(max),
    });
}
