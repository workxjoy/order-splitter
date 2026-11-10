import { Module } from '@nestjs/common';
import { Clock, SystemClock } from '../common/services/clock.service.js';
import { MarketCalendarService } from './services/market-calendar.service.js';
import { OrderAllocationService } from './services/order-allocation.service.js';
import { PortfolioOrdersController } from './portfolio-orders.controller.js';
import { PortfolioOrdersService } from './portfolio-orders.service.js';
import { InMemoryPortfolioOrderRepository } from './repositories/in-memory-portfolio-orders.repository.js';
import { PortfolioOrderRepository } from './repositories/portfolio-orders.repository.js';

@Module({
  controllers: [PortfolioOrdersController],
  providers: [
    PortfolioOrdersService,
    OrderAllocationService,
    MarketCalendarService,
    { provide: PortfolioOrderRepository, useFactory: () => new InMemoryPortfolioOrderRepository() },
    { provide: Clock, useClass: SystemClock },
  ],
})
export class PortfolioOrdersModule {}
