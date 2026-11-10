import { OrderType } from '@order-splitter/shared';
import { describe, expect, it } from 'vitest';
import { historyHref, parseHistoryQuery } from './history-query';

describe('parseHistoryQuery', () => {
  it('reads page and order type from search params', () => {
    expect(parseHistoryQuery({ page: '3', orderType: 'SELL' })).toEqual({
      page: 3,
      pageSize: 20,
      orderType: 'SELL',
    });
  });

  it('uses the first value of repeated params', () => {
    expect(parseHistoryQuery({ page: ['2', '9'] })).toEqual({ page: 2, pageSize: 20 });
  });

  it.each([[{ page: '0' }], [{ page: 'x' }], [{ orderType: 'HOLD' }]])(
    'falls back to defaults for %j',
    (params) => {
      expect(parseHistoryQuery(params)).toEqual({ page: 1, pageSize: 20 });
    },
  );

  it('keeps each valid param when another one is invalid', () => {
    expect(parseHistoryQuery({ orderType: 'SELL', page: '0' })).toEqual({
      page: 1,
      pageSize: 20,
      orderType: 'SELL',
    });
    expect(parseHistoryQuery({ orderType: 'HOLD', page: '4' })).toEqual({ page: 4, pageSize: 20 });
  });
});

describe('historyHref', () => {
  it('omits default values', () => {
    expect(historyHref(1)).toBe('/orders');
    expect(historyHref(1, OrderType.BUY)).toBe('/orders?orderType=BUY');
    expect(historyHref(2, OrderType.SELL)).toBe('/orders?orderType=SELL&page=2');
  });
});
