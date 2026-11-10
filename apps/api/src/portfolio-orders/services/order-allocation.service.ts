import { Inject, Injectable } from '@nestjs/common';
import { PriceSource, type FieldError } from '@order-splitter/shared';
import {
  CENTS_DECIMALS,
  formatAmount,
  formatPrice,
  Money,
  sumOf,
} from '../../common/utils/money.js';
import { tradingConfig, type TradingConfig } from '../../config/trading.config.js';
import type { StockOrder } from '../entities/portfolio-order.entity.js';
import {
  AmountBelowMinimumException,
  QuantityBelowMinimumException,
} from '../portfolio-orders.exceptions.js';
import {
  ALLOCATIONS_FIELD_PATH,
  CENTS_PER_DOLLAR,
  PORTFOLIO_TOTAL_PERCENT,
  QUANTITY_DECIMAL_BASE,
} from '../portfolio-orders.constants.js';

export interface AllocationInput {
  readonly symbol: string;
  readonly percent: Money;
  readonly marketPrice?: Money;
}

// Already validated: at least one allocation, and the weights add up to 100.
export interface AllocationRequest {
  readonly totalAmount: Money;
  readonly allocations: readonly AllocationInput[];
}

export interface AllocationResult {
  readonly orders: readonly StockOrder[];
  readonly estimatedTotalAmount: Money;
  readonly unallocatedAmount: Money;
  readonly quantityPrecision: number;
}

// Splits the total into whole cents by weight, prices each stock (partner price if given, else the
// fixed price) and rounds quantities down so no order spends or raises more than its share. The
// request is rejected if any stock is below the minimum amount, before or after rounding, or if it
// rounds to zero shares.
@Injectable()
export class OrderAllocationService {
  constructor(@Inject(tradingConfig.KEY) private readonly config: TradingConfig) {}

  allocate(request: AllocationRequest): AllocationResult {
    const precision = this.config.quantityDecimalPlaces;
    const orders = this.splitIntoCents(request.totalAmount, request.allocations).map(
      ({ allocation, amount }) => this.buildStockOrder(allocation, amount, precision),
    );
    this.assertTradable(orders, precision);

    const estimatedTotalAmount = sumOf(orders.map((order) => order.estimatedAmount));
    return {
      orders,
      estimatedTotalAmount,
      unallocatedAmount: request.totalAmount.minus(estimatedTotalAmount),
      quantityPrecision: precision,
    };
  }

  // Largest remainder method: floor each share, then give the leftover cents to the largest remainders.
  private splitIntoCents(
    total: Money,
    allocations: readonly AllocationInput[],
  ): { allocation: AllocationInput; amount: Money }[] {
    const totalCents = total.times(CENTS_PER_DOLLAR);
    const shares = allocations.map((allocation, index) => {
      const exactCents = totalCents.times(allocation.percent).div(PORTFOLIO_TOTAL_PERCENT);
      const cents = exactCents.floor();
      return { allocation, index, cents, remainder: exactCents.minus(cents) };
    });
    const leftoverCents = totalCents.minus(sumOf(shares.map((share) => share.cents))).toNumber();
    const receivesExtraCent = new Set(
      [...shares]
        .sort((a, b) => b.remainder.comparedTo(a.remainder) || a.index - b.index)
        .slice(0, leftoverCents)
        .map((share) => share.index),
    );

    return shares.map(({ allocation, index, cents }) => ({
      allocation,
      amount: (receivesExtraCent.has(index) ? cents.plus(1) : cents).div(CENTS_PER_DOLLAR),
    }));
  }

  private buildStockOrder(
    allocation: AllocationInput,
    amount: Money,
    precision: number,
  ): StockOrder {
    const price = allocation.marketPrice ?? this.config.defaultStockPrice;
    const quantity = amount.div(price).toDecimalPlaces(precision, Money.ROUND_DOWN);
    return {
      symbol: allocation.symbol,
      percent: allocation.percent,
      price,
      priceSource: allocation.marketPrice === undefined ? PriceSource.FIXED : PriceSource.PARTNER,
      amount,
      quantity,
      estimatedAmount: quantity.times(price).toDecimalPlaces(CENTS_DECIMALS, Money.ROUND_HALF_UP),
    };
  }

  private assertTradable(orders: readonly StockOrder[], precision: number): void {
    const { minOrderAmount } = this.config;
    const minimum = `the minimum order amount of $${formatAmount(minOrderAmount)}`;
    // Rounding the quantity down can leave the shares actually traded below the minimum, e.g. $1.00
    // of a $750 stock is 0.001 shares worth $0.75. Their exact value is used: estimatedAmount is
    // rounded to cents, so $0.995 would show as $1.00. A zero quantity is reported separately below.
    const belowMinimumAmount = violations(orders, (order) => {
      if (order.amount.lt(minOrderAmount)) {
        return `$${formatAmount(order.amount)} allocated to ${order.symbol} is below ${minimum}`;
      }
      const tradedValue = order.quantity.times(order.price);
      if (!order.quantity.isZero() && tradedValue.lt(minOrderAmount)) {
        return (
          `$${formatAmount(order.amount)} allocated to ${order.symbol} comes to ` +
          `${order.quantity.toFixed(precision)} shares worth $${formatPrice(tradedValue)}, ` +
          `below ${minimum}`
        );
      }
      return null;
    });
    if (belowMinimumAmount.length > 0) throw new AmountBelowMinimumException(belowMinimumAmount);

    const minimumQuantity = new Money(1).div(new Money(QUANTITY_DECIMAL_BASE).pow(precision));
    const belowMinimumQuantity = violations(orders, (order) =>
      order.quantity.isZero()
        ? `$${formatAmount(order.amount)} allocated to ${order.symbol} buys less than the minimum ` +
          `quantity of ${minimumQuantity.toFixed()} at $${formatPrice(order.price)} per share`
        : null,
    );
    if (belowMinimumQuantity.length > 0)
      throw new QuantityBelowMinimumException(belowMinimumQuantity);
  }
}

function violations(
  orders: readonly StockOrder[],
  describe: (order: StockOrder) => string | null,
): FieldError[] {
  return orders.flatMap((order, index) => {
    const message = describe(order);
    return message === null ? [] : [{ path: `${ALLOCATIONS_FIELD_PATH}.${index}`, message }];
  });
}
