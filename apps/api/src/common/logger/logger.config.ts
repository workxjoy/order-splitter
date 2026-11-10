import type { Params } from 'nestjs-pino';
import type { AppConfig } from '../../config/app.config.js';
import { resolveRequestId } from '../middleware/request-id.middleware.js';

const PRETTY_TRANSPORT = 'pino-pretty';
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
];

// JSON logs in production, readable single-line logs locally.
export function buildLoggerOptions(config: AppConfig): Params {
  return {
    pinoHttp: {
      level: config.logLevel,
      // Only used if requestIdMiddleware has not already set req.id.
      genReqId: resolveRequestId,
      // responseTimeMiddleware logs one line per request instead.
      autoLogging: false,
      quietReqLogger: true,
      redact: REDACTED_PATHS,
      ...(!config.isProduction && {
        transport: {
          target: PRETTY_TRANSPORT,
          options: { singleLine: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' },
        },
      }),
    },
  };
}
