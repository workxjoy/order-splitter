import { Decimal } from 'decimal.js';
import { z } from 'zod';
import { OrderType, PriceSource } from '../enums.js';
import { OrderLimits, PaginationLimits } from '../limits.js';
import { positiveDecimalString, tryParseDecimal } from './decimal.schema.js';
import { paginationMetaSchema } from './pagination.schema.js';

// e.g. AAPL, BRK.B. Checked before upper-casing, because Unicode case mapping would turn input such
// as "ıbm" (dotless i) into a different valid ticker ("IBM").
const SYMBOL_PATTERN = /^[A-Za-z][A-Za-z0-9.-]*$/;

export const symbolSchema = z
  .string()
  .trim()
  .min(1, 'Symbol is required')
  .max(
    OrderLimits.SYMBOL_MAX_LENGTH,
    `Symbol must be at most ${OrderLimits.SYMBOL_MAX_LENGTH} characters`,
  )
  .regex(
    SYMBOL_PATTERN,
    'Symbol must start with a letter and contain only letters, digits, "." or "-"',
  )
  .toUpperCase()
  .meta({ description: 'Ticker symbol, case-insensitive', examples: ['AAPL'] });

// null if any percentage is not a valid decimal.
export function sumPercents(percents: readonly string[]): Decimal | null {
  let total = new Decimal(0);
  for (const percent of percents) {
    const value = tryParseDecimal(percent);
    if (value === null) return null;
    total = total.plus(value);
  }
  return total;
}

export function isFullPortfolio(total: Decimal): boolean {
  return total.eq(OrderLimits.PORTFOLIO_TOTAL_PERCENT);
}

export const allocationSchema = z.strictObject({
  symbol: symbolSchema,
  percent: positiveDecimalString({
    maxDecimals: OrderLimits.PERCENT_MAX_DECIMALS,
    max: OrderLimits.PORTFOLIO_TOTAL_PERCENT,
    description:
      'Share of the total amount allocated to this stock, in percent (0 < percent <= 100)',
    example: '60',
  }),
  marketPrice: positiveDecimalString({
    maxDecimals: OrderLimits.PRICE_MAX_DECIMALS,
    max: OrderLimits.MAX_MARKET_PRICE,
    description: 'Optional market price per share in USD; overrides the platform fixed price',
    example: '187.35',
  }).optional(),
});

export const modelPortfolioSchema = z
  .strictObject({
    name: z
      .string()
      .trim()
      .min(1, 'Name must not be empty')
      .max(OrderLimits.PORTFOLIO_NAME_MAX_LENGTH)
      .optional()
      .meta({
        description: 'Optional partner label for the model portfolio',
        examples: ['Balanced Growth'],
      }),
    allocations: z
      .array(allocationSchema)
      .min(OrderLimits.MIN_ALLOCATIONS, 'A model portfolio needs at least one allocation')
      .max(
        OrderLimits.MAX_ALLOCATIONS,
        `A model portfolio supports at most ${OrderLimits.MAX_ALLOCATIONS} allocations`,
      )
      .meta({
        description:
          'One entry per stock. Percentages must add up to exactly 100 and symbols must be ' +
          'unique (case-insensitive).',
      }),
  })
  .superRefine((portfolio, ctx) => {
    const seen = new Set<string>();
    portfolio.allocations.forEach((allocation, index) => {
      if (seen.has(allocation.symbol)) {
        ctx.addIssue({
          code: 'custom',
          path: ['allocations', index, 'symbol'],
          message: `Duplicate symbol "${allocation.symbol}"; each stock may appear once`,
        });
      }
      seen.add(allocation.symbol);
    });

    // An empty list or an invalid percentage already has its own error.
    if (portfolio.allocations.length === 0) return;
    const total = sumPercents(portfolio.allocations.map((allocation) => allocation.percent));
    if (total === null) return;
    if (!isFullPortfolio(total)) {
      ctx.addIssue({
        code: 'custom',
        path: ['allocations'],
        message: `Allocation percentages must add up to ${OrderLimits.PORTFOLIO_TOTAL_PERCENT} (got ${total.toFixed()})`,
      });
    }
  });

export const createPortfolioOrderSchema = z
  .strictObject({
    orderType: z.enum(OrderType).meta({ description: 'Side of every order in the split' }),
    totalAmount: positiveDecimalString({
      maxDecimals: OrderLimits.AMOUNT_MAX_DECIMALS,
      max: OrderLimits.MAX_TOTAL_AMOUNT,
      description: 'Total amount to buy or sell across the portfolio, in USD',
      example: '100',
    }),
    portfolio: modelPortfolioSchema,
  })
  .meta({ id: 'CreatePortfolioOrderRequest' });

export type CreatePortfolioOrderInput = z.input<typeof createPortfolioOrderSchema>;
export type CreatePortfolioOrderRequest = z.output<typeof createPortfolioOrderSchema>;

// Digits only. z.coerce.number() would accept "1e1", "0x2", " 2" and "".
const queryInteger = z.string().regex(/^\d+$/, 'Must be a whole number').transform(Number);

// Strict, so a misspelt filter such as ?ordertype= is an error rather than silently ignored.
export const listPortfolioOrdersQuerySchema = z.strictObject({
  page: queryInteger
    .pipe(z.int().min(PaginationLimits.MIN_PAGE))
    .default(PaginationLimits.DEFAULT_PAGE)
    .meta({ description: '1-based page number' }),
  pageSize: queryInteger
    .pipe(z.int().min(PaginationLimits.MIN_PAGE_SIZE).max(PaginationLimits.MAX_PAGE_SIZE))
    .default(PaginationLimits.DEFAULT_PAGE_SIZE)
    .meta({ description: `Items per page (max ${PaginationLimits.MAX_PAGE_SIZE})` }),
  orderType: z.enum(OrderType).optional().meta({ description: 'Filter by order type' }),
});
export type ListPortfolioOrdersQuery = z.output<typeof listPortfolioOrdersQuerySchema>;

export const portfolioOrderIdParamsSchema = z.object({
  // UUIDs are case-insensitive (RFC 9562); ids are issued and stored in lower case.
  id: z.uuid().toLowerCase().meta({ description: 'Portfolio order identifier (case-insensitive)' }),
});
export type PortfolioOrderIdParams = z.output<typeof portfolioOrderIdParamsSchema>;

export const stockOrderSchema = z
  .object({
    symbol: z.string(),
    percent: z.string().meta({ description: 'Allocation percentage from the model portfolio' }),
    price: z.string().meta({ description: 'Price per share used for the split, in USD' }),
    priceSource: z.enum(PriceSource),
    amount: z.string().meta({ description: 'Amount allocated to this stock, in USD' }),
    quantity: z
      .string()
      .meta({ description: 'Shares to buy or sell, rounded down to the configured precision' }),
    estimatedAmount: z.string().meta({ description: 'quantity x price, in USD' }),
  })
  .meta({ id: 'StockOrder' });
export type StockOrderDto = z.output<typeof stockOrderSchema>;

export const portfolioOrderSchema = z
  .object({
    id: z.uuid(),
    orderType: z.enum(OrderType),
    portfolioName: z.string().nullable(),
    totalAmount: z.string(),
    estimatedTotalAmount: z
      .string()
      .meta({ description: 'Sum of estimatedAmount over all orders' }),
    unallocatedAmount: z
      .string()
      .meta({ description: 'totalAmount - estimatedTotalAmount, left over by quantity rounding' }),
    quantityPrecision: z
      .int()
      .meta({ description: 'Decimal places allowed for quantities when created' }),
    executeAt: z.iso.datetime().meta({ description: 'When the orders should be executed (UTC)' }),
    marketTimezone: z.string().meta({
      description: 'IANA time zone of the market session the order was scheduled in',
      examples: ['America/New_York'],
    }),
    createdAt: z.iso.datetime(),
    orders: z.array(stockOrderSchema),
  })
  .meta({ id: 'PortfolioOrder' });
export type PortfolioOrderDto = z.output<typeof portfolioOrderSchema>;

export const portfolioOrderResponseSchema = z.object({ data: portfolioOrderSchema });
export type PortfolioOrderResponse = z.output<typeof portfolioOrderResponseSchema>;

export const portfolioOrderListResponseSchema = z.object({
  data: z.array(portfolioOrderSchema),
  meta: paginationMetaSchema,
});
export type PortfolioOrderListResponse = z.output<typeof portfolioOrderListResponseSchema>;
