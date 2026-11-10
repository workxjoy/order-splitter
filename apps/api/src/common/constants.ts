export const API_PREFIX = 'api';
export const API_VERSION = '1';
export const API_DOCS_PATH = 'docs';
export const API_DOCS_JSON_PATH = 'docs/openapi.json';
// Well above the largest valid request (100 allocations).
export const JSON_BODY_LIMIT = '100kb';
// Body fields that hold decimals. JSON numbers in them keep their exact source text.
export const DECIMAL_BODY_FIELDS: ReadonlySet<string> = new Set([
  'totalAmount',
  'percent',
  'marketPrice',
]);
export const MALFORMED_JSON_DETAIL = 'Request body is not valid JSON';

export const RESPONSE_TIME_DIGITS = 3;
export const RESPONSE_TIME_UNIT = 'ms';

// An incoming X-Request-Id is only reused if it matches this.
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export const PROBLEM_TYPE_DEFAULT = 'about:blank';
export const INTERNAL_ERROR_DETAIL =
  'An unexpected error occurred. Quote the request id when reporting it.';
export const RATE_LIMITED_DETAIL =
  'Too many requests from this client. Retry after the number of seconds in Retry-After.';

// versionedPath('portfolio-orders', id) -> /api/v1/portfolio-orders/{id}
export function versionedPath(...segments: string[]): string {
  return ['', API_PREFIX, `v${API_VERSION}`, ...segments].join('/');
}
