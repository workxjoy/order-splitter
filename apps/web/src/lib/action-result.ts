import type { FieldError } from '@order-splitter/shared';

export type ActionResult<T> =
  { ok: true; data: T } | { ok: false; message: string; errors: FieldError[] };
