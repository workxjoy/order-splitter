import {
  allocationSchema,
  isFullPortfolio,
  OrderType,
  sumPercents,
  type CreatePortfolioOrderInput,
  type FieldError,
} from '@order-splitter/shared';

export interface AllocationRow {
  id: string;
  symbol: string;
  percent: string;
  marketPrice: string;
}

export interface OrderFormValues {
  orderType: OrderType;
  totalAmount: string;
  portfolioName: string;
  allocations: AllocationRow[];
}

// Keyed by API field path, e.g. "portfolio.allocations.1.percent".
export type FieldErrors = Record<string, string[]>;

export const FieldPath = {
  ORDER_TYPE: 'orderType',
  TOTAL_AMOUNT: 'totalAmount',
  PORTFOLIO_NAME: 'portfolio.name',
  ALLOCATIONS: 'portfolio.allocations',
  allocation: (index: number) => `portfolio.allocations.${index}`,
  allocationField: (index: number, field: keyof Omit<AllocationRow, 'id'>) =>
    `portfolio.allocations.${index}.${field}`,
} as const;

// Sample order shown on first load.
export function exampleFormValues(newId: () => string): OrderFormValues {
  return {
    orderType: OrderType.BUY,
    totalAmount: '100',
    portfolioName: '',
    allocations: [
      { id: newId(), symbol: 'AAPL', percent: '60', marketPrice: '' },
      { id: newId(), symbol: 'TSLA', percent: '40', marketPrice: '' },
    ],
  };
}

export function emptyAllocationRow(id: string): AllocationRow {
  return { id, symbol: '', percent: '', marketPrice: '' };
}

// Blank optional fields are left out instead of being sent empty.
export function toCreateInput(values: OrderFormValues): CreatePortfolioOrderInput {
  const name = values.portfolioName.trim();
  return {
    orderType: values.orderType,
    totalAmount: values.totalAmount,
    portfolio: {
      ...(name && { name }),
      allocations: values.allocations.map((row) => ({
        symbol: row.symbol,
        percent: row.percent,
        ...(row.marketPrice.trim() && { marketPrice: row.marketPrice }),
      })),
    },
  };
}

export function toFieldErrors(errors: readonly FieldError[]): FieldErrors {
  return errors.reduce<FieldErrors>((grouped, { path, message }) => {
    (grouped[path] ??= []).push(message);
    return grouped;
  }, {});
}

// portfolio.allocations.<n> and its fields; captures n and the field suffix.
const ROW_ERROR_PATH = /^portfolio\.allocations\.(\d+)(\..+)?$/;

// Drops the removed row's errors and shifts later rows up by one, so messages stay on their row.
export function withoutRowErrors(errors: FieldErrors, removed: number): FieldErrors {
  const remaining: FieldErrors = {};
  for (const [path, messages] of Object.entries(errors)) {
    const match = ROW_ERROR_PATH.exec(path);
    if (!match) {
      remaining[path] = messages;
      continue;
    }
    const row = Number(match[1]);
    if (row === removed) continue;
    remaining[`${FieldPath.allocation(row > removed ? row - 1 : row)}${match[2] ?? ''}`] = messages;
  }
  return remaining;
}

const percentSchema = allocationSchema.shape.percent;

export interface WeightTotal {
  /** Sum of the valid percentages so far; null while none are valid. */
  total: string | null;
  allValid: boolean;
  /** Every weight is valid and they add up to 100. */
  isComplete: boolean;
}

// Uses the same rules as the API, so the indicator matches what submit will accept.
export function percentTotal(rows: readonly AllocationRow[]): WeightTotal {
  const percents = rows.flatMap((row) => {
    const parsed = percentSchema.safeParse(row.percent);
    return parsed.success ? [parsed.data] : [];
  });
  const allValid = percents.length === rows.length;
  const total = sumPercents(percents);
  if (percents.length === 0 || total === null) return { total: null, allValid, isComplete: false };
  return { total: total.toFixed(), allValid, isComplete: allValid && isFullPortfolio(total) };
}
