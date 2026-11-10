import type {
  CreatePortfolioOrderRequest,
  ListPortfolioOrdersQuery,
  PaginationMeta,
  PortfolioOrderDto,
  StockOrderDto,
} from '@order-splitter/shared';
import { formatAmount, formatPrice, Money } from '../common/utils/money.js';
import type { PortfolioOrder, StockOrder } from './entities/portfolio-order.entity.js';
import type { AllocationRequest } from './services/order-allocation.service.js';
import type { Page } from './repositories/portfolio-orders.repository.js';

export function toAllocationRequest(request: CreatePortfolioOrderRequest): AllocationRequest {
  return {
    totalAmount: new Money(request.totalAmount),
    allocations: request.portfolio.allocations.map((allocation) => ({
      symbol: allocation.symbol,
      percent: new Money(allocation.percent),
      ...(allocation.marketPrice !== undefined && {
        marketPrice: new Money(allocation.marketPrice),
      }),
    })),
  };
}

export function toPortfolioOrderDto(order: PortfolioOrder): PortfolioOrderDto {
  return {
    id: order.id,
    orderType: order.orderType,
    portfolioName: order.portfolioName,
    totalAmount: formatAmount(order.totalAmount),
    estimatedTotalAmount: formatAmount(order.estimatedTotalAmount),
    unallocatedAmount: formatAmount(order.unallocatedAmount),
    quantityPrecision: order.quantityPrecision,
    executeAt: order.executeAt.toISOString(),
    marketTimezone: order.marketTimezone,
    createdAt: order.createdAt.toISOString(),
    orders: order.orders.map((stockOrder) => toStockOrderDto(stockOrder, order.quantityPrecision)),
  };
}

function toStockOrderDto(order: StockOrder, quantityPrecision: number): StockOrderDto {
  return {
    symbol: order.symbol,
    percent: order.percent.toFixed(),
    price: formatPrice(order.price),
    priceSource: order.priceSource,
    amount: formatAmount(order.amount),
    quantity: order.quantity.toFixed(quantityPrecision),
    estimatedAmount: formatAmount(order.estimatedAmount),
  };
}

export function toPaginationMeta(
  page: Page<unknown>,
  query: ListPortfolioOrdersQuery,
): PaginationMeta {
  return {
    page: query.page,
    pageSize: query.pageSize,
    totalItems: page.totalItems,
    totalPages: Math.ceil(page.totalItems / query.pageSize),
  };
}
