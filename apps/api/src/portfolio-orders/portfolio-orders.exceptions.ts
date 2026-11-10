import { ErrorCode, type FieldError } from '@order-splitter/shared';
import { DomainException } from '../common/exceptions/domain.exception.js';

export class PortfolioOrderNotFoundException extends DomainException {
  readonly code = ErrorCode.PORTFOLIO_ORDER_NOT_FOUND;

  constructor(id: string) {
    super(`Portfolio order "${id}" was not found`);
  }
}

export class RequestKeyReusedException extends DomainException {
  readonly code = ErrorCode.REQUEST_KEY_REUSED;

  constructor() {
    super('This Request-Key was already used with a different request body');
  }
}

export class AmountBelowMinimumException extends DomainException {
  readonly code = ErrorCode.AMOUNT_BELOW_MINIMUM;

  constructor(fieldErrors: readonly FieldError[]) {
    super('The amount allocated to some stocks is below the minimum order amount', fieldErrors);
  }
}

export class QuantityBelowMinimumException extends DomainException {
  readonly code = ErrorCode.QUANTITY_BELOW_MINIMUM;

  constructor(fieldErrors: readonly FieldError[]) {
    super(
      'The amount allocated to some stocks is too small to buy or sell the minimum quantity',
      fieldErrors,
    );
  }
}
