import {
  createPortfolioOrderSchema,
  OrderType,
  PriceSource,
  type CreatePortfolioOrderInput,
  type CreatePortfolioOrderRequest,
} from '@order-splitter/shared';
import { Money } from '../../src/common/utils/money.js';
import type { PortfolioOrder } from '../../src/portfolio-orders/entities/portfolio-order.entity.js';

// USD 100 split 60% AAPL / 40% TSLA.
export function exampleOrderInput(
  overrides: Partial<CreatePortfolioOrderInput> = {},
): CreatePortfolioOrderInput {
  return {
    orderType: OrderType.BUY,
    totalAmount: 100,
    portfolio: {
      allocations: [
        { symbol: 'AAPL', percent: 60 },
        { symbol: 'TSLA', percent: 40 },
      ],
    },
    ...overrides,
  };
}

// Validated request, as the controller receives it.
export function exampleOrderRequest(
  overrides: Partial<CreatePortfolioOrderInput> = {},
): CreatePortfolioOrderRequest {
  return createPortfolioOrderSchema.parse(exampleOrderInput(overrides));
}

let sequence = 0;

/** Minimal persisted order for repository and mapper tests. */
export function portfolioOrderFixture(overrides: Partial<PortfolioOrder> = {}): PortfolioOrder {
  sequence += 1;
  return {
    id: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
    orderType: OrderType.BUY,
    portfolioName: null,
    totalAmount: new Money('100'),
    estimatedTotalAmount: new Money('100'),
    unallocatedAmount: new Money('0'),
    quantityPrecision: 3,
    executeAt: new Date('2026-11-09T14:30:00.000Z'),
    marketTimezone: 'America/New_York',
    createdAt: new Date('2026-11-08T20:00:00.000Z'),
    orders: [
      {
        symbol: 'AAPL',
        percent: new Money('100'),
        price: new Money('100'),
        priceSource: PriceSource.FIXED,
        amount: new Money('100'),
        quantity: new Money('1'),
        estimatedAmount: new Money('100'),
      },
    ],
    keyRecord: null,
    ...overrides,
  };
}
