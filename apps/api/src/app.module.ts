import {
  Module,
  StandardSchemaValidationPipe,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { buildLoggerOptions } from './common/logger/logger.config.js';
import { RATE_LIMITED_DETAIL } from './common/constants.js';
import { JsonBodyMiddleware } from './common/middleware/json-body.middleware.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { ValidationException } from './common/exceptions/validation.exception.js';
import {
  appConfig,
  configFactories,
  httpConfig,
  NodeEnv,
  type AppConfig,
  type HttpConfig,
} from './config/index.js';
import { HealthModule } from './health/health.module.js';
import { PortfolioOrdersModule } from './portfolio-orders/portfolio-orders.module.js';

const ENV_FILES = ['.env.local', '.env'];
const ALL_ROUTES = '{*path}';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ENV_FILES,
      // Tests must not depend on a developer's local .env.
      ignoreEnvFile: process.env.NODE_ENV === NodeEnv.TEST,
      load: configFactories,
    }),
    LoggerModule.forRootAsync({
      inject: [appConfig.KEY],
      useFactory: (config: AppConfig) => buildLoggerOptions(config),
    }),
    ThrottlerModule.forRootAsync({
      inject: [httpConfig.KEY],
      useFactory: (config: HttpConfig) => ({
        throttlers: [{ ttl: config.throttle.ttlMs, limit: config.throttle.limit }],
        errorMessage: RATE_LIMITED_DETAIL,
      }),
    }),
    HealthModule,
    PortfolioOrdersModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    {
      provide: APP_PIPE,
      useFactory: () =>
        new StandardSchemaValidationPipe({
          exceptionFactory: (issues) => ValidationException.fromIssues(issues),
        }),
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(JsonBodyMiddleware).forRoutes(ALL_ROUTES);
  }
}
