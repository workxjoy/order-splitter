import { OrderType } from '@order-splitter/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { marketConfigFixture, tradingConfigFixture } from '../../test/fixtures/config.fixtures.js';
import { FixedClock } from '../../test/fixtures/fixed-clock.js';
import {
  exampleOrderRequest,
  portfolioOrderFixture,
} from '../../test/fixtures/portfolio-order.fixtures.js';
import { MarketCalendarService } from './services/market-calendar.service.js';
import { OrderAllocationService } from './services/order-allocation.service.js';
import { PortfolioOrdersService } from './portfolio-orders.service.js';
import {
  AmountBelowMinimumException,
  RequestKeyReusedException,
  PortfolioOrderNotFoundException,
} from './portfolio-orders.exceptions.js';
import { InMemoryPortfolioOrderRepository } from './repositories/in-memory-portfolio-orders.repository.js';
import {
  DuplicateRequestKeyException,
  type PortfolioOrderRepository,
} from './repositories/portfolio-orders.repository.js';

const SATURDAY = new Date('2026-11-14T17:00:00.000Z');
const NEXT_MONDAY_OPEN = new Date('2026-11-16T14:30:00.000Z');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function createService(repository: PortfolioOrderRepository, clock = new FixedClock(SATURDAY)) {
  return new PortfolioOrdersService(
    repository,
    new OrderAllocationService(tradingConfigFixture()),
    new MarketCalendarService(marketConfigFixture()),
    clock,
  );
}

describe('PortfolioOrdersService', () => {
  let repository: InMemoryPortfolioOrderRepository;
  let service: PortfolioOrdersService;

  beforeEach(() => {
    repository = new InMemoryPortfolioOrderRepository();
    service = createService(repository);
  });

  describe('create', () => {
    it('splits, schedules and stores a new order', async () => {
      const { order, replayed } = await service.create(
        exampleOrderRequest({
          orderType: OrderType.SELL,
          portfolio: { name: 'Core', allocations: [{ symbol: 'VOO', percent: 100 }] },
        }),
      );

      expect(replayed).toBe(false);
      expect(order).toMatchObject({
        orderType: OrderType.SELL,
        portfolioName: 'Core',
        quantityPrecision: 3,
        createdAt: SATURDAY,
        executeAt: NEXT_MONDAY_OPEN,
        marketTimezone: 'America/New_York',
        keyRecord: null,
      });
      expect(order.id).toMatch(UUID_PATTERN);
      expect(order.totalAmount.toFixed(2)).toBe('100.00');
      expect(order.orders.map((stock) => [stock.symbol, stock.quantity.toFixed()])).toEqual([
        ['VOO', '1'],
      ]);
      await expect(repository.findById(order.id)).resolves.toBe(order);
    });

    it('stores a null portfolio name when none is given', async () => {
      const { order } = await service.create(exampleOrderRequest());

      expect(order.portfolioName).toBeNull();
    });

    it('replays the original order for a retried request with the same request key', async () => {
      const first = await service.create(exampleOrderRequest(), 'retry-1');
      const retry = await service.create(exampleOrderRequest(), 'retry-1');

      expect(retry).toEqual({ order: first.order, replayed: true });
      expect((await repository.list({}, { offset: 0, limit: 10 })).totalItems).toBe(1);
    });

    it('rejects reuse of a request key with a different request', async () => {
      await service.create(exampleOrderRequest(), 'retry-1');

      await expect(
        service.create(exampleOrderRequest({ totalAmount: 200 }), 'retry-1'),
      ).rejects.toBeInstanceOf(RequestKeyReusedException);
    });

    it('treats requests without a key as independent orders', async () => {
      const first = await service.create(exampleOrderRequest());
      const second = await service.create(exampleOrderRequest());

      expect(second.order.id).not.toBe(first.order.id);
    });

    it('answers with the winning order when a concurrent request inserts the same key first', async () => {
      const winner = (
        await createService(new InMemoryPortfolioOrderRepository()).create(
          exampleOrderRequest(),
          'race',
        )
      ).order;
      const racingRepository: PortfolioOrderRepository = {
        findByRequestKey: vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(winner),
        insert: vi.fn().mockRejectedValue(new DuplicateRequestKeyException()),
        findById: vi.fn(),
        list: vi.fn(),
      };

      await expect(
        createService(racingRepository).create(exampleOrderRequest(), 'race'),
      ).resolves.toEqual({
        order: winner,
        replayed: true,
      });
    });

    it('propagates storage failures unrelated to request keys', async () => {
      const failure = new Error('disk full');
      const failingRepository: PortfolioOrderRepository = {
        findByRequestKey: vi.fn().mockResolvedValue(undefined),
        insert: vi.fn().mockRejectedValue(failure),
        findById: vi.fn(),
        list: vi.fn(),
      };

      await expect(
        createService(failingRepository).create(exampleOrderRequest(), 'k'),
      ).rejects.toBe(failure);
      await expect(createService(failingRepository).create(exampleOrderRequest())).rejects.toBe(
        failure,
      );
    });

    it('does not store anything when the split is rejected', async () => {
      await expect(
        service.create(exampleOrderRequest({ totalAmount: '0.01' })),
      ).rejects.toBeInstanceOf(AmountBelowMinimumException);
      expect((await repository.list({}, { offset: 0, limit: 10 })).totalItems).toBe(0);
    });
  });

  describe('getById', () => {
    it('returns a stored order', async () => {
      const { order } = await service.create(exampleOrderRequest());

      await expect(service.getById(order.id)).resolves.toBe(order);
    });

    it('throws a not-found error for an unknown id', async () => {
      await expect(service.getById('7b7f4c2e-1f2a-4e3b-9c4d-5e6f7a8b9c0d')).rejects.toBeInstanceOf(
        PortfolioOrderNotFoundException,
      );
    });
  });

  describe('list', () => {
    it('translates page numbers into offsets and forwards the filter', async () => {
      const spy = vi.spyOn(repository, 'list');
      await repository.insert(portfolioOrderFixture());

      await service.list({ page: 3, pageSize: 25, orderType: OrderType.BUY });
      await service.list({ page: 1, pageSize: 20 });

      expect(spy).toHaveBeenNthCalledWith(
        1,
        { orderType: OrderType.BUY },
        { offset: 50, limit: 25 },
      );
      expect(spy).toHaveBeenNthCalledWith(2, {}, { offset: 0, limit: 20 });
    });
  });
});
