import { OrderLimits } from '@order-splitter/shared';

export const CENTS_PER_DOLLAR = 100;
export const PORTFOLIO_TOTAL_PERCENT = OrderLimits.PORTFOLIO_TOTAL_PERCENT;
export const QUANTITY_DECIMAL_BASE = 10;

// ISO weekdays, Monday = 1.
export const TRADING_WEEKDAYS: ReadonlySet<number> = new Set([1, 2, 3, 4, 5]);
// Limit for the next-session search, so a calendar with no trading days fails instead of looping.
export const MAX_DAYS_TO_NEXT_SESSION = 31;

// The in-memory store drops its oldest orders once either limit is passed. The stock-line limit is
// what bounds memory, since one order can hold up to 100 lines: a full store of 100-line orders
// took 32 to 57 MB of heap in measurements, depending on the numbers stored.
export const MAX_STORED_ORDERS = 10_000;
export const MAX_STORED_STOCK_ORDERS = 50_000;

export const ALLOCATIONS_FIELD_PATH = 'portfolio.allocations';
