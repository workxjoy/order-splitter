// Validation limits shared by the API and the web console.
export const OrderLimits = {
  PORTFOLIO_TOTAL_PERCENT: '100',
  MAX_TOTAL_AMOUNT: '1000000000',
  MAX_MARKET_PRICE: '1000000',
  AMOUNT_MAX_DECIMALS: 2,
  // e.g. 33.3333%
  PERCENT_MAX_DECIMALS: 4,
  // Prices below $1 can be quoted in sub-pennies.
  PRICE_MAX_DECIMALS: 4,
  MIN_ALLOCATIONS: 1,
  MAX_ALLOCATIONS: 100,
  PORTFOLIO_NAME_MAX_LENGTH: 100,
  SYMBOL_MAX_LENGTH: 10,
  REQUEST_KEY_MAX_LENGTH: 255,
} as const;

export const PaginationLimits = {
  MIN_PAGE: 1,
  DEFAULT_PAGE: 1,
  MIN_PAGE_SIZE: 1,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const;
