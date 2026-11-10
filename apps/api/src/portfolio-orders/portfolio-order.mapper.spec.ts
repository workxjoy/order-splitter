import { OrderType, PriceSource } from '@order-splitter/shared';
import { describe, expect, it } from 'vitest';
import {
  exampleOrderRequest,
  portfolioOrderFixture,
} from '../../test/fixtures/portfolio-order.fixtures.js';
import { Money } from '../common/utils/money.js';
import {
  toAllocationRequest,
  toPaginationMeta,
  toPortfolioOrderDto,
} from './portfolio-order.mapper.js';

describe('portfolio-orders mapper', () => {
  it('converts the validated request into exact decimals, omitting absent market prices', () => {
    const request = toAllocationRequest(
      exampleOrderRequest({
        totalAmount: '100.50',
        portfolio: {
          allocations: [
            { symbol: 'AAPL', percent: 60, marketPrice: '187.35' },
            { symbol: 'TSLA', percent: 40 },
          ],
        },
      }),
    );

    expect(request.totalAmount.toFixed()).toBe('100.5');
    expect(request.allocations[0]?.marketPrice?.toFixed()).toBe('187.35');
    expect(request.allocations[1]).not.toHaveProperty('marketPrice');
  });

  it('serialises decimals as strings with fixed money and quantity precision', () => {
    const dto = toPortfolioOrderDto(
      portfolioOrderFixture({
        id: '0b6f3b8e-3c38-4b8a-9d6c-2f1f7a4b5c6d',
        orderType: OrderType.SELL,
        portfolioName: 'Income',
        totalAmount: new Money('50'),
        estimatedTotalAmount: new Money('49.9'),
        unallocatedAmount: new Money('0.1'),
        quantityPrecision: 4,
        orders: [
          {
            symbol: 'SUB',
            percent: new Money('100'),
            price: new Money('0.1234'),
            priceSource: PriceSource.PARTNER,
            amount: new Money('50'),
            quantity: new Money('405.18'),
            estimatedAmount: new Money('49.9'),
          },
        ],
      }),
    );

    expect(dto).toEqual({
      id: '0b6f3b8e-3c38-4b8a-9d6c-2f1f7a4b5c6d',
      orderType: 'SELL',
      portfolioName: 'Income',
      totalAmount: '50.00',
      estimatedTotalAmount: '49.90',
      unallocatedAmount: '0.10',
      quantityPrecision: 4,
      executeAt: '2026-11-09T14:30:00.000Z',
      marketTimezone: 'America/New_York',
      createdAt: '2026-11-08T20:00:00.000Z',
      orders: [
        {
          symbol: 'SUB',
          percent: '100',
          price: '0.1234',
          priceSource: 'PARTNER',
          amount: '50.00',
          quantity: '405.1800',
          estimatedAmount: '49.90',
        },
      ],
    });
  });

  it('pads whole-dollar prices to two decimals', () => {
    expect(toPortfolioOrderDto(portfolioOrderFixture()).orders[0]?.price).toBe('100.00');
  });

  it.each([
    [0, 20, 0],
    [1, 20, 1],
    [40, 20, 2],
    [41, 20, 3],
  ])(
    'computes pagination metadata for %i items at %i per page',
    (totalItems, pageSize, totalPages) => {
      expect(toPaginationMeta({ items: [], totalItems }, { page: 1, pageSize })).toEqual({
        page: 1,
        pageSize,
        totalItems,
        totalPages,
      });
    },
  );
});
