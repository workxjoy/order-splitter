import type { ErrorCode, FieldError } from '@order-splitter/shared';

export type DomainErrorCode = Extract<
  ErrorCode,
  | 'PORTFOLIO_ORDER_NOT_FOUND'
  | 'REQUEST_KEY_REUSED'
  | 'AMOUNT_BELOW_MINIMUM'
  | 'QUANTITY_BELOW_MINIMUM'
>;

// Business rule violation. HttpExceptionFilter maps the code to an HTTP status.
export abstract class DomainException extends Error {
  abstract readonly code: DomainErrorCode;

  protected constructor(
    message: string,
    readonly fieldErrors: readonly FieldError[] = [],
  ) {
    super(message);
    this.name = new.target.name;
  }
}
