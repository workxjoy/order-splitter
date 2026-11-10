import type { OrderType, PriceSource } from '@order-splitter/shared';
import type { Money } from '../../common/utils/money.js';

export interface StockOrder {
  readonly symbol: string;
  readonly percent: Money;
  readonly price: Money;
  readonly priceSource: PriceSource;
  /** Whole cents. */
  readonly amount: Money;
  /** Rounded down to the configured precision. */
  readonly quantity: Money;
  /** quantity × price, never more than `amount`. */
  readonly estimatedAmount: Money;
}

export interface RequestKeyRecord {
  readonly key: string;
  readonly requestHash: string;
}

export interface PortfolioOrder {
  readonly id: string;
  readonly orderType: OrderType;
  readonly portfolioName: string | null;
  readonly totalAmount: Money;
  readonly estimatedTotalAmount: Money;
  readonly unallocatedAmount: Money;
  readonly quantityPrecision: number;
  readonly executeAt: Date;
  /** e.g. America/New_York */
  readonly marketTimezone: string;
  readonly createdAt: Date;
  readonly orders: readonly StockOrder[];
  readonly keyRecord: RequestKeyRecord | null;
}
