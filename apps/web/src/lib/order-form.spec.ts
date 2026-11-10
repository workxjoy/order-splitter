import { createPortfolioOrderSchema, OrderType, toFieldErrorList } from '@order-splitter/shared';
import { describe, expect, it } from 'vitest';
import {
  emptyAllocationRow,
  exampleFormValues,
  FieldPath,
  percentTotal,
  toCreateInput,
  toFieldErrors,
  withoutRowErrors,
  type AllocationRow,
} from './order-form';

const row = (symbol: string, percent: string, marketPrice = ''): AllocationRow => ({
  id: symbol,
  symbol,
  percent,
  marketPrice,
});

describe('order form model', () => {
  it('starts from a sample order that passes validation', () => {
    let next = 0;
    const values = exampleFormValues(() => `row-${(next += 1)}`);

    expect(values.allocations.map(({ id, symbol }) => [id, symbol])).toEqual([
      ['row-1', 'AAPL'],
      ['row-2', 'TSLA'],
    ]);
    expect(createPortfolioOrderSchema.safeParse(toCreateInput(values)).success).toBe(true);
  });

  it('omits a blank portfolio name and blank market prices from the request', () => {
    const input = toCreateInput({
      orderType: OrderType.SELL,
      totalAmount: '250',
      portfolioName: '   ',
      allocations: [row('AAPL', '50', '187.35'), row('MSFT', '50', '  ')],
    });

    expect(input).toEqual({
      orderType: 'SELL',
      totalAmount: '250',
      portfolio: {
        allocations: [
          { symbol: 'AAPL', percent: '50', marketPrice: '187.35' },
          { symbol: 'MSFT', percent: '50' },
        ],
      },
    });
  });

  it('keeps a trimmed portfolio name', () => {
    const input = toCreateInput({
      orderType: OrderType.BUY,
      totalAmount: '1',
      portfolioName: ' Core ',
      allocations: [emptyAllocationRow('x')],
    });

    expect(input.portfolio.name).toBe('Core');
  });

  it('sums valid percentages exactly and ignores rows still being typed', () => {
    expect(percentTotal([row('A', '33.3333'), row('B', '33.3333'), row('C', '33.3334')])).toEqual({
      total: '100',
      allValid: true,
      isComplete: true,
    });
    expect(percentTotal([row('A', '0.1'), row('B', '0.2'), row('C', 'abc')])).toEqual({
      total: '0.3',
      allValid: false,
      isComplete: false,
    });
    expect(percentTotal([row('A', ''), row('B', '-')])).toEqual({
      total: null,
      allValid: false,
      isComplete: false,
    });
    expect(percentTotal([row('A', '60'), row('B', '30')])).toEqual({
      total: '90',
      allValid: true,
      isComplete: false,
    });
  });

  it.each([
    ['not a number', 'abc'],
    ['blank', ''],
    ['zero', '0'],
    ['too precise', '0.00001'],
  ])('is not complete at 100%% while another row is %s', (_case, percent) => {
    expect(percentTotal([row('A', '100'), row('B', percent)])).toEqual({
      total: '100',
      allValid: false,
      isComplete: false,
    });
  });

  it('moves row errors up when a row is removed, dropping the removed row’s errors', () => {
    const errors = {
      [FieldPath.ALLOCATIONS]: ['Must add up to 100'],
      [FieldPath.allocationField(0, 'symbol')]: ['Bad A'],
      [FieldPath.allocationField(1, 'percent')]: ['Bad B'],
      [FieldPath.allocation(2)]: ['Too small C'],
      [FieldPath.allocationField(2, 'percent')]: ['Bad C'],
      [FieldPath.TOTAL_AMOUNT]: ['Required'],
    };

    expect(withoutRowErrors(errors, 1)).toEqual({
      [FieldPath.ALLOCATIONS]: ['Must add up to 100'],
      [FieldPath.allocationField(0, 'symbol')]: ['Bad A'],
      [FieldPath.allocation(1)]: ['Too small C'],
      [FieldPath.allocationField(1, 'percent')]: ['Bad C'],
      [FieldPath.TOTAL_AMOUNT]: ['Required'],
    });
  });

  it('converts schema issues and groups API errors by field path', () => {
    const list = toFieldErrorList([
      { path: ['portfolio', 'allocations', 1, 'percent'], message: 'Too many decimals' },
      { path: ['portfolio', 'allocations', 1, 'percent'], message: 'Must be at most 100' },
      { path: [], message: 'Root' },
    ]);

    expect(toFieldErrors(list)).toEqual({
      [FieldPath.allocationField(1, 'percent')]: ['Too many decimals', 'Must be at most 100'],
      '': ['Root'],
    });
  });
});
