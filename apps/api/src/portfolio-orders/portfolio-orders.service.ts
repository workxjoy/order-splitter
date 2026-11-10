import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { CreatePortfolioOrderRequest, ListPortfolioOrdersQuery } from '@order-splitter/shared';
import { Clock } from '../common/services/clock.service.js';
import { hashRequest } from '../common/utils/hash-request.js';
import type { RequestKeyRecord, PortfolioOrder } from './entities/portfolio-order.entity.js';
import { MarketCalendarService } from './services/market-calendar.service.js';
import { OrderAllocationService } from './services/order-allocation.service.js';
import { toAllocationRequest } from './portfolio-order.mapper.js';
import {
  RequestKeyReusedException,
  PortfolioOrderNotFoundException,
} from './portfolio-orders.exceptions.js';
import {
  DuplicateRequestKeyException,
  PortfolioOrderRepository,
  type Page,
} from './repositories/portfolio-orders.repository.js';

interface CreatePortfolioOrderResult {
  readonly order: PortfolioOrder;
  /** True when this is a retry of an earlier request with the same Request-Key. */
  readonly replayed: boolean;
}

@Injectable()
export class PortfolioOrdersService {
  constructor(
    private readonly repository: PortfolioOrderRepository,
    private readonly orderAllocation: OrderAllocationService,
    private readonly marketCalendar: MarketCalendarService,
    private readonly clock: Clock,
  ) {}

  async create(
    request: CreatePortfolioOrderRequest,
    requestKey?: string,
  ): Promise<CreatePortfolioOrderResult> {
    const keyRecord: RequestKeyRecord | null =
      requestKey === undefined ? null : { key: requestKey, requestHash: hashRequest(request) };

    if (keyRecord) {
      const previous = await this.repository.findByRequestKey(keyRecord.key);
      if (previous) return this.replay(previous, keyRecord);
    }

    const order = this.split(request, keyRecord);
    try {
      await this.repository.insert(order);
    } catch (error) {
      // A concurrent request with the same key got there first; return its order.
      if (keyRecord && error instanceof DuplicateRequestKeyException) {
        const winner = await this.repository.findByRequestKey(keyRecord.key);
        if (winner) return this.replay(winner, keyRecord);
      }
      throw error;
    }
    return { order, replayed: false };
  }

  async getById(id: string): Promise<PortfolioOrder> {
    const order = await this.repository.findById(id);
    if (!order) throw new PortfolioOrderNotFoundException(id);
    return order;
  }

  list(query: ListPortfolioOrdersQuery): Promise<Page<PortfolioOrder>> {
    return this.repository.list(
      { ...(query.orderType !== undefined && { orderType: query.orderType }) },
      { offset: (query.page - 1) * query.pageSize, limit: query.pageSize },
    );
  }

  private split(
    request: CreatePortfolioOrderRequest,
    keyRecord: RequestKeyRecord | null,
  ): PortfolioOrder {
    const createdAt = this.clock.now();
    const allocationRequest = toAllocationRequest(request);
    const allocation = this.orderAllocation.allocate(allocationRequest);
    return {
      id: randomUUID(),
      orderType: request.orderType,
      portfolioName: request.portfolio.name ?? null,
      totalAmount: allocationRequest.totalAmount,
      estimatedTotalAmount: allocation.estimatedTotalAmount,
      unallocatedAmount: allocation.unallocatedAmount,
      quantityPrecision: allocation.quantityPrecision,
      executeAt: this.marketCalendar.nextExecutionTime(createdAt),
      marketTimezone: this.marketCalendar.marketTimezone,
      createdAt,
      orders: allocation.orders,
      keyRecord,
    };
  }

  private replay(
    previous: PortfolioOrder,
    keyRecord: RequestKeyRecord,
  ): CreatePortfolioOrderResult {
    if (previous.keyRecord?.requestHash !== keyRecord.requestHash) {
      throw new RequestKeyReusedException();
    }
    return { order: previous, replayed: true };
  }
}
