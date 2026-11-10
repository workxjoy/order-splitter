import { describe, expect, it } from 'vitest';
import { OrderType } from '../enums.js';
import { OrderLimits, PaginationLimits } from '../limits.js';
import {
  createPortfolioOrderSchema,
  isFullPortfolio,
  listPortfolioOrdersQuerySchema,
  portfolioOrderIdParamsSchema,
  sumPercents,
  type CreatePortfolioOrderInput,
} from './portfolio-order.schema.js';

const validInput = (): CreatePortfolioOrderInput => ({
  orderType: OrderType.BUY,
  totalAmount: 100,
  portfolio: {
    name: 'Balanced Growth',
    allocations: [
      { symbol: 'AAPL', percent: 60 },
      { symbol: 'TSLA', percent: 40 },
    ],
  },
});

/** Returns "path: message" pairs so assertions read like the API's error list. */
function issuesOf(input: unknown): string[] {
  const result = createPortfolioOrderSchema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

function withAllocations(allocations: unknown[]): unknown {
  return { ...validInput(), portfolio: { allocations } };
}

describe('createPortfolioOrderSchema', () => {
  it('accepts the challenge example and normalises numbers to canonical decimal strings', () => {
    const parsed = createPortfolioOrderSchema.parse(validInput());

    expect(parsed).toEqual({
      orderType: 'BUY',
      totalAmount: '100',
      portfolio: {
        name: 'Balanced Growth',
        allocations: [
          { symbol: 'AAPL', percent: '60' },
          { symbol: 'TSLA', percent: '40' },
        ],
      },
    });
  });

  it('accepts decimal strings, trims and upper-cases symbols, and keeps partner prices', () => {
    const parsed = createPortfolioOrderSchema.parse({
      orderType: 'SELL',
      totalAmount: ' 0100.50 ',
      portfolio: {
        allocations: [
          { symbol: ' brk.b ', percent: '33.3333', marketPrice: '412.1200' },
          { symbol: 'msft', percent: '66.6667' },
        ],
      },
    });

    expect(parsed.totalAmount).toBe('100.5');
    expect(parsed.portfolio.allocations).toEqual([
      { symbol: 'BRK.B', percent: '33.3333', marketPrice: '412.12' },
      { symbol: 'MSFT', percent: '66.6667' },
    ]);
    expect(parsed.portfolio.name).toBeUndefined();
  });

  it('normalises equivalent requests to the same output (so a retry produces the same hash)', () => {
    const asNumbers = createPortfolioOrderSchema.parse(validInput());
    const asStrings = createPortfolioOrderSchema.parse({
      ...validInput(),
      totalAmount: '100.00',
      portfolio: {
        name: '  Balanced Growth ',
        allocations: [
          { symbol: 'aapl', percent: '60.0' },
          { symbol: 'tsla', percent: '40' },
        ],
      },
    });

    expect(JSON.stringify(asStrings)).toBe(JSON.stringify(asNumbers));
  });

  it('accepts a single stock at 100%', () => {
    expect(issuesOf(withAllocations([{ symbol: 'VOO', percent: 100 }]))).toEqual([]);
  });

  it.each([
    ['missing', undefined, 'totalAmount: Required'],
    ['zero', 0, 'totalAmount: Must be greater than 0'],
    ['negative', -5, 'totalAmount: Enter a positive number, e.g. 100 or 100.25'],
    ['blank', '  ', 'totalAmount: Required'],
    ['sub-cent', '10.001', 'totalAmount: Must have at most 2 decimal places'],
    [
      'above the maximum',
      '1000000000.01',
      `totalAmount: Must be at most ${OrderLimits.MAX_TOTAL_AMOUNT}`,
    ],
    ['in exponent notation', 1e21, 'totalAmount: Enter a positive number, e.g. 100 or 100.25'],
    ['not numeric', 'ten', 'totalAmount: Enter a positive number, e.g. 100 or 100.25'],
    ['a boolean', true, 'totalAmount: Must be a number or a decimal string'],
    ['NaN', Number.NaN, 'totalAmount: Must be a number or a decimal string'],
    ['infinite', Number.POSITIVE_INFINITY, 'totalAmount: Must be a number or a decimal string'],
  ])('rejects a total amount that is %s', (_case, totalAmount, expected) => {
    expect(issuesOf({ ...validInput(), totalAmount })).toEqual([expected]);
  });

  it.each([
    ['missing', undefined],
    ['lower case', 'buy'],
    ['unknown', 'HOLD'],
  ])('rejects an order type that is %s', (_case, orderType) => {
    expect(issuesOf({ ...validInput(), orderType })).toEqual([
      'orderType: Invalid option: expected one of "BUY"|"SELL"',
    ]);
  });

  it('rejects an empty portfolio', () => {
    expect(issuesOf(withAllocations([]))).toEqual([
      'portfolio.allocations: A model portfolio needs at least one allocation',
    ]);
  });

  it('rejects more allocations than the limit', () => {
    const allocations = Array.from({ length: OrderLimits.MAX_ALLOCATIONS + 1 }, (_, index) => ({
      symbol: `S${index}`,
      percent: 1,
    }));
    expect(issuesOf(withAllocations(allocations))).toContain(
      `portfolio.allocations: A model portfolio supports at most ${OrderLimits.MAX_ALLOCATIONS} allocations`,
    );
  });

  it('rejects percentages that do not add up to 100', () => {
    expect(
      issuesOf(
        withAllocations([
          { symbol: 'AAPL', percent: 60 },
          { symbol: 'TSLA', percent: 39.99 },
        ]),
      ),
    ).toEqual(['portfolio.allocations: Allocation percentages must add up to 100 (got 99.99)']);
  });

  it('checks the 100% total exactly, without floating-point tolerance', () => {
    const thirds = [
      { symbol: 'A', percent: '33.3333' },
      { symbol: 'B', percent: '33.3333' },
      { symbol: 'C', percent: '33.3334' },
    ];
    expect(issuesOf(withAllocations(thirds))).toEqual([]);
    // 0.1 + 0.2 style inputs must not trip binary rounding.
    expect(
      issuesOf(
        withAllocations([
          { symbol: 'A', percent: 0.1 },
          { symbol: 'B', percent: 0.2 },
          { symbol: 'C', percent: 99.7 },
        ]),
      ),
    ).toEqual([]);
  });

  it('rejects duplicate symbols case-insensitively', () => {
    expect(
      issuesOf(
        withAllocations([
          { symbol: 'AAPL', percent: 50 },
          { symbol: 'aapl', percent: 50 },
        ]),
      ),
    ).toEqual([
      'portfolio.allocations.1.symbol: Duplicate symbol "AAPL"; each stock may appear once',
    ]);
  });

  it.each([
    [0, 'Must be greater than 0'],
    [100.01, 'Must be at most 100'],
    ['12.34567', 'Must have at most 4 decimal places'],
  ])('rejects allocation percent %s', (percent, message) => {
    const issues = issuesOf(withAllocations([{ symbol: 'AAPL', percent }]));
    expect(issues).toContain(`portfolio.allocations.0.percent: ${message}`);
  });

  it('skips the 100% total check while individual percentages are invalid', () => {
    expect(issuesOf(withAllocations([{ symbol: 'AAPL', percent: 'abc' }]))).toEqual([
      'portfolio.allocations.0.percent: Enter a positive number, e.g. 100 or 100.25',
    ]);
  });

  it.each([
    [0, 'Must be greater than 0'],
    ['0.00001', 'Must have at most 4 decimal places'],
    ['1000000.01', `Must be at most ${OrderLimits.MAX_MARKET_PRICE}`],
  ])('rejects market price %s', (marketPrice, message) => {
    expect(issuesOf(withAllocations([{ symbol: 'AAPL', percent: 100, marketPrice }]))).toEqual([
      `portfolio.allocations.0.marketPrice: ${message}`,
    ]);
  });

  it.each([
    ['', 'Symbol is required'],
    ['1ABC', 'Symbol must start with a letter and contain only letters, digits, "." or "-"'],
    ['AA PL', 'Symbol must start with a letter and contain only letters, digits, "." or "-"'],
    ['ABCDEFGHIJK', `Symbol must be at most ${OrderLimits.SYMBOL_MAX_LENGTH} characters`],
    // Non-ASCII letters whose Unicode upper case is a different ASCII ticker (IBM, FIX, STRASSE).
    ['ıbm', 'Symbol must start with a letter and contain only letters, digits, "." or "-"'],
    ['ﬁx', 'Symbol must start with a letter and contain only letters, digits, "." or "-"'],
    ['straße', 'Symbol must start with a letter and contain only letters, digits, "." or "-"'],
    ['ſpy', 'Symbol must start with a letter and contain only letters, digits, "." or "-"'],
  ])('rejects symbol "%s"', (symbol, message) => {
    expect(issuesOf(withAllocations([{ symbol, percent: 100 }]))).toContain(
      `portfolio.allocations.0.symbol: ${message}`,
    );
  });

  it('rejects unknown fields at every level to catch client typos', () => {
    const issues = issuesOf({
      ...validInput(),
      extra: true,
      portfolio: { allocations: [{ symbol: 'AAPL', percent: 100, marketprice: 10 }], weights: [] },
    });
    expect(issues).toEqual([
      'portfolio.allocations.0: Unrecognized key: "marketprice"',
      'portfolio: Unrecognized key: "weights"',
      ': Unrecognized key: "extra"',
    ]);
  });

  it('rejects an empty portfolio name', () => {
    expect(
      issuesOf({ ...validInput(), portfolio: { ...validInput().portfolio, name: '   ' } }),
    ).toEqual(['portfolio.name: Name must not be empty']);
  });
});

describe('listPortfolioOrdersQuerySchema', () => {
  it('applies defaults', () => {
    expect(listPortfolioOrdersQuerySchema.parse({})).toEqual({
      page: PaginationLimits.DEFAULT_PAGE,
      pageSize: PaginationLimits.DEFAULT_PAGE_SIZE,
    });
  });

  it('coerces query-string values', () => {
    expect(
      listPortfolioOrdersQuerySchema.parse({ page: '2', pageSize: '50', orderType: 'SELL' }),
    ).toEqual({
      page: 2,
      pageSize: 50,
      orderType: 'SELL',
    });
  });

  it.each([
    [{ page: '0' }],
    [{ page: '1.5' }],
    [{ page: 'abc' }],
    [{ pageSize: '0' }],
    [{ pageSize: String(PaginationLimits.MAX_PAGE_SIZE + 1) }],
    [{ orderType: 'HOLD' }],
    // Only plain digits: no hex, exponent, padding, blank or repeated values.
    [{ page: '0x2' }],
    [{ pageSize: '1e1' }],
    [{ page: ' 2' }],
    [{ page: '' }],
    [{ page: ['1', '2'] }],
    // Unknown parameters are errors, so a misspelt filter cannot silently return everything.
    [{ ordertype: 'SELL' }],
  ])('rejects %j', (query) => {
    expect(listPortfolioOrdersQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('portfolioOrderIdParamsSchema', () => {
  it('accepts a UUID and rejects anything else', () => {
    expect(
      portfolioOrderIdParamsSchema.safeParse({ id: '0b6f3b8e-3c38-4b8a-9d6c-2f1f7a4b5c6d' })
        .success,
    ).toBe(true);
    expect(portfolioOrderIdParamsSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(false);
  });

  it('normalises an upper-case UUID to the lower-case form ids are stored under', () => {
    expect(
      portfolioOrderIdParamsSchema.parse({ id: '6EA1220B-2F6A-4670-A351-46FA502495DD' }),
    ).toEqual({ id: '6ea1220b-2f6a-4670-a351-46fa502495dd' });
  });
});

describe('sumPercents / isFullPortfolio', () => {
  it('sums exactly and recognises a whole portfolio', () => {
    const total = sumPercents(['33.3333', '33.3333', '33.3334']);
    expect(total?.toFixed()).toBe('100');
    expect(total !== null && isFullPortfolio(total)).toBe(true);
    expect(sumPercents(['0.1', '0.2'])?.toFixed()).toBe('0.3');
  });

  it('returns null when any percentage is not a plain decimal', () => {
    expect(sumPercents(['60', 'abc'])).toBeNull();
  });
});
