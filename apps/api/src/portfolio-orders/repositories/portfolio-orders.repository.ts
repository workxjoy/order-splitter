import type { OrderType } from '@order-splitter/shared';
import type { PortfolioOrder } from '../entities/portfolio-order.entity.js';

export interface PortfolioOrderFilter {
  readonly orderType?: OrderType;
}

export interface PageRequest {
  readonly offset: number;
  readonly limit: number;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly totalItems: number;
}

// Thrown by insert() when the key is already used, like a unique index in a database.
export class DuplicateRequestKeyException extends Error {
  constructor() {
    super('Request key already exists');
    this.name = DuplicateRequestKeyException.name;
  }
}

// Abstract class so it can be used as the injection token. list() returns newest first.
export abstract class PortfolioOrderRepository {
  abstract insert(order: PortfolioOrder): Promise<void>;
  abstract findById(id: string): Promise<PortfolioOrder | undefined>;
  abstract findByRequestKey(key: string): Promise<PortfolioOrder | undefined>;
  abstract list(filter: PortfolioOrderFilter, page: PageRequest): Promise<Page<PortfolioOrder>>;
}
