import { Logger } from '@nestjs/common';
import { ApiHeader } from '@order-splitter/shared';
import type { Request, Response } from 'express';
import responseTime from 'response-time';
import { RESPONSE_TIME_DIGITS, RESPONSE_TIME_UNIT } from '../constants.js';

// Key the request logger uses for the request id.
const REQUEST_ID_LOG_KEY = 'reqId';

// Sets X-Response-Time and logs one line per request with its duration in ms. Mounted on the Express
// app itself, so requests that never reach a Nest route are timed too.
export function responseTimeMiddleware() {
  const logger = new Logger('HTTP');
  return responseTime((req, res, durationMs) => {
    const request = req as Request;
    const response = res as Response;
    // Set by the request logger, which only runs for routes under /api.
    const requestLogger = (request as { log?: unknown }).log;
    const duration = durationMs.toFixed(RESPONSE_TIME_DIGITS);
    response.setHeader(ApiHeader.RESPONSE_TIME, `${duration}${RESPONSE_TIME_UNIT}`);
    logger.log(
      {
        method: request.method,
        path: request.originalUrl,
        statusCode: response.statusCode,
        durationMs: Number(duration),
        // That logger already adds the request id to every line.
        ...(requestLogger === undefined && { [REQUEST_ID_LOG_KEY]: request.id }),
      },
      `${request.method} ${request.originalUrl} ${response.statusCode} ${duration} ${RESPONSE_TIME_UNIT}`,
    );
  });
}
