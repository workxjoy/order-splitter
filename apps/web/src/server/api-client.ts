import 'server-only';
import {
  ApiHeader,
  ApiResource,
  ContentType,
  portfolioOrderListResponseSchema,
  portfolioOrderResponseSchema,
  errorResponseSchema,
  type CreatePortfolioOrderRequest,
  type ListPortfolioOrdersQuery,
  type PortfolioOrderDto,
  type PortfolioOrderListResponse,
  type ErrorResponse,
} from '@order-splitter/shared';
import { headers } from 'next/headers';
import type { z } from 'zod';
import { clientAddress, trustedProxyCount } from '@/lib/client-address';
import { API_TIMEOUT_MS, DEFAULT_API_BASE_URL } from '@/lib/constants';

const HTTP_NOT_FOUND = 404;
const HTTP_BAD_REQUEST = 400;
const FORWARDED_FOR_HEADER = 'X-Forwarded-For';
const REQUEST_REPLAYED_VALUE = 'true';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: ErrorResponse | null,
  ) {
    super(problem?.detail ?? `API request failed with status ${status}`);
    this.name = ApiError.name;
  }
}

// A 2xx response that does not match the schema. For a POST, the order was still created.
export class ResponseContractError extends Error {
  constructor(
    readonly status: number,
    cause: z.ZodError,
  ) {
    super(`API response with status ${status} does not match the contract`, { cause });
    this.name = ResponseContractError.name;
  }
}

function apiBaseUrl(): string {
  return (process.env.API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/+$/, '');
}

// The API rate-limits by client address, and every request reaches it from this server. The
// browser's address is passed on only when trusted proxies recorded it (TRUSTED_PROXY_COUNT);
// otherwise all console users share this server's limit. The API in turn only accepts the header
// from addresses listed in its own TRUST_PROXY.
async function clientAddressHeaders(): Promise<Record<string, string>> {
  const forwardedFor = (await headers()).get(FORWARDED_FOR_HEADER);
  const address = clientAddress(forwardedFor, trustedProxyCount());
  return address === null ? {} : { [FORWARDED_FOR_HEADER]: address };
}

async function requestJson<TSchema extends z.ZodType>(
  path: string,
  schema: TSchema,
  init: RequestInit = {},
): Promise<{ body: z.output<TSchema>; headers: Headers }> {
  const response = await fetch(`${apiBaseUrl()}/${path}`, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
    headers: { Accept: ContentType.JSON, ...(await clientAddressHeaders()), ...init.headers },
  });
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const problem = errorResponseSchema.safeParse(body);
    throw new ApiError(response.status, problem.success ? problem.data : null);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ResponseContractError(response.status, parsed.error);
  return { body: parsed.data, headers: response.headers };
}

export interface CreatedOrder {
  readonly order: PortfolioOrderDto;
  /** True when the API returned an order it had already placed with the same request key. */
  readonly replayed: boolean;
}

export const portfolioOrdersApi = {
  async create(request: CreatePortfolioOrderRequest, requestKey: string): Promise<CreatedOrder> {
    const { body, headers } = await requestJson(
      ApiResource.PORTFOLIO_ORDERS,
      portfolioOrderResponseSchema,
      {
        method: 'POST',
        headers: { 'Content-Type': ContentType.JSON, [ApiHeader.REQUEST_KEY]: requestKey },
        body: JSON.stringify(request),
      },
    );
    return {
      order: body.data,
      replayed: headers.get(ApiHeader.REQUEST_REPLAYED) === REQUEST_REPLAYED_VALUE,
    };
  },

  async list(query: ListPortfolioOrdersQuery): Promise<PortfolioOrderListResponse> {
    const params = new URLSearchParams({
      page: String(query.page),
      pageSize: String(query.pageSize),
    });
    if (query.orderType) params.set('orderType', query.orderType);
    const { body } = await requestJson(
      `${ApiResource.PORTFOLIO_ORDERS}?${params.toString()}`,
      portfolioOrderListResponseSchema,
    );
    return body;
  },

  // null when the order does not exist or the id is not a UUID.
  async get(id: string): Promise<PortfolioOrderDto | null> {
    try {
      const { body } = await requestJson(
        `${ApiResource.PORTFOLIO_ORDERS}/${encodeURIComponent(id)}`,
        portfolioOrderResponseSchema,
      );
      return body.data;
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.status === HTTP_NOT_FOUND || error.status === HTTP_BAD_REQUEST)
      ) {
        return null;
      }
      throw error;
    }
  },
};
