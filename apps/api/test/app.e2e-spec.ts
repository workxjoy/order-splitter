import { ApiHeader, ContentType, ErrorCode } from '@order-splitter/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exampleOrderInput } from './fixtures/portfolio-order.fixtures.js';
import { createTestApp, type TestApp } from './utils/test-app.js';

const ORDERS_PATH = '/api/v1/portfolio-orders';
const REQUEST_ID_HEADER = ApiHeader.REQUEST_ID.toLowerCase();
const RESPONSE_TIME_HEADER = ApiHeader.RESPONSE_TIME.toLowerCase();

describe('HTTP platform (e2e)', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    testApp = await createTestApp();
  });

  afterEach(async () => {
    await testApp.app.close();
  });

  it('serves a version-neutral health check', async () => {
    const response = await testApp.http().get('/api/health').expect(200);

    expect(response.body).toEqual({ status: 'ok', uptimeSeconds: expect.any(Number) });
  });

  it('returns problem details for unknown routes', async () => {
    const response = await testApp.http().get('/api/v1/unknown').expect(404);

    expect(response.headers['content-type']).toContain(ContentType.PROBLEM_JSON);
    expect(response.body).toMatchObject({
      code: ErrorCode.ROUTE_NOT_FOUND,
      instance: '/api/v1/unknown',
    });
  });

  it.each(['/', '/unknown', '/apiary'])(
    'returns problem details for unknown routes outside the API prefix (%s)',
    async (path) => {
      const response = await testApp.http().get(path).expect(404);

      expect(response.headers['content-type']).toContain(ContentType.PROBLEM_JSON);
      expect(response.body).toMatchObject({
        code: ErrorCode.ROUTE_NOT_FOUND,
        status: 404,
        instance: path,
        detail: `Cannot GET ${path}`,
      });
    },
  );

  it('traces and times malformed JSON without quoting the body back', async () => {
    const response = await testApp
      .http()
      .post(ORDERS_PATH)
      .set('Content-Type', ContentType.JSON)
      .send('{"portfolioName":"private note", "orderType":')
      .expect(400);

    expect(response.body).toMatchObject({
      code: ErrorCode.MALFORMED_REQUEST,
      detail: 'Request body is not valid JSON',
      requestId: response.headers[REQUEST_ID_HEADER],
    });
    expect(JSON.stringify(response.body)).not.toContain('private note');
    expect(response.headers[RESPONSE_TIME_HEADER]).toMatch(/ms$/);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it.each([
    ['the root', '/', 404],
    ['the API docs', '/docs', 200],
    ['a path that cannot be decoded', `${ORDERS_PATH}/%E0%A4%A`, 400],
  ])('traces and times requests to %s', async (_case, path, status) => {
    const response = await testApp.http().get(path).set(ApiHeader.REQUEST_ID, 'trace-outside');

    expect(response.status).toBe(status);
    expect(response.headers[REQUEST_ID_HEADER]).toBe('trace-outside');
    expect(response.headers[RESPONSE_TIME_HEADER]).toMatch(/ms$/);
  });

  it('keeps exact source text only for money fields, so other fields stay strictly typed', async () => {
    const input = exampleOrderInput();
    const response = await testApp
      .http()
      .post(ORDERS_PATH)
      .send({ ...input, portfolio: { ...input.portfolio, name: 12345 } })
      .expect(400);

    expect(response.body).toMatchObject({
      code: ErrorCode.VALIDATION_FAILED,
      errors: [{ path: 'portfolio.name', message: expect.any(String) }],
    });
  });

  it('rejects bodies above the size limit with 413', async () => {
    const response = await testApp
      .http()
      .post(ORDERS_PATH)
      .send({ padding: 'x'.repeat(200_000) })
      .expect(413);

    expect(response.body.code).toBe(ErrorCode.PAYLOAD_TOO_LARGE);
  });

  it.each([
    ['a form', 'application/x-www-form-urlencoded', 'orderType=BUY'],
    ['plain text', 'text/plain', JSON.stringify(exampleOrderInput())],
  ])('rejects %s body with 415 Unsupported Media Type', async (_case, type, body) => {
    const response = await testApp
      .http()
      .post(ORDERS_PATH)
      .set('Content-Type', type)
      .send(body)
      .expect(415);

    expect(response.headers['content-type']).toContain(ContentType.PROBLEM_JSON);
    expect(response.body).toMatchObject({
      code: ErrorCode.UNSUPPORTED_MEDIA_TYPE,
      detail: `Request body must be ${ContentType.JSON}`,
    });
  });

  it('validates a JSON body that is not an object instead of calling it malformed', async () => {
    const response = await testApp
      .http()
      .post(ORDERS_PATH)
      .set('Content-Type', ContentType.JSON)
      .send('null')
      .expect(400);

    expect(response.body).toMatchObject({
      code: ErrorCode.VALIDATION_FAILED,
      errors: [{ path: '', message: expect.stringContaining('expected object') }],
    });
  });

  it('answers PUT on the collection with 405 and the allowed methods', async () => {
    const response = await testApp.http().put(ORDERS_PATH).send(exampleOrderInput()).expect(405);

    expect(response.headers.allow).toBe('GET, HEAD, POST');
    expect(response.headers['content-type']).toContain(ContentType.PROBLEM_JSON);
    expect(response.body.code).toBe(ErrorCode.METHOD_NOT_ALLOWED);
  });

  it('answers DELETE on an order with 405 and the allowed methods', async () => {
    const response = await testApp
      .http()
      .delete(`${ORDERS_PATH}/7b7f4c2e-1f2a-4e3b-9c4d-5e6f7a8b9c0d`)
      .expect(405);

    expect(response.headers.allow).toBe('GET, HEAD');
    expect(response.body.code).toBe(ErrorCode.METHOD_NOT_ALLOWED);
  });

  it('propagates a well-formed inbound request id and replaces an unsafe one', async () => {
    const kept = await testApp.http().get('/api/health').set(ApiHeader.REQUEST_ID, 'trace-abc.123');
    const replaced = await testApp
      .http()
      .get('/api/health')
      .set(ApiHeader.REQUEST_ID, 'bad id with spaces');

    expect(kept.headers[REQUEST_ID_HEADER]).toBe('trace-abc.123');
    expect(replaced.headers[REQUEST_ID_HEADER]).not.toBe('bad id with spaces');
    expect(replaced.headers[REQUEST_ID_HEADER]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('allows configured browser origins and exposes tracing headers', async () => {
    const response = await testApp.http().get('/api/health').set('Origin', 'http://localhost:3000');

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(response.headers['access-control-expose-headers']?.split(',')).toEqual(
      expect.arrayContaining([
        ApiHeader.RESPONSE_TIME,
        ApiHeader.REQUEST_ID,
        'Retry-After',
        'Allow',
      ]),
    );
  });

  it('publishes an OpenAPI document generated from the shared schemas', async () => {
    const response = await testApp.http().get('/docs/openapi.json').expect(200);

    expect(Object.keys(response.body.paths)).toEqual(
      expect.arrayContaining(['/api/health', ORDERS_PATH, `${ORDERS_PATH}/{id}`]),
    );
    expect(response.body.components.schemas).toHaveProperty('CreatePortfolioOrderRequest');
    expect(response.body.components.schemas).toHaveProperty('ErrorResponse');

    const create = response.body.paths[ORDERS_PATH].post;
    expect(Object.keys(create.responses)).toEqual(
      expect.arrayContaining(['201', '400', '413', '415', '422', '429']),
    );
    expect(Object.keys(create.responses['400'].content)).toEqual([ContentType.PROBLEM_JSON]);
    expect(Object.keys(create.responses['201'].content)).toEqual([ContentType.JSON]);
    expect(create.responses['201'].headers).toHaveProperty('Location');
    expect(create.responses['201'].headers).toHaveProperty(ApiHeader.RESPONSE_TIME);
    expect(response.body.paths[`${ORDERS_PATH}/{id}`].get.responses).toHaveProperty('400');

    // Decimal limits are machine-readable, not only described in prose.
    const request = response.body.components.schemas.CreatePortfolioOrderRequest;
    expect(request.properties.totalAmount).toMatchObject({
      pattern: '^\\d+(\\.\\d{1,2}0*)?$',
      minimum: 0,
      exclusiveMinimum: true,
      maximum: 1_000_000_000,
    });
  });

  it('uses only OpenAPI 3.0 keywords in its 3.0 document', async () => {
    const response = await testApp.http().get('/docs/openapi.json').expect(200);
    const misused: string[] = [];
    const walk = (node: unknown, path: string): void => {
      if (Array.isArray(node)) {
        node.forEach((item, index) => walk(item, `${path}/${String(index)}`));
        return;
      }
      if (typeof node !== 'object' || node === null) return;
      for (const [key, value] of Object.entries(node)) {
        // 3.0 takes boolean exclusive bounds; numeric ones and `type: null` are 3.1 only.
        const isNumericBound =
          (key === 'exclusiveMinimum' || key === 'exclusiveMaximum') && typeof value !== 'boolean';
        if (isNumericBound || (key === 'type' && value === 'null')) misused.push(`${path}/${key}`);
        walk(value, `${path}/${key}`);
      }
    };

    walk(response.body, '');

    expect(response.body.openapi).toMatch(/^3\.0\./);
    expect(misused).toEqual([]);
  });
});

describe('HTTP platform with rate limiting (e2e)', () => {
  it('limits each endpoint per client with 429 problem details, but never health checks', async () => {
    const limited = await createTestApp({ http: { throttle: { ttlMs: 60_000, limit: 2 } } });
    try {
      await limited.http().post(ORDERS_PATH).send(exampleOrderInput()).expect(201);
      await limited.http().post(ORDERS_PATH).send(exampleOrderInput()).expect(201);
      const response = await limited.http().post(ORDERS_PATH).send(exampleOrderInput()).expect(429);

      expect(response.body).toMatchObject({
        code: ErrorCode.RATE_LIMITED,
        status: 429,
        detail: expect.stringContaining('Retry-After'),
      });
      expect(response.headers['retry-after']).toBeDefined();
      await limited.http().get(ORDERS_PATH).expect(200);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await limited.http().get('/api/health').expect(200);
      }
    } finally {
      await limited.app.close();
    }
  });

  it('limits each client behind a trusted proxy (e.g. the web console) separately', async () => {
    // Requests arrive from loopback, which is trusted by default, so X-Forwarded-For names the client.
    const limited = await createTestApp({ http: { throttle: { ttlMs: 60_000, limit: 1 } } });
    const postAs = (client: string) =>
      limited.http().post(ORDERS_PATH).set('X-Forwarded-For', client).send(exampleOrderInput());
    try {
      await postAs('203.0.113.10').expect(201);
      await postAs('203.0.113.10').expect(429);
      await postAs('203.0.113.20').expect(201);
    } finally {
      await limited.app.close();
    }
  });

  it('ignores X-Forwarded-For from untrusted peers', async () => {
    const limited = await createTestApp({
      http: { throttle: { ttlMs: 60_000, limit: 1 }, trustProxy: false },
    });
    const postAs = (client: string) =>
      limited.http().post(ORDERS_PATH).set('X-Forwarded-For', client).send(exampleOrderInput());
    try {
      await postAs('203.0.113.10').expect(201);
      await postAs('203.0.113.20').expect(429);
    } finally {
      await limited.app.close();
    }
  });

  it('can run without the API docs', async () => {
    const noDocs = await createTestApp({ http: { apiDocsEnabled: false } });
    try {
      const response = await noDocs.http().get('/docs/openapi.json').expect(404);

      expect(response.headers['content-type']).toContain(ContentType.PROBLEM_JSON);
      expect(response.body.code).toBe(ErrorCode.ROUTE_NOT_FOUND);
    } finally {
      await noDocs.app.close();
    }
  });
});
