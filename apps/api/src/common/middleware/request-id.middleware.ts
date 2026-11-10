import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ApiHeader } from '@order-splitter/shared';
import type { NextFunction, Request, Response } from 'express';
import { REQUEST_ID_PATTERN } from '../constants.js';

// Keep the caller's X-Request-Id if it looks valid, otherwise generate one.
export function resolveRequestId(req: IncomingMessage, res: ServerResponse): string {
  const inbound = req.headers[ApiHeader.REQUEST_ID.toLowerCase()];
  const requestId =
    typeof inbound === 'string' && REQUEST_ID_PATTERN.test(inbound) ? inbound : randomUUID();
  res.setHeader(ApiHeader.REQUEST_ID, requestId);
  return requestId;
}

// Mounted on the Express app itself, so every request gets an id: /docs, unknown paths and paths
// Express cannot decode included. The request logger then reuses req.id.
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  req.id = resolveRequestId(req, res);
  next();
}
