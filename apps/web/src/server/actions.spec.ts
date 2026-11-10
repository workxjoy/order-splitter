import { ApiHeader, ErrorCode, OrderType } from '@order-splitter/shared';
import { revalidatePath } from 'next/cache';
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { z } from 'zod';
import { AppRoute, ErrorMessage } from '@/lib/constants';
import { ApiError, portfolioOrdersApi, ResponseContractError } from './api-client';
import { portfolioOrder, errorResponse } from '@/test/fixtures';
import { createPortfolioOrderAction } from './actions';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const KEY = 'c0ffee00-0000-4000-8000-000000000001';

/** As posted by the form: numbers or strings, symbols in any case. */
const formInput = {
  orderType: OrderType.BUY,
  totalAmount: 100,
  portfolio: {
    allocations: [
      { symbol: 'aapl', percent: 60 },
      { symbol: 'TSLA', percent: '40' },
    ],
  },
};

describe('createPortfolioOrderAction', () => {
  let create: MockInstance<typeof portfolioOrdersApi.create>;
  let logError: MockInstance<typeof console.error>;

  beforeEach(() => {
    create = vi.spyOn(portfolioOrdersApi, 'create');
    logError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('sends the normalised order to the API and refreshes the history page', async () => {
    const created = { order: portfolioOrder(), replayed: false };
    create.mockResolvedValue(created);

    await expect(createPortfolioOrderAction(formInput, KEY)).resolves.toEqual({
      ok: true,
      data: created,
    });

    expect(create).toHaveBeenCalledWith(
      {
        orderType: OrderType.BUY,
        totalAmount: '100',
        portfolio: {
          allocations: [
            { symbol: 'AAPL', percent: '60' },
            { symbol: 'TSLA', percent: '40' },
          ],
        },
      },
      KEY,
    );
    expect(revalidatePath).toHaveBeenCalledWith(AppRoute.HISTORY);
  });

  it('re-validates the input with the shared schema and never calls the API with bad input', async () => {
    const result = await createPortfolioOrderAction(
      { orderType: 'HOLD', totalAmount: '-1', portfolio: { allocations: [] } },
      KEY,
    );

    expect(result).toEqual({
      ok: false,
      message: ErrorMessage.INVALID_FORM,
      errors: [
        { path: 'orderType', message: expect.any(String) },
        { path: 'totalAmount', message: expect.any(String) },
        { path: 'portfolio.allocations', message: expect.any(String) },
      ],
    });
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', undefined],
    ['blank', '   '],
    ['too long', 'k'.repeat(256)],
    ['not visible ASCII', 'clé'],
  ])('rejects a request key that is %s', async (_case, key) => {
    const result = await createPortfolioOrderAction(formInput, key);

    expect(result).toEqual({
      ok: false,
      message: ErrorMessage.INVALID_FORM,
      errors: [{ path: ApiHeader.REQUEST_KEY, message: expect.any(String) }],
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('passes on the problem detail and field errors reported by the API', async () => {
    const errors = [{ path: 'portfolio.allocations.0', message: 'AAPL quantity rounds to zero' }];
    const problem = errorResponse({ errors });
    create.mockRejectedValue(new ApiError(422, problem));

    await expect(createPortfolioOrderAction(formInput, KEY)).resolves.toEqual({
      ok: false,
      message: problem.detail,
      errors,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });

  it('passes on a problem detail that has no field errors', async () => {
    const problem = errorResponse({
      status: 429,
      title: 'Too Many Requests',
      detail: 'Too many requests, please retry later',
      code: ErrorCode.RATE_LIMITED,
    });
    create.mockRejectedValue(new ApiError(429, problem));

    await expect(createPortfolioOrderAction(formInput, KEY)).resolves.toEqual({
      ok: false,
      message: problem.detail,
      errors: [],
    });
  });

  it('reports an unexpected response when an API error has no problem details', async () => {
    create.mockRejectedValue(new ApiError(502, null));

    await expect(createPortfolioOrderAction(formInput, KEY)).resolves.toEqual({
      ok: false,
      message: ErrorMessage.UNEXPECTED_RESPONSE,
      errors: [],
    });
    expect(logError).toHaveBeenCalled();
  });

  it('says the order was submitted when the created order cannot be read, and refreshes history', async () => {
    create.mockRejectedValue(new ResponseContractError(201, new z.ZodError([])));

    await expect(createPortfolioOrderAction(formInput, KEY)).resolves.toEqual({
      ok: false,
      message: ErrorMessage.ORDER_STATUS_UNKNOWN,
      errors: [],
    });
    expect(revalidatePath).toHaveBeenCalledWith(AppRoute.HISTORY);
    expect(logError).toHaveBeenCalled();
  });

  it.each([
    ['unreachable', new TypeError('fetch failed')],
    ['too slow', new DOMException('The operation timed out', 'TimeoutError')],
  ])(
    'says the order is unconfirmed, and safe to resend, when the API is %s',
    async (_case, failure) => {
      create.mockRejectedValue(failure);

      await expect(createPortfolioOrderAction(formInput, KEY)).resolves.toEqual({
        ok: false,
        message: ErrorMessage.SUBMIT_UNCONFIRMED,
        errors: [],
      });
      expect(revalidatePath).not.toHaveBeenCalled();
      expect(logError).toHaveBeenCalledWith('createPortfolioOrderAction failed', failure);
    },
  );
});
