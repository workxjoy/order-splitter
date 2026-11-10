export const APP_NAME = 'Order Splitter';
export const LOCALE = 'en-US';
export const CURRENCY = 'USD';

export const DEFAULT_API_BASE_URL = 'http://localhost:3001/api/v1';
export const API_TIMEOUT_MS = 10_000;

export const AppRoute = {
  NEW_ORDER: '/',
  HISTORY: '/orders',
} as const;

export function orderRoute(id: string): string {
  return `${AppRoute.HISTORY}/${id}`;
}

export const SearchParam = {
  PAGE: 'page',
  ORDER_TYPE: 'orderType',
} as const;

export const ErrorMessage = {
  SERVICE_UNAVAILABLE: 'The order service is unavailable. Please try again shortly.',
  UNEXPECTED_RESPONSE: 'The order service returned an unexpected response.',
  ORDER_STATUS_UNKNOWN:
    'The order was submitted, but its details could not be read. Check the order history before submitting it again.',
  // The request may or may not have reached the API; resending it unchanged reuses its key.
  SUBMIT_UNCONFIRMED:
    'The order could not be confirmed. Submit it again unchanged to check: it will not be placed twice.',
  INVALID_FORM: 'Please correct the highlighted fields.',
} as const;
