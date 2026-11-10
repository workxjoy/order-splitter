import { OrderType } from '@order-splitter/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { portfolioOrderFixture } from '../../../test/fixtures/portfolio-order.fixtures.js';
import type { StockOrder } from '../entities/portfolio-order.entity.js';
import { InMemoryPortfolioOrderRepository } from './in-memory-portfolio-orders.repository.js';
import { DuplicateRequestKeyException } from './portfolio-orders.repository.js';

describe('InMemoryPortfolioOrderRepository', () => {
  let repository: InMemoryPortfolioOrderRepository;

  beforeEach(() => {
    repository = new InMemoryPortfolioOrderRepository();
  });

  it('stores orders and finds them by id', async () => {
    const order = portfolioOrderFixture();
    await repository.insert(order);

    await expect(repository.findById(order.id)).resolves.toBe(order);
    await expect(repository.findById('missing')).resolves.toBeUndefined();
  });

  it('finds orders by request key', async () => {
    const order = portfolioOrderFixture({ keyRecord: { key: 'key-1', requestHash: 'f1' } });
    await repository.insert(order);

    await expect(repository.findByRequestKey('key-1')).resolves.toBe(order);
    await expect(repository.findByRequestKey('key-2')).resolves.toBeUndefined();
  });

  it('enforces unique request keys like a unique index', async () => {
    await repository.insert(
      portfolioOrderFixture({ keyRecord: { key: 'key-1', requestHash: 'f1' } }),
    );
    const duplicate = portfolioOrderFixture({ keyRecord: { key: 'key-1', requestHash: 'f2' } });

    await expect(repository.insert(duplicate)).rejects.toBeInstanceOf(DuplicateRequestKeyException);
    await expect(repository.findById(duplicate.id)).resolves.toBeUndefined();
  });

  it('lists history newest first with totals', async () => {
    const [first, second, third] = [
      portfolioOrderFixture(),
      portfolioOrderFixture(),
      portfolioOrderFixture(),
    ];
    for (const order of [first, second, third]) await repository.insert(order);

    const page = await repository.list({}, { offset: 0, limit: 10 });

    expect(page.items.map((order) => order.id)).toEqual([third.id, second.id, first.id]);
    expect(page.totalItems).toBe(3);
  });

  it('filters by order type before paginating', async () => {
    const buy = portfolioOrderFixture({ orderType: OrderType.BUY });
    const sell = portfolioOrderFixture({ orderType: OrderType.SELL });
    await repository.insert(buy);
    await repository.insert(sell);

    const page = await repository.list({ orderType: OrderType.SELL }, { offset: 0, limit: 10 });

    expect(page.items).toEqual([sell]);
    expect(page.totalItems).toBe(1);
  });

  it('slices pages and returns an empty page beyond the end', async () => {
    const orders = Array.from({ length: 5 }, () => portfolioOrderFixture());
    for (const order of orders) await repository.insert(order);

    const secondPage = await repository.list({}, { offset: 2, limit: 2 });
    const beyond = await repository.list({}, { offset: 10, limit: 2 });

    expect(secondPage.items.map((order) => order.id)).toEqual([orders[2]?.id, orders[1]?.id]);
    expect(secondPage.totalItems).toBe(5);
    expect(beyond.items).toEqual([]);
    expect(beyond.totalItems).toBe(5);
  });

  it('returns a partial last page', async () => {
    const orders = Array.from({ length: 5 }, () => portfolioOrderFixture());
    for (const order of orders) await repository.insert(order);

    const lastPage = await repository.list({}, { offset: 4, limit: 2 });

    expect(lastPage.items.map((order) => order.id)).toEqual([orders[0]?.id]);
  });

  it('paginates within an order type, newest first', async () => {
    const sells = [1, 2, 3].map(() => portfolioOrderFixture({ orderType: OrderType.SELL }));
    for (const sell of sells) {
      await repository.insert(sell);
      await repository.insert(portfolioOrderFixture({ orderType: OrderType.BUY }));
    }

    const page = await repository.list({ orderType: OrderType.SELL }, { offset: 1, limit: 2 });

    expect(page.items.map((order) => order.id)).toEqual([sells[1]?.id, sells[0]?.id]);
    expect(page.totalItems).toBe(3);
  });

  it('evicts the oldest orders, and their request keys, beyond its capacity', async () => {
    const bounded = new InMemoryPortfolioOrderRepository({ maxOrders: 2, maxStockOrders: 100 });
    const oldest = portfolioOrderFixture({
      orderType: OrderType.SELL,
      keyRecord: { key: 'key-old', requestHash: 'f1' },
    });
    const middle = portfolioOrderFixture({ orderType: OrderType.BUY });
    const newest = portfolioOrderFixture({ orderType: OrderType.SELL });
    for (const order of [oldest, middle, newest]) await bounded.insert(order);

    await expect(bounded.findById(oldest.id)).resolves.toBeUndefined();
    await expect(bounded.findByRequestKey('key-old')).resolves.toBeUndefined();
    const all = await bounded.list({}, { offset: 0, limit: 10 });
    expect(all.items.map((order) => order.id)).toEqual([newest.id, middle.id]);
    expect(all.totalItems).toBe(2);
    const sells = await bounded.list({ orderType: OrderType.SELL }, { offset: 0, limit: 10 });
    expect(sells.items).toEqual([newest]);
    expect(sells.totalItems).toBe(1);
    // The evicted key is free again.
    await expect(
      bounded.insert(portfolioOrderFixture({ keyRecord: { key: 'key-old', requestHash: 'f2' } })),
    ).resolves.toBeUndefined();
  });

  it('also evicts by the total number of stored stock lines', async () => {
    const bounded = new InMemoryPortfolioOrderRepository({ maxOrders: 100, maxStockOrders: 5 });
    const withLines = (count: number) => {
      const line = portfolioOrderFixture().orders[0] as StockOrder;
      return portfolioOrderFixture({ orders: Array.from({ length: count }, () => line) });
    };
    const [first, second, third] = [withLines(2), withLines(2), withLines(3)];
    for (const order of [first, second, third]) await bounded.insert(order);

    // 2 + 2 + 3 lines is over the limit of 5, so the oldest order goes: 2 + 3 remain.
    const all = await bounded.list({}, { offset: 0, limit: 10 });
    expect(all.items.map((order) => order.id)).toEqual([third.id, second.id]);
    await expect(bounded.findById(first.id)).resolves.toBeUndefined();
  });

  it('keeps the newest order even if it is bigger than the stock-line limit on its own', async () => {
    const bounded = new InMemoryPortfolioOrderRepository({ maxOrders: 100, maxStockOrders: 1 });
    const line = portfolioOrderFixture().orders[0] as StockOrder;
    const large = portfolioOrderFixture({ orders: [line, line, line] });
    await bounded.insert(portfolioOrderFixture());
    await bounded.insert(large);

    const all = await bounded.list({}, { offset: 0, limit: 10 });
    expect(all.items).toEqual([large]);
  });
});
