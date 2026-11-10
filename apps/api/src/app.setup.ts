import { NotFoundException, VersioningType, type NestApplicationOptions } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ApiHeader } from '@order-splitter/shared';
import type { Request, Response } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { API_PREFIX, API_VERSION } from './common/constants.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { requestIdMiddleware } from './common/middleware/request-id.middleware.js';
import { responseTimeMiddleware } from './common/middleware/response-time.middleware.js';
import { appConfig, type AppConfig } from './config/app.config.js';
import { httpConfig, type HttpConfig } from './config/http.config.js';
import { setupSwagger } from './swagger.js';

// JSON is parsed by JsonBodyMiddleware, after a request id has been assigned.
export const APP_OPTIONS: NestApplicationOptions = {
  bodyParser: false,
  bufferLogs: true,
};

// Response headers a browser client is allowed to read.
const EXPOSED_HEADERS = [
  ApiHeader.REQUEST_ID,
  ApiHeader.RESPONSE_TIME,
  ApiHeader.REQUEST_REPLAYED,
  'Location',
  // Sent with 429 and 405 responses.
  'Retry-After',
  'Allow',
];

// Used by main.ts and the e2e tests.
export async function setupApp(app: NestExpressApplication): Promise<void> {
  const { isProduction } = app.get<AppConfig>(appConfig.KEY);
  const http = app.get<HttpConfig>(httpConfig.KEY);

  app.useLogger(app.get(Logger));
  // Lets req.ip (the rate-limit key) come from X-Forwarded-For when a trusted proxy sets it.
  app.set('trust proxy', http.trustProxy);
  // First, so every request is traced and timed, including ones that never reach a Nest route.
  app.use(requestIdMiddleware, responseTimeMiddleware());
  // TLS is terminated in front of the app, so HSTS is only sent in production.
  app.use(
    helmet({
      hsts: isProduction,
      contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } },
    }),
  );
  app.setGlobalPrefix(API_PREFIX);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: API_VERSION });
  app.enableCors({ origin: http.corsOrigins, exposedHeaders: EXPOSED_HEADERS });
  app.enableShutdownHooks();

  if (http.apiDocsEnabled) setupSwagger(app);

  await app.init();

  // Registered after init() so it runs last; otherwise paths outside /api get Express's HTML 404.
  const problems = new HttpExceptionFilter();
  app.use((request: Request, response: Response) => {
    problems.respond(
      new NotFoundException(`Cannot ${request.method} ${request.originalUrl}`),
      request,
      response,
    );
  });
}
