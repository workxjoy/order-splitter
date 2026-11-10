import {
  ApiHeader,
  ContentType,
  ErrorCode,
  OrderType,
  portfolioOrderListResponseSchema,
  portfolioOrderResponseSchema,
  errorResponseSchema,
} from '@order-splitter/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exampleOrderInput } from './fixtures/portfolio-order.fixtures.js';
import { createTestApp, MARKET_OPEN_INSTANT, type TestApp } from './utils/test-app.js';

const ORDERS_PATH = '/api/v1/portfolio-orders';
const UNKNOWN_ID = '7b7f4c2e-1f2a-4e3b-9c4d-5e6f7a8b9c0d';

describe('Portfolio orders API (e2e)', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    testApp = await createTestApp();
  });

  afterEach(async () => {
    await testApp.app.close();
  });

  const post = (body: unknown) =>
    testApp
      .http()
      .post(ORDERS_PATH)
      .send(body as object);

  describe('POST /api/v1/portfolio-orders', () => {
    it('splits USD 100 across AAPL and TSLA and returns 201 with a Location header', async () => {
      const response = await post(exampleOrderInput()).expect(201);

      expect(response.headers['content-type']).toContain(ContentType.JSON);
      expect(portfolioOrderResponseSchema.safeParse(response.body).success).toBe(true);
      expect(response.headers.location).toBe(`${ORDERS_PATH}/${response.body.data.id}`);
      expect(response.headers[ApiHeader.REQUEST_ID.toLowerCase()]).toBeDefined();
      expect(response.headers[ApiHeader.RESPONSE_TIME.toLowerCase()]).toMatch(/^\d+\.\d{3}ms$/);
      expect(response.headers[ApiHeader.REQUEST_REPLAYED.toLowerCase()]).toBeUndefined();
      expect(response.body).toEqual({
        data: {
          id: expect.any(String),
          orderType: 'BUY',
          portfolioName: null,
          totalAmount: '100.00',
          estimatedTotalAmount: '100.00',
          unallocatedAmount: '0.00',
          quantityPrecision: 3,
          executeAt: MARKET_OPEN_INSTANT.toISOString(),
          marketTimezone: 'America/New_York',
          createdAt: MARKET_OPEN_INSTANT.toISOString(),
          orders: [
            {
              symbol: 'AAPL',
              percent: '60',
              price: '100.00',
              priceSource: 'FIXED',
              amount: '60.00',
              quantity: '0.600',
              estimatedAmount: '60.00',
            },
            {
              symbol: 'TSLA',
              percent: '40',
              price: '100.00',
              priceSource: 'FIXED',
              amount: '40.00',
              quantity: '0.400',
              estimatedAmount: '40.00',
            },
          ],
        },
      });
    });

    it('supports SELL orders and partner market prices', async () => {
      const response = await post({
        orderType: OrderType.SELL,
        totalAmount: '2500.50',
        portfolio: {
          name: 'Tech Tilt',
          allocations: [
            { symbol: 'msft', percent: '70', marketPrice: '415.27' },
            { symbol: 'NVDA', percent: '30' },
          ],
        },
      }).expect(201);

      expect(response.body.data).toMatchObject({
        orderType: 'SELL',
        portfolioName: 'Tech Tilt',
        totalAmount: '2500.50',
        orders: [
          {
            symbol: 'MSFT',
            price: '415.27',
            priceSource: 'PARTNER',
            amount: '1750.35',
            quantity: '4.214',
            estimatedAmount: '1749.95',
          },
          {
            symbol: 'NVDA',
            price: '100.00',
            priceSource: 'FIXED',
            amount: '750.15',
            quantity: '7.501',
            estimatedAmount: '750.10',
          },
        ],
        estimatedTotalAmount: '2500.05',
        unallocatedAmount: '0.45',
      });
    });

    it('skips exchange holidays: an order after Wednesday’s close executes after Thanksgiving', async () => {
      testApp.clock.set(new Date('2026-11-25T22:00:00.000Z'));

      const response = await post(exampleOrderInput()).expect(201);

      expect(response.body.data.executeAt).toBe('2026-11-27T14:30:00.000Z');
    });

    it('schedules weekend orders for the next market open', async () => {
      testApp.clock.set(new Date('2026-11-14T17:00:00.000Z'));

      const response = await post(exampleOrderInput()).expect(201);

      expect(response.body.data.executeAt).toBe('2026-11-16T14:30:00.000Z');
    });

    it('returns field-level validation errors as problem details', async () => {
      const response = await post({
        orderType: 'HOLD',
        totalAmount: '-1',
        portfolio: { allocations: [{ symbol: 'AAPL', percent: 50 }] },
      }).expect(400);

      expect(response.headers['content-type']).toContain(ContentType.PROBLEM_JSON);
      expect(errorResponseSchema.safeParse(response.body).success).toBe(true);
      expect(response.body).toMatchObject({
        type: 'about:blank',
        title: 'Bad Request',
        status: 400,
        code: ErrorCode.VALIDATION_FAILED,
        instance: ORDERS_PATH,
        requestId: response.headers[ApiHeader.REQUEST_ID.toLowerCase()],
      });
      expect(response.body.errors.map((error: { path: string }) => error.path)).toEqual([
        'orderType',
        'totalAmount',
        'portfolio.allocations',
      ]);
    });

    it.each([
      // A double cannot hold this value: JSON.parse alone would round it to 10 and accept it.
      ['a number beyond double precision', '10.0000000000000001'],
      ['a number in exponent form', '1e2'],
    ])('validates %s exactly as sent', async (_case, rawAmount) => {
      const body = JSON.stringify(exampleOrderInput()).replace(
        /"totalAmount":[^,]+/,
        () => `"totalAmount":${rawAmount}`,
      );

      const response = await testApp
        .http()
        .post(ORDERS_PATH)
        .set('Content-Type', ContentType.JSON)
        .send(body)
        .expect(400);

      expect(response.body.errors).toEqual([{ path: 'totalAmount', message: expect.any(String) }]);
    });

    it('rejects stocks allocated less than the $1 minimum order with 422', async () => {
      const response = await post(exampleOrderInput({ totalAmount: '1.50' })).expect(422);

      expect(response.body).toMatchObject({
        code: ErrorCode.AMOUNT_BELOW_MINIMUM,
        errors: [
          {
            path: 'portfolio.allocations.0',
            message: '$0.90 allocated to AAPL is below the minimum order amount of $1.00',
          },
          {
            path: 'portfolio.allocations.1',
            message: '$0.60 allocated to TSLA is below the minimum order amount of $1.00',
          },
        ],
      });
    });

    it('rejects a stock whose quantity rounds to zero with 422', async () => {
      const response = await post(
        exampleOrderInput({
          totalAmount: '500',
          portfolio: { allocations: [{ symbol: 'BRK.A', percent: 100, marketPrice: 750000 }] },
        }),
      ).expect(422);

      expect(response.body).toMatchObject({
        code: ErrorCode.QUANTITY_BELOW_MINIMUM,
        errors: [{ path: 'portfolio.allocations.0', message: expect.stringContaining('BRK.A') }],
      });
    });

    describe('request keys', () => {
      const postWithKey = (key: string, body: unknown) =>
        testApp
          .http()
          .post(ORDERS_PATH)
          .set(ApiHeader.REQUEST_KEY, key)
          .send(body as object);

      it('replays the original order for a retry with the same key and an equivalent body', async () => {
        const first = await postWithKey('retry-42', exampleOrderInput()).expect(201);
        const retry = await postWithKey('retry-42', {
          ...exampleOrderInput(),
          totalAmount: '100.00',
        }).expect(201);

        expect(retry.headers[ApiHeader.REQUEST_REPLAYED.toLowerCase()]).toBe('true');
        expect(retry.body).toEqual(first.body);
        const history = await testApp.http().get(ORDERS_PATH).expect(200);
        expect(history.body.meta.totalItems).toBe(1);
      });

      it('rejects the same key with a different body', async () => {
        await postWithKey('retry-43', exampleOrderInput()).expect(201);

        const response = await postWithKey(
          'retry-43',
          exampleOrderInput({ orderType: OrderType.SELL }),
        ).expect(422);

        expect(response.body.code).toBe(ErrorCode.REQUEST_KEY_REUSED);
      });

      it.each([
        ['blank', '   '],
        ['too long', 'k'.repeat(256)],
      ])('rejects a %s key', async (_case, key) => {
        const response = await postWithKey(key, exampleOrderInput()).expect(400);

        expect(response.body.errors).toEqual([
          { path: ApiHeader.REQUEST_KEY, message: expect.any(String) },
        ]);
      });
    });
  });

  describe('GET /api/v1/portfolio-orders', () => {
    it('returns history newest first with pagination metadata and an order-type filter', async () => {
      const buy = await post(exampleOrderInput()).expect(201);
      const sell = await post(exampleOrderInput({ orderType: OrderType.SELL })).expect(201);
      const latest = await post(exampleOrderInput({ totalAmount: 250 })).expect(201);

      const all = await testApp.http().get(ORDERS_PATH).expect(200);
      expect(portfolioOrderListResponseSchema.safeParse(all.body).success).toBe(true);
      expect(all.body.data.map((order: { id: string }) => order.id)).toEqual([
        latest.body.data.id,
        sell.body.data.id,
        buy.body.data.id,
      ]);
      expect(all.body.meta).toEqual({ page: 1, pageSize: 20, totalItems: 3, totalPages: 1 });

      const sells = await testApp.http().get(ORDERS_PATH).query({ orderType: 'SELL' }).expect(200);
      expect(sells.body.data).toEqual([sell.body.data]);

      const secondPage = await testApp
        .http()
        .get(ORDERS_PATH)
        .query({ page: 2, pageSize: 2 })
        .expect(200);
      expect(secondPage.body.data.map((order: { id: string }) => order.id)).toEqual([
        buy.body.data.id,
      ]);
      expect(secondPage.body.meta).toEqual({ page: 2, pageSize: 2, totalItems: 3, totalPages: 2 });
    });

    it('returns an empty first page when there is no history', async () => {
      const response = await testApp.http().get(ORDERS_PATH).expect(200);

      expect(response.body).toEqual({
        data: [],
        meta: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
      });
    });

    it('rejects an unknown query parameter instead of ignoring the filter', async () => {
      const response = await testApp
        .http()
        .get(ORDERS_PATH)
        .query({ ordertype: 'SELL' })
        .expect(400);

      expect(response.body.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(response.body.errors).toEqual([
        { path: '', message: expect.stringContaining('ordertype') },
      ]);
    });

    it('rejects invalid query parameters', async () => {
      const response = await testApp
        .http()
        .get(ORDERS_PATH)
        .query({ page: 0, pageSize: 500 })
        .expect(400);

      expect(response.body.errors.map((error: { path: string }) => error.path)).toEqual([
        'page',
        'pageSize',
      ]);
    });
  });

  describe('GET /api/v1/portfolio-orders/:id', () => {
    it('returns a stored order', async () => {
      const created = await post(exampleOrderInput()).expect(201);

      const response = await testApp
        .http()
        .get(created.headers.location as string)
        .expect(200);

      expect(response.body).toEqual(created.body);
    });

    it('finds an order by its id in upper case (UUIDs are case-insensitive)', async () => {
      const created = await post(exampleOrderInput()).expect(201);
      const id: string = created.body.data.id;

      const response = await testApp.http().get(`${ORDERS_PATH}/${id.toUpperCase()}`).expect(200);

      expect(response.body).toEqual(created.body);
    });

    it('returns 404 problem details for an unknown id', async () => {
      const response = await testApp.http().get(`${ORDERS_PATH}/${UNKNOWN_ID}`).expect(404);

      expect(response.body).toMatchObject({
        code: ErrorCode.PORTFOLIO_ORDER_NOT_FOUND,
        status: 404,
      });
    });

    it('returns 400 for a malformed id', async () => {
      const response = await testApp.http().get(`${ORDERS_PATH}/not-a-uuid`).expect(400);

      expect(response.body.errors).toEqual([{ path: 'id', message: 'Invalid UUID' }]);
    });
  });

  describe('configuration and lifecycle', () => {
    it('applies the configured quantity precision (7 decimal places)', async () => {
      const precise = await createTestApp({ trading: { quantityDecimalPlaces: 7 } });
      try {
        const response = await precise
          .http()
          .post(ORDERS_PATH)
          .send(
            exampleOrderInput({
              portfolio: { allocations: [{ symbol: 'XYZ', percent: 100, marketPrice: 7 }] },
            }),
          )
          .expect(201);

        expect(response.body.data).toMatchObject({
          quantityPrecision: 7,
          orders: [{ quantity: '14.2857142' }],
        });
      } finally {
        await precise.app.close();
      }
    });

    it('does not keep data across application restarts', async () => {
      await post(exampleOrderInput()).expect(201);
      await testApp.app.close();

      testApp = await createTestApp();
      const response = await testApp.http().get(ORDERS_PATH).expect(200);

      expect(response.body.meta.totalItems).toBe(0);
    });
  });
});
