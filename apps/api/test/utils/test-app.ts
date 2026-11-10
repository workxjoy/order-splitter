import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { APP_OPTIONS, setupApp } from '../../src/app.setup.js';
import { Clock } from '../../src/common/services/clock.service.js';
import { httpConfig, type HttpConfig } from '../../src/config/http.config.js';
import { tradingConfig, type TradingConfig } from '../../src/config/trading.config.js';
import { tradingConfigFixture } from '../fixtures/config.fixtures.js';
import { FixedClock } from '../fixtures/fixed-clock.js';

/** Wednesday 11 Nov 2026, 12:00 New York time: the market is open. */
export const MARKET_OPEN_INSTANT = new Date('2026-11-11T17:00:00.000Z');

interface TestAppOptions {
  now?: Date;
  trading?: Partial<TradingConfig>;
  http?: Partial<HttpConfig>;
}

export interface TestApp {
  app: NestExpressApplication;
  clock: FixedClock;
  http: () => ReturnType<typeof request>;
}

/** Boots the real AppModule with the production HTTP setup; only time and selected config are pinned. */
export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const clock = new FixedClock(options.now ?? MARKET_OPEN_INSTANT);
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Clock)
    .useValue(clock);

  if (options.trading) {
    builder = builder
      .overrideProvider(tradingConfig.KEY)
      .useValue(tradingConfigFixture(options.trading));
  }
  if (options.http) {
    builder = builder
      .overrideProvider(httpConfig.KEY)
      .useValue({ ...httpConfig(), ...options.http });
  }

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>(APP_OPTIONS);
  await setupApp(app);

  return { app, clock, http: () => request(app.getHttpServer()) };
}
