import { Logger } from '@nestjs/common';
import { ApiHeader } from '@order-splitter/shared';
import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestIdMiddleware } from './request-id.middleware.js';
import { responseTimeMiddleware } from './response-time.middleware.js';

const RESPONSE_TIME_PATTERN = /^\d+\.\d{3}ms$/;

describe('responseTimeMiddleware', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds X-Response-Time in milliseconds and logs one line per request', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const app = express()
      .use(requestIdMiddleware, responseTimeMiddleware())
      .get('/ping', (_req, res) => {
        res.status(204).end();
      });

    const response = await request(app).get('/ping?x=1').set(ApiHeader.REQUEST_ID, 'trace-1');

    expect(response.headers[ApiHeader.RESPONSE_TIME.toLowerCase()]).toMatch(RESPONSE_TIME_PATTERN);
    expect(log).toHaveBeenCalledTimes(1);
    const [fields, message] = log.mock.calls[0] ?? [];
    expect(fields).toMatchObject({
      method: 'GET',
      path: '/ping?x=1',
      statusCode: 204,
      reqId: 'trace-1',
    });
    expect(typeof (fields as { durationMs: number }).durationMs).toBe('number');
    expect(message).toMatch(/^GET \/ping\?x=1 204 \d+\.\d{3} ms$/);
  });

  it('leaves the request id to the request logger when one is attached', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const app = express()
      .use(requestIdMiddleware, (req, _res, next) => {
        Object.assign(req, { log: {} });
        next();
      })
      .use(responseTimeMiddleware())
      .get('/ping', (_req, res) => {
        res.status(204).end();
      });

    await request(app).get('/ping');

    const [fields] = log.mock.calls[0] ?? [];
    expect(fields).not.toHaveProperty('reqId');
  });
});
