import { PriceSource } from '@order-splitter/shared';
import { describe, expect, it } from 'vitest';
import { tradingConfigFixture } from '../../../test/fixtures/config.fixtures.js';
import { Money } from '../../common/utils/money.js';
import type { TradingConfig } from '../../config/trading.config.js';
import {
  AmountBelowMinimumException,
  QuantityBelowMinimumException,
} from '../portfolio-orders.exceptions.js';
import {
  OrderAllocationService,
  type AllocationRequest,
  type AllocationResult,
} from './order-allocation.service.js';

type AllocationRow = [symbol: string, percent: string, marketPrice?: string];

function request(totalAmount: string, rows: AllocationRow[]): AllocationRequest {
  return {
    totalAmount: new Money(totalAmount),
    allocations: rows.map(([symbol, percent, marketPrice]) => ({
      symbol,
      percent: new Money(percent),
      ...(marketPrice !== undefined && { marketPrice: new Money(marketPrice) }),
    })),
  };
}

const NO_MINIMUM = new Money(0);
const ONE_DOLLAR = new Money(1);

/** Most rules are shown with tiny amounts, so the minimum order amount is off unless a test sets it. */
function allocate(req: AllocationRequest, config: Partial<TradingConfig> = {}): AllocationResult {
  return new OrderAllocationService(
    tradingConfigFixture({ minOrderAmount: NO_MINIMUM, ...config }),
  ).allocate(req);
}

/** The field errors carried by the error a call throws. */
function fieldErrorsOf(act: () => unknown): unknown {
  try {
    act();
  } catch (error) {
    return (error as { fieldErrors?: unknown }).fieldErrors;
  }
  return expect.unreachable('expected the allocation to be rejected');
}

/** Flattens decimals to strings so expectations read like the API response. */
function summarise(result: AllocationResult) {
  return {
    orders: result.orders.map((order) => ({
      symbol: order.symbol,
      price: order.price.toFixed(),
      priceSource: order.priceSource,
      amount: order.amount.toFixed(2),
      quantity: order.quantity.toFixed(result.quantityPrecision),
      estimatedAmount: order.estimatedAmount.toFixed(2),
    })),
    estimatedTotalAmount: result.estimatedTotalAmount.toFixed(2),
    unallocatedAmount: result.unallocatedAmount.toFixed(2),
  };
}

describe('OrderAllocationService', () => {
  it('splits USD 100 as 60% AAPL / 40% TSLA at the fixed $100 price', () => {
    const result = allocate(
      request('100', [
        ['AAPL', '60'],
        ['TSLA', '40'],
      ]),
    );

    expect(summarise(result)).toEqual({
      orders: [
        {
          symbol: 'AAPL',
          price: '100',
          priceSource: PriceSource.FIXED,
          amount: '60.00',
          quantity: '0.600',
          estimatedAmount: '60.00',
        },
        {
          symbol: 'TSLA',
          price: '100',
          priceSource: PriceSource.FIXED,
          amount: '40.00',
          quantity: '0.400',
          estimatedAmount: '40.00',
        },
      ],
      estimatedTotalAmount: '100.00',
      unallocatedAmount: '0.00',
    });
    expect(result.quantityPrecision).toBe(3);
  });

  it('gives a partner-supplied market price priority over the fixed price, per stock', () => {
    const result = allocate(
      request('100', [
        ['AAPL', '60', '150'],
        ['TSLA', '40'],
      ]),
    );

    expect(summarise(result).orders).toEqual([
      {
        symbol: 'AAPL',
        price: '150',
        priceSource: PriceSource.PARTNER,
        amount: '60.00',
        quantity: '0.400',
        estimatedAmount: '60.00',
      },
      {
        symbol: 'TSLA',
        price: '100',
        priceSource: PriceSource.FIXED,
        amount: '40.00',
        quantity: '0.400',
        estimatedAmount: '40.00',
      },
    ]);
  });

  it('uses the configured fixed price when no market price is given', () => {
    const result = allocate(request('100', [['AAPL', '100']]), {
      defaultStockPrice: new Money('25'),
    });

    expect(result.orders[0]?.quantity.toFixed()).toBe('4');
  });

  it('apportions whole cents by largest remainder so amounts always sum to the total', () => {
    const result = allocate(
      request('100', [
        ['A', '33.3333'],
        ['B', '33.3333'],
        ['C', '33.3334'],
      ]),
    );

    expect(result.orders.map((order) => order.amount.toFixed(2))).toEqual([
      '33.33',
      '33.33',
      '33.34',
    ]);
  });

  it('breaks equal remainders in portfolio order', () => {
    const result = allocate(
      request('0.05', [
        ['A', '50', '0.01'],
        ['B', '50', '0.01'],
      ]),
    );

    expect(result.orders.map((order) => order.amount.toFixed(2))).toEqual(['0.03', '0.02']);
  });

  it('rounds quantities down and reports the cash left over', () => {
    const result = allocate(request('100', [['AAPL', '100', '30']]));

    expect(summarise(result)).toMatchObject({
      orders: [{ amount: '100.00', quantity: '3.333', estimatedAmount: '99.99' }],
      estimatedTotalAmount: '99.99',
      unallocatedAmount: '0.01',
    });
  });

  it.each([
    [0, '14', '98.00', '2.00'],
    [3, '14.285', '100.00', '0.00'], // 99.995 rounds to the cent
    [7, '14.2857142', '100.00', '0.00'],
    [9, '14.285714285', '100.00', '0.00'],
  ])(
    'honours a quantity precision of %i decimal places',
    (precision, quantity, estimated, unallocated) => {
      const result = allocate(request('100', [['XYZ', '100', '7']]), {
        quantityDecimalPlaces: precision,
      });

      expect(result.quantityPrecision).toBe(precision);
      expect(summarise(result)).toMatchObject({
        orders: [{ quantity, estimatedAmount: estimated }],
        unallocatedAmount: unallocated,
      });
    },
  );

  it('never estimates more than the amount allocated to a stock', () => {
    const prices = ['0.0001', '0.3333', '1', '2.9999', '7', '99.9999', '187.35'];
    for (const price of prices) {
      const result = allocate(
        request('987.65', [
          ['A', '37.5', price],
          ['B', '62.5', '3'],
        ]),
        {
          quantityDecimalPlaces: 2,
        },
      );
      for (const order of result.orders) {
        expect(order.estimatedAmount.lte(order.amount)).toBe(true);
      }
      expect(result.unallocatedAmount.gte(0)).toBe(true);
    }
  });

  it('keeps exact precision for the largest amounts and smallest prices', () => {
    const result = allocate(request('1000000000', [['PENNY', '100', '0.0001']]), {
      quantityDecimalPlaces: 9,
    });

    expect(summarise(result).orders[0]).toMatchObject({
      quantity: '10000000000000.000000000',
      estimatedAmount: '1000000000.00',
    });
  });

  it('supports sub-penny partner prices', () => {
    const result = allocate(request('10', [['SUB', '100', '0.1234']]));

    expect(summarise(result).orders[0]).toMatchObject({
      quantity: '81.037',
      estimatedAmount: '10.00',
    });
  });

  it('rejects allocations whose quantity rounds to zero, listing every offending stock', () => {
    const act = () =>
      allocate(
        request('0.10', [
          ['AAPL', '50'],
          ['TSLA', '30'],
          ['CHEAP', '20', '0.01'],
        ]),
      );

    expect(act).toThrow(QuantityBelowMinimumException);
    try {
      act();
    } catch (error) {
      expect((error as QuantityBelowMinimumException).fieldErrors).toEqual([
        {
          path: 'portfolio.allocations.0',
          message:
            '$0.05 allocated to AAPL buys less than the minimum quantity of 0.001 at $100.00 per share',
        },
        {
          path: 'portfolio.allocations.1',
          message:
            '$0.03 allocated to TSLA buys less than the minimum quantity of 0.001 at $100.00 per share',
        },
      ]);
    }
  });

  describe('minimum order amount', () => {
    it('rejects stocks allocated less than the minimum, listing every one', () => {
      const act = () =>
        allocate(
          request('5', [
            ['AAPL', '90'],
            ['TSLA', '8'],
            ['MSFT', '2'],
          ]),
          { minOrderAmount: ONE_DOLLAR },
        );

      expect(act).toThrow(AmountBelowMinimumException);
      expect(fieldErrorsOf(act)).toEqual([
        {
          path: 'portfolio.allocations.1',
          message: '$0.40 allocated to TSLA is below the minimum order amount of $1.00',
        },
        {
          path: 'portfolio.allocations.2',
          message: '$0.10 allocated to MSFT is below the minimum order amount of $1.00',
        },
      ]);
    });

    it('accepts an allocation of exactly the minimum', () => {
      const result = allocate(
        request('2', [
          ['AAPL', '50'],
          ['TSLA', '50'],
        ]),
        {
          minOrderAmount: ONE_DOLLAR,
        },
      );

      expect(result.orders.map((order) => order.amount.toFixed(2))).toEqual(['1.00', '1.00']);
    });

    it('rejects a stock whose shares, once rounded down, are worth less than the minimum', () => {
      // $1.00 at $750 a share is 0.001333 shares: 0.001 at 3 decimal places, worth $0.75.
      const act = () =>
        allocate(
          request('101', [
            ['AAPL', '99'],
            ['NVR', '1', '750'],
          ]),
          { minOrderAmount: ONE_DOLLAR },
        );

      expect(act).toThrow(AmountBelowMinimumException);
      expect(fieldErrorsOf(act)).toEqual([
        {
          path: 'portfolio.allocations.1',
          message:
            '$1.01 allocated to NVR comes to 0.001 shares worth $0.75, below the minimum order ' +
            'amount of $1.00',
        },
      ]);
    });

    it('compares the exact value of the shares, not the value rounded to cents', () => {
      // $1.00 at $199 is 0.005 shares, worth $0.995: shown as $1.00, but still under the minimum.
      const act = () =>
        allocate(request('1', [['XYZ', '100', '199']]), { minOrderAmount: ONE_DOLLAR });

      expect(fieldErrorsOf(act)).toEqual([
        {
          path: 'portfolio.allocations.0',
          message: expect.stringContaining('0.005 shares worth $0.995, below'),
        },
      ]);
    });

    it('reports amounts below the minimum before quantities that round to zero', () => {
      // AAPL gets $1.50, but at $2,000 a share that is 0.00075 shares: 0 at 3 decimal places.
      const amountAndQuantity = () =>
        allocate(
          request('2', [
            ['AAPL', '75', '2000'],
            ['TSLA', '25'],
          ]),
          {
            minOrderAmount: ONE_DOLLAR,
          },
        );
      const quantityOnly = () =>
        allocate(
          request('3', [
            ['AAPL', '50', '2000'],
            ['TSLA', '50'],
          ]),
          {
            minOrderAmount: ONE_DOLLAR,
          },
        );

      expect(amountAndQuantity).toThrow(AmountBelowMinimumException);
      expect(fieldErrorsOf(amountAndQuantity)).toEqual([
        { path: 'portfolio.allocations.1', message: expect.stringContaining('TSLA') },
      ]);
      expect(quantityOnly).toThrow(QuantityBelowMinimumException);
      expect(fieldErrorsOf(quantityOnly)).toEqual([
        { path: 'portfolio.allocations.0', message: expect.stringContaining('AAPL') },
      ]);
    });
  });

  it('accepts a zero precision only when whole shares are affordable', () => {
    expect(() => allocate(request('99', [['AAPL', '100']]), { quantityDecimalPlaces: 0 })).toThrow(
      QuantityBelowMinimumException,
    );
    expect(
      allocate(request('100', [['AAPL', '100']]), {
        quantityDecimalPlaces: 0,
      }).orders[0]?.quantity.toFixed(),
    ).toBe('1');
  });
});
