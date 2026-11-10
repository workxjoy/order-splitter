import type { StandardSchemaV1 } from '@standard-schema/spec';
import { toFieldErrorList, type FieldError } from '@order-splitter/shared';

// Returned as a 400 with one entry per invalid field.
export class ValidationException extends Error {
  constructor(readonly fieldErrors: readonly FieldError[]) {
    super('The request is invalid');
    this.name = ValidationException.name;
  }

  static fromIssues(issues: readonly StandardSchemaV1.Issue[]): ValidationException {
    return new ValidationException(toFieldErrorList(issues));
  }
}
