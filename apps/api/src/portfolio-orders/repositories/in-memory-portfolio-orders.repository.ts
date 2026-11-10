import type { OrderType } from '@order-splitter/shared';
import type { PortfolioOrder } from '../entities/portfolio-order.entity.js';
import { MAX_STORED_ORDERS, MAX_STORED_STOCK_ORDERS } from '../portfolio-orders.constants.js';
import {
  DuplicateRequestKeyException,
  PortfolioOrderRepository,
  type Page,
  type PageRequest,
  type PortfolioOrderFilter,
} from './portfolio-orders.repository.js';

interface HistoryCapacity {
  readonly maxOrders: number;
  /** Total stock lines across all stored orders. */
  readonly maxStockOrders: number;
}

const DEFAULT_CAPACITY: HistoryCapacity = {
  maxOrders: MAX_STORED_ORDERS,
  maxStockOrders: MAX_STORED_STOCK_ORDERS,
};

// Data is lost on restart by design. The oldest orders are dropped once either limit is passed;
// the newest order is always kept.
export class InMemoryPortfolioOrderRepository extends PortfolioOrderRepository {
  private readonly ordersById = new Map<string, PortfolioOrder>();
  private readonly orderIdsByRequestKey = new Map<string, string>();
  // Oldest first, overall and per order type, so a page is a single slice.
  private readonly history: PortfolioOrder[] = [];
  private readonly historyByType = new Map<OrderType, PortfolioOrder[]>();
  private storedStockOrders = 0;

  constructor(private readonly capacity: HistoryCapacity = DEFAULT_CAPACITY) {
    super();
  }

  override insert(order: PortfolioOrder): Promise<void> {
    const key = order.keyRecord?.key;
    if (key !== undefined && this.orderIdsByRequestKey.has(key)) {
      return Promise.reject(new DuplicateRequestKeyException());
    }
    this.ordersById.set(order.id, order);
    if (key !== undefined) this.orderIdsByRequestKey.set(key, order.id);
    this.history.push(order);
    this.historyOf(order.orderType).push(order);
    this.storedStockOrders += order.orders.length;
    while (this.history.length > 1 && this.isOverCapacity()) this.evictOldest();
    return Promise.resolve();
  }

  override findById(id: string): Promise<PortfolioOrder | undefined> {
    return Promise.resolve(this.ordersById.get(id));
  }

  override findByRequestKey(key: string): Promise<PortfolioOrder | undefined> {
    const id = this.orderIdsByRequestKey.get(key);
    return Promise.resolve(id === undefined ? undefined : this.ordersById.get(id));
  }

  // Newest first: the offset counts back from the end.
  override list(filter: PortfolioOrderFilter, page: PageRequest): Promise<Page<PortfolioOrder>> {
    const orders = filter.orderType === undefined ? this.history : this.historyOf(filter.orderType);
    const end = Math.max(orders.length - page.offset, 0);
    const start = Math.max(end - page.limit, 0);
    return Promise.resolve({
      items: orders.slice(start, end).reverse(),
      totalItems: orders.length,
    });
  }

  private historyOf(orderType: OrderType): PortfolioOrder[] {
    let orders = this.historyByType.get(orderType);
    if (!orders) {
      orders = [];
      this.historyByType.set(orderType, orders);
    }
    return orders;
  }

  private isOverCapacity(): boolean {
    return (
      this.history.length > this.capacity.maxOrders ||
      this.storedStockOrders > this.capacity.maxStockOrders
    );
  }

  // The oldest order overall is also the oldest of its type, so both lists drop their first item.
  private evictOldest(): void {
    const oldest = this.history.shift();
    if (!oldest) return;
    this.storedStockOrders -= oldest.orders.length;
    this.historyOf(oldest.orderType).shift();
    this.ordersById.delete(oldest.id);
    const key = oldest.keyRecord?.key;
    if (key !== undefined) this.orderIdsByRequestKey.delete(key);
  }
}
