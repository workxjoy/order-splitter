import { z } from 'zod';

const INTEGER_PATTERN = /^-?\d+$/;

// Fails at startup, listing every invalid variable.
export function parseConfig<TSchema extends z.ZodType>(
  namespace: string,
  schema: TSchema,
  source: NodeJS.ProcessEnv = process.env,
): z.output<TSchema> {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid "${namespace}" configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

// Unlike z.coerce.number(), a blank value (PORT=) is an error instead of 0, and 1e3 or 0x10 are
// rejected.
export function envInteger() {
  return z.string().trim().regex(INTEGER_PATTERN, 'Must be an integer').transform(Number);
}
