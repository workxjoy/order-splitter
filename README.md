# Portfolio Order Splitter

A proof-of-concept developer API for a robo-advisor's managed-investment (model portfolio) offering. A partner sends a user's model portfolio and an amount to **buy** or **sell**. The API responds with:

- the **dollar amount** and **share quantity** for each stock,
- **when to execute** the orders (markets trade Monday to Friday),
- the stored order, so **historic orders** can be listed and fetched later.

It is a TypeScript monorepo with a **NestJS 12** REST API, a **Next.js 16** operator console, and a shared **Zod 4** contract package that both apps validate against.

```
POST /api/v1/portfolio-orders   { BUY, $100, AAPL 60% / TSLA 40% }
→ 201  AAPL $60.00 → 0.600 sh · TSLA $40.00 → 0.400 sh · executeAt: next session open
```

Design decisions and assumptions are explained in [ANSWERS.md](./ANSWERS.md).

---

## Contents

- [Quick start](#quick-start)
- [API reference](#api-reference)
- [How an order is split](#how-an-order-is-split)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Testing and quality gates](#testing-and-quality-gates)
- [Libraries and frameworks](#libraries-and-frameworks)

---

## Quick start

**Requirements:** Node.js 24.15 or later (`.nvmrc`) and pnpm 10 (bundled through Corepack).

```bash
corepack enable          # provides the pnpm version pinned in package.json
pnpm install
pnpm dev                 # API on :3001, web console on :3000 (hot reload)
```

| What                                | URL                                     |
| ----------------------------------- | --------------------------------------- |
| Web console (new order and history) | http://localhost:3000                   |
| REST API                            | http://localhost:3001/api/v1            |
| Swagger UI                          | http://localhost:3001/docs              |
| OpenAPI document                    | http://localhost:3001/docs/openapi.json |
| Health check                        | http://localhost:3001/api/health        |

Both apps run with sensible defaults. To change settings, copy `apps/api/.env.example` to `apps/api/.env` and `apps/web/.env.example` to `apps/web/.env.local`.

**Production build:**

```bash
pnpm build
pnpm --filter @order-splitter/api start                                    # node dist/main.js
API_BASE_URL=http://localhost:3001/api/v1 pnpm --filter @order-splitter/web start
```

**With Docker** (production images, no local Node needed):

```bash
docker compose up --build    # same ports as above
```

**Run the API only:** `pnpm --filter @order-splitter/api dev`

---

## API reference

Base URL: `http://localhost:3001/api/v1`. Request and response bodies are `application/json` (a request body of any other media type gets `415`). Errors are `application/problem+json` ([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)).

| Method | Path                    | Purpose                                                       | Success |
| ------ | ----------------------- | ------------------------------------------------------------- | ------- |
| `POST` | `/portfolio-orders`     | Split a model-portfolio order into per-stock orders           | `201`   |
| `GET`  | `/portfolio-orders`     | List historic orders, newest first (paginated)                | `200`   |
| `GET`  | `/portfolio-orders/:id` | Get one historic order                                        | `200`   |
| `GET`  | `/api/health`           | Liveness probe (full path; not versioned, never rate limited) | `200`   |

### `POST /portfolio-orders`

**Request body**

| Field                                 | Type              | Rules                                                                                                                                                            |
| ------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `orderType`                           | `"BUY" \| "SELL"` | Required                                                                                                                                                         |
| `totalAmount`                         | number or string  | USD, > 0, ≤ 1,000,000,000, ≤ 2 decimal places                                                                                                                    |
| `portfolio.name`                      | string            | Optional label, 1–100 characters                                                                                                                                 |
| `portfolio.allocations`               | array             | 1–100 entries; `percent` values must sum to exactly 100                                                                                                          |
| `portfolio.allocations[].symbol`      | string            | Case-insensitive ticker, e.g. `AAPL`, `BRK.B`: 1–10 characters, starts with a letter, then letters, digits, `.` or `-` (ASCII only); unique within the portfolio |
| `portfolio.allocations[].percent`     | number or string  | > 0, ≤ 100, ≤ 4 decimal places                                                                                                                                   |
| `portfolio.allocations[].marketPrice` | number or string  | Optional. Overrides the fixed price for this stock; > 0, ≤ 1,000,000, ≤ 4 decimal places                                                                         |

Unknown fields are rejected, to catch client typos. Numbers may be sent as JSON numbers or decimal strings. JSON numbers are validated from the exact digits sent, so `10.0000000000000001` is rejected for having too many decimal places rather than silently rounded to `10`; exponent forms such as `1e2` are not accepted. Responses always return decimal strings so no precision is lost. These rules, limits and examples are also in the OpenAPI document (`/docs/openapi.json`).

**Optional headers**

| Header         | Purpose                                                                                                                                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Request-Key`  | Safe retries. The same key with an equivalent body returns the original order (`201` plus `Request-Replayed: true`) and never creates a duplicate. The same key with a different body returns `422 REQUEST_KEY_REUSED`. |
| `X-Request-Id` | Correlation id. It is echoed back if it is well-formed; otherwise one is generated.                                                                                                                                     |

**Example: the brief's example (USD 100, AAPL 60% / TSLA 40%, fixed $100 price)**

```bash
curl -i -X POST http://localhost:3001/api/v1/portfolio-orders \
  -H 'Content-Type: application/json' \
  -H 'Request-Key: 5f0c7a52-0b1e-4d38-9a51-4f1c2b8e6d10' \
  -d '{
        "orderType": "BUY",
        "totalAmount": 100,
        "portfolio": {
          "allocations": [
            { "symbol": "AAPL", "percent": 60 },
            { "symbol": "TSLA", "percent": 40 }
          ]
        }
      }'
```

```http
HTTP/1.1 201 Created
Location: /api/v1/portfolio-orders/6ea1220b-2f6a-4670-a351-46fa502495dd
X-Request-Id: 67bd55ce-8102-4ceb-ad9f-a50612267229
X-Response-Time: 14.460ms
```

```json
{
  "data": {
    "id": "6ea1220b-2f6a-4670-a351-46fa502495dd",
    "orderType": "BUY",
    "portfolioName": null,
    "totalAmount": "100.00",
    "estimatedTotalAmount": "100.00",
    "unallocatedAmount": "0.00",
    "quantityPrecision": 3,
    "executeAt": "2026-11-09T14:30:00.000Z",
    "marketTimezone": "America/New_York",
    "createdAt": "2026-11-08T20:55:41.023Z",
    "orders": [
      {
        "symbol": "AAPL",
        "percent": "60",
        "price": "100.00",
        "priceSource": "FIXED",
        "amount": "60.00",
        "quantity": "0.600",
        "estimatedAmount": "60.00"
      },
      {
        "symbol": "TSLA",
        "percent": "40",
        "price": "100.00",
        "priceSource": "FIXED",
        "amount": "40.00",
        "quantity": "0.400",
        "estimatedAmount": "40.00"
      }
    ]
  }
}
```

This request was made on a Sunday, so `executeAt` is the next session open: Monday 09:30 America/New_York = 14:30 UTC.

**Example: SELL with partner market prices**

```bash
curl -X POST http://localhost:3001/api/v1/portfolio-orders \
  -H 'Content-Type: application/json' \
  -d '{
        "orderType": "SELL",
        "totalAmount": "2500.50",
        "portfolio": {
          "name": "Tech Tilt",
          "allocations": [
            { "symbol": "MSFT", "percent": "70", "marketPrice": "415.27" },
            { "symbol": "NVDA", "percent": "30" }
          ]
        }
      }'
```

Result: MSFT is priced by the partner (`$415.27`), so $1,750.35 sells **4.214** shares. NVDA uses the fixed `$100.00`, so $750.15 sells **7.501** shares. `unallocatedAmount` is `"0.45"`, the cash left by rounding quantities down.

**Response fields**

| Field                            | Meaning                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------- |
| `orders[].amount`                | Dollars allocated to the stock (whole cents; the amounts sum to `totalAmount`)    |
| `orders[].quantity`              | Shares to trade, rounded **down** to `quantityPrecision` decimal places           |
| `orders[].price` / `priceSource` | Price used, and whether it came from the `PARTNER` or the `FIXED` price           |
| `orders[].estimatedAmount`       | `quantity × price`, never more than `amount`                                      |
| `estimatedTotalAmount`           | Sum of the `estimatedAmount` values                                               |
| `unallocatedAmount`              | `totalAmount − estimatedTotalAmount`                                              |
| `quantityPrecision`              | Decimal places in effect when the order was created                               |
| `executeAt`                      | When to execute (UTC): now if the market is open, otherwise the next session open |
| `marketTimezone`                 | IANA time zone of the session `executeAt` was scheduled in (`MARKET_TIMEZONE`)    |

### `GET /portfolio-orders`

| Query       | Default | Rules                 |
| ----------- | ------- | --------------------- |
| `page`      | `1`     | Integer ≥ 1           |
| `pageSize`  | `20`    | Integer from 1 to 100 |
| `orderType` | (all)   | `BUY` or `SELL`       |

Integers are plain digits (`2`, not `2.0`, `0x2` or `1e1`). Unknown query parameters are rejected with `400`, so a misspelt filter such as `ordertype` never silently returns every order.

```bash
curl 'http://localhost:3001/api/v1/portfolio-orders?orderType=SELL&page=1&pageSize=10'
# { "data": [ ...portfolio orders... ], "meta": { "page": 1, "pageSize": 10, "totalItems": 1, "totalPages": 1 } }
```

### `GET /portfolio-orders/:id`

The id is case-insensitive.

```bash
curl http://localhost:3001/api/v1/portfolio-orders/6ea1220b-2f6a-4670-a351-46fa502495dd
# { "data": { ...portfolio order... } }
```

### Errors

Every error uses the same shape, with a stable machine-readable `code` and field-level `errors` where relevant:

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "detail": "The request is invalid",
  "code": "VALIDATION_FAILED",
  "errors": [
    {
      "path": "portfolio.allocations.0.percent",
      "message": "Enter a positive number, e.g. 100 or 100.25"
    }
  ],
  "instance": "/api/v1/portfolio-orders",
  "requestId": "5dce1584-3cf5-4479-b552-5cac459ac93a"
}
```

| Status | `code`                                          | When                                                                                                       |
| ------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 400    | `VALIDATION_FAILED`                             | Body, query, path or `Request-Key` header fails validation                                                 |
| 400    | `MALFORMED_REQUEST`                             | Body is not valid JSON                                                                                     |
| 404    | `PORTFOLIO_ORDER_NOT_FOUND` / `ROUTE_NOT_FOUND` | Unknown order id or route                                                                                  |
| 405    | `METHOD_NOT_ALLOWED`                            | Known resource, unsupported method (e.g. `DELETE /portfolio-orders/:id`); `Allow` lists the supported ones |
| 413    | `PAYLOAD_TOO_LARGE`                             | Body larger than 100 kB                                                                                    |
| 415    | `UNSUPPORTED_MEDIA_TYPE`                        | Request body is not `application/json`                                                                     |
| 422    | `AMOUNT_BELOW_MINIMUM`                          | A stock's allocation, or its shares after rounding down, is below `MIN_ORDER_AMOUNT` (default $1)          |
| 422    | `QUANTITY_BELOW_MINIMUM`                        | A stock buys less than the minimum quantity (e.g. $500 of a $750,000 share at 3 dp)                        |
| 422    | `REQUEST_KEY_REUSED`                            | Same `Request-Key` sent with a different body                                                              |
| 429    | `RATE_LIMITED`                                  | Per-client, per-endpoint rate limit exceeded (`Retry-After` is set; see `TRUST_PROXY`)                     |
| 500    | `INTERNAL_ERROR`                                | Unexpected failure; details are logged, never returned                                                     |
| other  | `HTTP_ERROR`                                    | Any other HTTP error raised by the framework                                                               |

`400` means the request breaks the contract and is wrong whatever the server state. `422` means the request is well-formed but a business rule rejects it, given the current configuration or prices (a quantity that rounds to zero at the configured precision, or a reused request key).

### Response-time instrumentation

Every response carries `X-Response-Time` (high-resolution, in milliseconds), and the API writes one line per request to the console:

```
[15:33:26.115] INFO: POST /api/v1/portfolio-orders 201 2.899 ms {"reqId":"9f0fb2c0-…","context":"HTTP","method":"POST","path":"/api/v1/portfolio-orders","statusCode":201,"durationMs":2.899}
```

In production (`NODE_ENV=production`) the same line is emitted as structured JSON for log aggregation.

---

## How an order is split

1. **Validate** the request against the shared schema: weights sum to exactly 100 (decimal arithmetic, no float tolerance), symbols are unique, and amounts and prices have bounded precision.
2. **Allocate whole cents** by weight with the largest-remainder method, so per-stock amounts always add up to the total. For example, $100 at 33.3333 / 33.3333 / 33.3334% gives $33.33 / $33.33 / $33.34.
3. **Price each stock:** the partner `marketPrice` if given, otherwise the configured fixed price ($100).
4. **Compute quantities:** `amount ÷ price`, rounded **down** to `QUANTITY_DECIMAL_PLACES`, so an order never spends (BUY) or raises (SELL) more than its allocation. The request is rejected with `422`, listing every such stock, if a stock is allocated less than `MIN_ORDER_AMOUNT` ($1 by default, the usual broker minimum for dollar-based orders), if its shares after rounding down are worth less than that (e.g. $1.00 of a $750 stock is 0.001 shares, worth $0.75), or if its quantity rounds to zero.
5. **Schedule execution:** Monday to Friday, 09:30–16:00 in `MARKET_TIMEZONE` (DST-aware), skipping exchange holidays and closing at 13:00 on early-close days. The default calendar is NYSE's published 2026–2028 calendar ([nyse.com](https://www.nyse.com/markets/hours-calendars)), kept in `apps/api/src/config/nyse-holidays.ts`. During a session the order executes now; otherwise it is scheduled for the next session open.
6. **Store** the order (and its request key) in memory and return it. The store keeps at most 10,000 orders and 50,000 stock lines in total, whichever limit is reached first; the oldest orders, and their request keys, are evicted. A full store of 100-stock orders takes roughly 30 to 60 MB of heap.

All arithmetic uses `decimal.js` with 40 significant digits. JavaScript floating-point numbers never touch an amount, price or quantity.

The reasoning behind each rule, and how it compares with broker documentation (Alpaca, Robinhood) and the NYSE calendar, is in [ANSWERS.md](ANSWERS.md#checked-against-industry-practice).

---

## Configuration

API settings come from environment variables (or `apps/api/.env`). They are validated with Zod at startup, and the app refuses to start with a clear message if any value is invalid.

| Variable                             | Default                 | Description                                                                                         |
| ------------------------------------ | ----------------------- | --------------------------------------------------------------------------------------------------- |
| `QUANTITY_DECIMAL_PLACES`            | `3`                     | Decimal places allowed for share quantities (0–9)                                                   |
| `DEFAULT_STOCK_PRICE`                | `100`                   | Fixed price per share when the partner sends no market price (> 0, ≤ 1,000,000, ≤ 4 decimal places) |
| `MIN_ORDER_AMOUNT`                   | `1`                     | Minimum USD allocated to each stock (≤ 2 decimal places; `0` for no minimum)                        |
| `MARKET_TIMEZONE`                    | `America/New_York`      | IANA time zone of the trading session                                                               |
| `MARKET_OPEN_TIME`                   | `09:30`                 | Session open (24-hour time)                                                                         |
| `MARKET_CLOSE_TIME`                  | `16:00`                 | Session close (24-hour time)                                                                        |
| `MARKET_HOLIDAYS`                    | NYSE 2026–2028          | Comma-separated dates (`YYYY-MM-DD`) when the market is closed; empty for Monday to Friday only     |
| `MARKET_EARLY_CLOSES`                | NYSE 2026–2028          | Comma-separated dates when the session ends at `MARKET_EARLY_CLOSE_TIME`                            |
| `MARKET_EARLY_CLOSE_TIME`            | `13:00`                 | Close on early-close days (between the open and the regular close)                                  |
| `PORT`                               | `3001`                  | HTTP port                                                                                           |
| `NODE_ENV`                           | `development`           | `production` switches to JSON logs and enables HSTS                                                 |
| `LOG_LEVEL`                          | `info`                  | `fatal` … `trace`, or `silent`                                                                      |
| `CORS_ORIGINS`                       | `http://localhost:3000` | Comma-separated browser origins (scheme, host and port only; a path is rejected)                    |
| `API_DOCS_ENABLED`                   | `true`                  | Serve Swagger UI at `/docs`                                                                         |
| `THROTTLE_TTL_MS` / `THROTTLE_LIMIT` | `60000` / `120`         | Requests allowed per client IP, per endpoint, per window                                            |
| `TRUST_PROXY`                        | `loopback`              | Proxies allowed to set the client IP (see below)                                                    |

Example of raising the share precision to 7 decimal places:

```bash
QUANTITY_DECIMAL_PLACES=7 pnpm --filter @order-splitter/api dev
```

The default calendar covers 2026 to 2028; after 2028 the schedule falls back to Monday to Friday until the next years are added to `nyse-holidays.ts` (NYSE publishes about three years ahead). The API logs a warning the first time it schedules a date past the end of the list. A market other than NYSE sets its own `MARKET_HOLIDAYS` and `MARKET_EARLY_CLOSES`.

Web console settings (server-side only; the browser never calls the API directly):

| Variable              | Default                        | Description                                                                          |
| --------------------- | ------------------------------ | ------------------------------------------------------------------------------------ |
| `API_BASE_URL`        | `http://localhost:3001/api/v1` | Versioned base URL of the API                                                        |
| `TRUSTED_PROXY_COUNT` | `0`                            | Reverse proxies in front of the console that append to `X-Forwarded-For` (see below) |

**Client IPs and rate limiting.** The API rate-limits by client address, and every console request reaches it from the Next.js server. Next.js passes on an `X-Forwarded-For` header the browser sent itself, so the console cannot trust that header on its own. With `TRUSTED_PROXY_COUNT=0` (a console that browsers reach directly) it forwards no address, and all console users share one limit. Behind reverse proxies, set `TRUSTED_PROXY_COUNT` to how many append to `X-Forwarded-For`; the console then forwards only the address the outermost proxy recorded. Do this only when the console can be reached solely through those proxies; anyone who can call it directly could otherwise write the header themselves. On the API side, `TRUST_PROXY` lists who may set the header at all. It takes Express's ["trust proxy"](https://expressjs.com/en/guide/behind-proxies.html) values: `false`, a hop count, or a comma-separated list of IP addresses, CIDR ranges, `loopback`, `linklocal` or `uniquelocal`. The default (`loopback`) covers the console and API on one host. Docker Compose gives the web container a fixed address and trusts only that, and publishes the API port on `127.0.0.1` only.

---

## Architecture

```
portfolio-order-splitter/
├── apps/
│   ├── api/                                NestJS 12 REST API
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts               config, logging, rate limiting, global pipe/filter/guard
│   │   │   ├── app.setup.ts                helmet, CORS, versioning, Swagger (shared with the e2e tests)
│   │   │   ├── swagger.ts
│   │   │   ├── config/                     validated environment variables, NYSE holiday list
│   │   │   ├── common/
│   │   │   │   ├── decorators/             @RequestKey()
│   │   │   │   ├── exceptions/             domain, validation and 405 exceptions
│   │   │   │   ├── filters/                HttpExceptionFilter (RFC 9457 error responses)
│   │   │   │   ├── middleware/             JSON body parsing, response time logging
│   │   │   │   ├── logger/                 pino configuration
│   │   │   │   ├── services/               clock
│   │   │   │   └── utils/                  money (decimal.js), request hashing
│   │   │   ├── health/
│   │   │   └── portfolio-orders/
│   │   │       ├── portfolio-orders.controller.ts
│   │   │       ├── portfolio-orders.service.ts
│   │   │       ├── portfolio-orders.module.ts
│   │   │       ├── portfolio-order.mapper.ts
│   │   │       ├── portfolio-orders.exceptions.ts
│   │   │       ├── entities/               portfolio order and stock order
│   │   │       ├── services/
│   │   │       │   ├── order-allocation.service.ts    cents, prices, quantities
│   │   │       │   └── market-calendar.service.ts     trading sessions, holidays, DST
│   │   │       └── repositories/           repository interface + in-memory implementation
│   │   └── test/                           e2e tests, fixtures, test app
│   └── web/                                Next.js 16 web console
│       └── src/
│           ├── app/                        routes: new order, orders/(history), orders/[id]
│           ├── components/
│           │   ├── layout/                 app shell, navigation
│           │   ├── orders/                 order form, history table, order details
│           │   └── ui/                     input, page header, status card
│           ├── lib/                        formatting, constants, form state, URL params
│           ├── server/                     API client and server action (server only)
│           └── test/                       fixtures and test setup
└── packages/
    ├── shared/                             Zod schemas, types, enums, limits, error codes
    ├── tsconfig/                           shared compiler settings
    └── eslint-config/                      shared lint rules
```

### API layers

| Layer               | Responsibility                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| **Controller**      | Routes, request validation (`@Body({ schema })`), response headers (`Location`, `Request-Replayed`)      |
| **Service**         | One use case end to end: repeated requests, calling the domain services, saving the order                |
| **Domain services** | `OrderAllocationService` (cents, prices, rounding) and `MarketCalendarService` (when to execute). No I/O |
| **Repository**      | Storage behind an abstract class (also the injection token); in-memory implementation                    |

Applied to every route:

- **Validation:** `StandardSchemaValidationPipe`, which throws `ValidationException`.
- **Errors:** `HttpExceptionFilter` turns domain, framework and unexpected errors into RFC 9457 responses.
- **Rate limiting:** `ThrottlerGuard`.
- **Timing and request ids:** `ResponseTimeMiddleware` and `nestjs-pino`.
- **Security headers:** `helmet`.

### Request lifecycle

```
helmet → pino-http (request id) → ResponseTimeMiddleware → JsonBodyMiddleware → ThrottlerGuard
→ validation pipe → controller → service → domain services / repository
→ (any error) HttpExceptionFilter → response (+ X-Request-Id, X-Response-Time, one log line)
```

The JSON body is parsed after the request id and timer are set, so malformed or oversized bodies are still logged and timed.

### Web console

- **Routes stay thin.** `page.tsx` files read params, fetch data and render a component from `components/`.
- **History route group.** `orders/(history)` scopes `loading.tsx` to the history list, so an unknown order id still returns a real `404`.
- **Server-side data.** Pages fetch through a `server-only` API client that validates every response against the shared schemas. Orders are created by a server action that validates the input again and sends a `Request-Key` per request, so a double submit or retry never creates a second order.

---

## Testing and quality gates

```bash
pnpm test        # unit tests in every package
pnpm test:e2e    # API end-to-end tests (full Nest app over HTTP via supertest)
pnpm test:cov    # all tests with coverage thresholds (API and web: ≥95% lines, ≥90% branches)
pnpm lint        # type-aware ESLint
pnpm typecheck
pnpm verify      # lint + typecheck + tests + e2e + build (CI also runs format:check and test:cov)
```

| Package    | Focus                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared`   | Every validation rule: decimal parsing and normalisation, exact 100% sum, duplicates, limits, strict keys, query coercion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `api` unit | Order allocation (sample order, partner price priority, cent apportionment, rounding at 0/3/7/9 dp, extreme values, minimum amount before and after rounding, minimum quantity), market calendar (sessions, weekends, holidays, UTC vs New York dates, DST, custom markets, warning past the calendar's end), service (replay of a repeated request, key reuse, concurrent race, failures), repository (order and stock-line caps), mapper, error filter, config validation, timing middleware                                                                                                                                                 |
| `api` e2e  | Status codes, headers, problem details, contract conformance of responses, request keys, pagination and filtering, configurable precision, malformed and oversized bodies, request ids and timing on every path, rate limiting, CORS, OpenAPI (3.0 keywords only), no persistence across restarts                                                                                                                                                                                                                                                                                                                                              |
| `web`      | Exact money and time formatting, form-to-request mapping, URL query parsing, API client (headers, forwarding only a trusted client address, error mapping, contract checks on responses), server action outcomes. Pages and components with Testing Library in jsdom: order form (local validation, errors that follow their rows when one is removed, one request key per order, locked while placing, focus moved to errors and results), history (pagination and filter links, redirect from a page past the end, empty state), order details (market time zone, not found, ids checked before calling the API), navigation, error boundary |

Coverage counts every source file, pages and components included. Only tests, test fixtures and entry points (the API's `main.ts`, the shared package index) are left out.

CI (`.github/workflows/ci.yml`) runs format check, lint, typecheck, tests with coverage, the build, and the Docker image builds.

---

## Libraries and frameworks

| Library                                                       | Used in          | Why                                                                                                                                |
| ------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **TypeScript 6.0** (strict, `noUncheckedIndexedAccess`)       | all              | Required by the NestJS 12 toolchain; strict typing end to end                                                                      |
| **pnpm workspaces + Turborepo**                               | root             | Monorepo dependency management, cached task graph, `turbo prune` for small Docker builds                                           |
| **NestJS 12** (`@nestjs/core`, `common`, `platform-express`)  | api              | Modular DI framework on Express 5; native Standard Schema validation; ESM                                                          |
| **@nestjs/config**                                            | api              | Namespaced, injectable configuration (`registerAs`), validated with Zod at startup                                                 |
| **@nestjs/swagger**                                           | api              | OpenAPI 3 document and Swagger UI generated from the same Zod schemas                                                              |
| **@nestjs/throttler**                                         | api              | Rate limiting with `429` and `Retry-After`                                                                                         |
| **nestjs-pino / pino / pino-http**                            | api              | Fast structured logging with request ids; `pino-pretty` for development                                                            |
| **response-time** (expressjs)                                 | api              | High-resolution request timing behind `X-Response-Time` and the timing log line                                                    |
| **helmet**                                                    | api              | Security headers                                                                                                                   |
| **proxy-addr** (expressjs)                                    | api              | Validates `TRUST_PROXY` with the same parser Express uses, so a value is accepted exactly when Express accepts it                  |
| **express**                                                   | api              | JSON body parser registered as route middleware (after tracing)                                                                    |
| **Zod 4**                                                     | shared, api, web | One schema for validation, types, OpenAPI and form checks (implements Standard Schema)                                             |
| **decimal.js**                                                | shared, api      | Exact decimal arithmetic for money, prices and quantities                                                                          |
| **Luxon**                                                     | api              | Time-zone and DST-aware market session calculation                                                                                 |
| **Next.js 16 / React 19**                                     | web              | App Router, server components, server actions, standalone output                                                                   |
| **Tailwind CSS 4**                                            | web              | Utility-first styling with a few shared component utilities                                                                        |
| **server-only**                                               | web              | Build-time guarantee that the API client never reaches the browser bundle                                                          |
| **uuid**                                                      | web              | Request keys and form row ids, including on pages served over plain HTTP where `crypto.randomUUID` is unavailable                  |
| **Vitest 5 + unplugin-swc / @swc/core**                       | all              | Fast ESM-native tests; SWC emits the decorator metadata Nest's DI needs                                                            |
| **supertest**                                                 | api              | HTTP-level end-to-end tests against the real app                                                                                   |
| **Testing Library (React, user-event, jest-dom) + jsdom**     | web              | Component and page tests that query by role and label and drive the UI the way a user does                                         |
| **ESLint (typescript-eslint, eslint-config-next) + Prettier** | all              | Type-aware linting and consistent formatting. The web app stays on ESLint 9 until `eslint-config-next`'s plugins support ESLint 10 |
| **Docker** (Node 24 Alpine, Next standalone, `pnpm deploy`)   | deploy           | Reproducible, non-root production images; `docker compose up` runs both apps                                                       |
