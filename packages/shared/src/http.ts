export const ApiHeader = {
  REQUEST_KEY: 'Request-Key',
  REQUEST_REPLAYED: 'Request-Replayed',
  REQUEST_ID: 'X-Request-Id',
  RESPONSE_TIME: 'X-Response-Time',
} as const;

export const ContentType = {
  JSON: 'application/json',
  PROBLEM_JSON: 'application/problem+json',
} as const;

// Relative to the versioned base URL, e.g. http://localhost:3001/api/v1
export const ApiResource = {
  PORTFOLIO_ORDERS: 'portfolio-orders',
} as const;
