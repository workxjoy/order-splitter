export const OrderType = {
  BUY: 'BUY',
  SELL: 'SELL',
} as const;
export type OrderType = (typeof OrderType)[keyof typeof OrderType];

export const PriceSource = {
  /** marketPrice sent in the request */
  PARTNER: 'PARTNER',
  /** Configured default price */
  FIXED: 'FIXED',
} as const;
export type PriceSource = (typeof PriceSource)[keyof typeof PriceSource];

export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  MALFORMED_REQUEST: 'MALFORMED_REQUEST',
  PORTFOLIO_ORDER_NOT_FOUND: 'PORTFOLIO_ORDER_NOT_FOUND',
  ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  REQUEST_KEY_REUSED: 'REQUEST_KEY_REUSED',
  AMOUNT_BELOW_MINIMUM: 'AMOUNT_BELOW_MINIMUM',
  QUANTITY_BELOW_MINIMUM: 'QUANTITY_BELOW_MINIMUM',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  RATE_LIMITED: 'RATE_LIMITED',
  HTTP_ERROR: 'HTTP_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
