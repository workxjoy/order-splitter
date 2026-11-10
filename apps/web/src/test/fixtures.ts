import {
  ErrorCode,
  OrderType,
  PaginationLimits,
  portfolioOrderListResponseSchema,
  portfolioOrderSchema,
  PriceSource,
  errorResponseSchema,
  type PaginationMeta,
  type PortfolioOrderDto,
  type PortfolioOrderListResponse,
  type ErrorResponse,
} from '@order-splitter/shared';

// Parsed with the shared schemas so they always match what the API returns.

export const ORDER_ID = '3f2b8c1e-7d4a-4b6e-9a1f-2c3d4e5f6a7b';

// One stock at a partner price, one at the fixed price.
export function portfolioOrder(overrides: Partial<PortfolioOrderDto> = {}): PortfolioOrderDto {
  return portfolioOrderSchema.parse({
    id: ORDER_ID,
    orderType: OrderType.BUY,
    portfolioName: 'Balanced Growth',
    totalAmount: '100.00',
    estimatedTotalAmount: '99.95',
    unallocatedAmount: '0.05',
    quantityPrecision: 3,
    executeAt: '2026-11-16T14:30:00.000Z',
    marketTimezone: 'America/New_York',
    createdAt: '2026-11-14T17:00:00.000Z',
    orders: [
      {
        symbol: 'AAPL',
        percent: '60',
        price: '187.35',
        priceSource: PriceSource.PARTNER,
        amount: '60.00',
        quantity: '0.320',
        estimatedAmount: '59.95',
      },
      {
        symbol: 'TSLA',
        percent: '40',
        price: '100.00',
        priceSource: PriceSource.FIXED,
        amount: '40.00',
        quantity: '0.400',
        estimatedAmount: '40.00',
      },
    ],
    ...overrides,
  });
}

export function orderList(
  orders: PortfolioOrderDto[],
  meta: Partial<PaginationMeta> = {},
): PortfolioOrderListResponse {
  return portfolioOrderListResponseSchema.parse({
    data: orders,
    meta: {
      page: PaginationLimits.DEFAULT_PAGE,
      pageSize: PaginationLimits.DEFAULT_PAGE_SIZE,
      totalItems: orders.length,
      totalPages: orders.length > 0 ? 1 : 0,
      ...meta,
    },
  });
}

export function errorResponse(overrides: Partial<ErrorResponse> = {}): ErrorResponse {
  return errorResponseSchema.parse({
    type: 'about:blank',
    title: 'Unprocessable Content',
    status: 422,
    detail: 'Some allocations are too small to trade',
    instance: '/api/v1/portfolio-orders',
    code: ErrorCode.QUANTITY_BELOW_MINIMUM,
    ...overrides,
  });
}
