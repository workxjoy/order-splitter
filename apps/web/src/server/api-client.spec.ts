import {
  ContentType,
  ErrorCode,
  OrderType,
  type CreatePortfolioOrderRequest,
} from '@order-splitter/shared';
import { headers } from 'next/headers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { DEFAULT_API_BASE_URL } from '@/lib/constants';
import { orderList, portfolioOrder, errorResponse } from '@/test/fixtures';
import { ApiError, portfolioOrdersApi, ResponseContractError } from './api-client';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: vi.fn() }));

const BASE_URL = 'http://api.test/api/v1';
const ORDERS_URL = `${BASE_URL}/portfolio-orders`;
const BROWSER_ADDRESS = '203.0.113.7';
// What a browser could claim on its own, before the trusted proxy appends the real address.
const SPOOFED_ADDRESS = '198.51.100.1';

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': ContentType.JSON, ...headers },
  });
}

/** The single request sent to the API. */
function sentRequest(): { url: string; init: RequestInit; headers: Record<string, string> } {
  expect(fetchMock).toHaveBeenCalledOnce();
  const [url, init = {}] = fetchMock.mock.calls[0] ?? [];
  return { url: String(url), init, headers: Object.fromEntries(new Headers(init.headers)) };
}

/** The value a promise rejects with, for assertions on its type and fields. */
async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => expect.unreachable('expected the request to fail'),
    (error: unknown) => error,
  );
}

const createRequest: CreatePortfolioOrderRequest = {
  orderType: OrderType.BUY,
  totalAmount: '100',
  portfolio: {
    allocations: [
      { symbol: 'AAPL', percent: '60' },
      { symbol: 'TSLA', percent: '40' },
    ],
  },
};

beforeEach(() => {
  // A trailing slash in the configured base URL must not produce "//" in request paths.
  vi.stubEnv('API_BASE_URL', `${BASE_URL}/`);
  // As if the console sits behind one reverse proxy that appends the browser's address.
  vi.stubEnv('TRUSTED_PROXY_COUNT', '1');
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(headers).mockResolvedValue(
    new Headers({ 'X-Forwarded-For': `${SPOOFED_ADDRESS}, ${BROWSER_ADDRESS}` }),
  );
});

describe('portfolioOrdersApi.create', () => {
  it('posts the order with its request key and returns the created order', async () => {
    const order = portfolioOrder();
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { data: order }));

    await expect(portfolioOrdersApi.create(createRequest, 'key-1')).resolves.toEqual({
      order,
      replayed: false,
    });

    const sent = sentRequest();
    expect(sent.url).toBe(ORDERS_URL);
    expect(sent.init).toMatchObject({
      method: 'POST',
      cache: 'no-store',
      body: JSON.stringify(createRequest),
    });
    expect(sent.init.signal).toBeInstanceOf(AbortSignal);
    expect(sent.headers).toEqual({
      accept: ContentType.JSON,
      'content-type': ContentType.JSON,
      'request-key': 'key-1',
      'x-forwarded-for': BROWSER_ADDRESS,
    });
  });

  it('reports when the API returned an order it had already placed with this key', async () => {
    const order = portfolioOrder();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, { data: order }, { 'Request-Replayed': 'true' }),
    );

    await expect(portfolioOrdersApi.create(createRequest, 'key-1')).resolves.toEqual({
      order,
      replayed: true,
    });
  });

  it('sends no X-Forwarded-For header when the browser request has none', async () => {
    vi.mocked(headers).mockResolvedValue(new Headers());
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { data: portfolioOrder() }));

    await portfolioOrdersApi.create(createRequest, 'key-1');

    expect(sentRequest().headers).not.toHaveProperty('x-forwarded-for');
  });

  it('forwards no address when no trusted proxy is configured, as the browser may have set it', async () => {
    vi.stubEnv('TRUSTED_PROXY_COUNT', undefined);
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { data: portfolioOrder() }));

    await portfolioOrdersApi.create(createRequest, 'key-1');

    expect(sentRequest().headers).not.toHaveProperty('x-forwarded-for');
  });

  it('rejects with ResponseContractError when the created order does not match the contract', async () => {
    // e.g. an older API that does not send marketTimezone yet
    const incomplete = { ...portfolioOrder(), marketTimezone: undefined };
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { data: incomplete }));

    const error = await rejectionOf(portfolioOrdersApi.create(createRequest, 'key-1'));

    expect(error).toBeInstanceOf(ResponseContractError);
    expect(error).toMatchObject({ status: 201, cause: expect.any(z.ZodError) });
  });
});

describe('portfolioOrdersApi.list', () => {
  it('requests one page of history with the order-type filter', async () => {
    const history = orderList([portfolioOrder({ orderType: OrderType.SELL })]);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, history));

    await expect(
      portfolioOrdersApi.list({ page: 2, pageSize: 20, orderType: OrderType.SELL }),
    ).resolves.toEqual(history);

    const sent = sentRequest();
    expect(sent.url).toBe(`${ORDERS_URL}?page=2&pageSize=20&orderType=SELL`);
    expect(sent.init.method).toBeUndefined();
    expect(sent.headers).toEqual({
      accept: ContentType.JSON,
      'x-forwarded-for': BROWSER_ADDRESS,
    });
  });

  it('leaves the filter out when every order type is wanted', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, orderList([])));

    await portfolioOrdersApi.list({ page: 1, pageSize: 20 });

    expect(sentRequest().url).toBe(`${ORDERS_URL}?page=1&pageSize=20`);
  });

  it('calls the local API when API_BASE_URL is not set', async () => {
    vi.stubEnv('API_BASE_URL', undefined);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, orderList([])));

    await portfolioOrdersApi.list({ page: 1, pageSize: 20 });

    expect(sentRequest().url).toBe(`${DEFAULT_API_BASE_URL}/portfolio-orders?page=1&pageSize=20`);
  });
});

describe('portfolioOrdersApi.get', () => {
  it('fetches an order by its URL-encoded id', async () => {
    const order = portfolioOrder();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: order }));

    await expect(portfolioOrdersApi.get('a/b c')).resolves.toEqual(order);

    expect(sentRequest().url).toBe(`${ORDERS_URL}/a%2Fb%20c`);
  });

  it.each([
    ['an unknown id', 404, ErrorCode.PORTFOLIO_ORDER_NOT_FOUND],
    ['a malformed id', 400, ErrorCode.VALIDATION_FAILED],
  ])('resolves to null for %s (%i)', async (_case, status, code) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(status, errorResponse({ status, code })));

    await expect(portfolioOrdersApi.get('some-id')).resolves.toBeNull();
  });

  it('rethrows any other API error', async () => {
    const problem = errorResponse({ status: 500, code: ErrorCode.INTERNAL_ERROR });
    fetchMock.mockResolvedValueOnce(jsonResponse(500, problem));

    const error = await rejectionOf(portfolioOrdersApi.get('some-id'));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 500, problem });
  });
});

describe('API errors', () => {
  it('carry the problem details of a non-2xx response', async () => {
    const problem = errorResponse({
      errors: [{ path: 'portfolio.allocations.0', message: 'AAPL quantity rounds down to zero' }],
    });
    fetchMock.mockResolvedValueOnce(jsonResponse(422, problem));

    const error = await rejectionOf(portfolioOrdersApi.create(createRequest, 'key-1'));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 422, problem, message: problem.detail });
  });

  it.each([
    ['a JSON body that is not problem details', JSON.stringify({ error: 'Bad gateway' })],
    ['a body that is not JSON', '<html>Bad gateway</html>'],
  ])('fall back to a generic message for %s', async (_case, body) => {
    fetchMock.mockResolvedValueOnce(new Response(body, { status: 502 }));

    const error = await rejectionOf(portfolioOrdersApi.create(createRequest, 'key-1'));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 502,
      problem: null,
      message: 'API request failed with status 502',
    });
  });

  it('let network failures through unchanged', async () => {
    const failure = new TypeError('fetch failed');
    fetchMock.mockRejectedValueOnce(failure);

    await expect(portfolioOrdersApi.create(createRequest, 'key-1')).rejects.toBe(failure);
  });
});
