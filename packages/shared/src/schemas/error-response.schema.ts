import { z } from 'zod';
import { ErrorCode } from '../enums.js';

export const fieldErrorSchema = z.object({
  path: z.string().meta({ description: 'Dot-separated path to the offending field' }),
  message: z.string(),
});
export type FieldError = z.output<typeof fieldErrorSchema>;

export const FIELD_PATH_SEPARATOR = '.';

export interface SchemaIssue {
  readonly message: string;
  readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[] | undefined;
}

// Schema issues to field errors with dot paths, e.g. "portfolio.allocations.0.percent".
export function toFieldErrorList(issues: readonly SchemaIssue[]): FieldError[] {
  return issues.map((issue) => ({
    path: (issue.path ?? [])
      .map((segment) => String(typeof segment === 'object' ? segment.key : segment))
      .join(FIELD_PATH_SEPARATOR),
    message: issue.message,
  }));
}

// RFC 9457 problem details, plus an error code and the request id.
export const errorResponseSchema = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.int(),
    detail: z.string(),
    instance: z.string(),
    code: z.enum(ErrorCode),
    requestId: z.string().optional(),
    errors: z.array(fieldErrorSchema).optional(),
  })
  .meta({ id: 'ErrorResponse' });
export type ErrorResponse = z.output<typeof errorResponseSchema>;
