# Answers

## 1. What was your approach to tackling this project?

I treated it as a small but real money API: a wrong cent, a duplicate order or a vague error would be a real defect. So I worked in this order:

1. **Settle the rules first.** The brief leaves a few things open (rounding, splitting cents, what "when to execute" means). I decided those before writing code. My rule of thumb: never move money the partner did not ask for, and show whatever was left over.
2. **One contract, shared.** Request and response schemas live in `packages/shared`. The API, the Swagger docs and the web form all validate against the same schema, so they cannot drift apart.
3. **Keep the layers apart.** The controller handles HTTP, the service runs the use case, two small services hold the business rules (splitting and market hours), and a repository stores orders in memory.
4. **No floats for money.** All maths uses `decimal.js`, and amounts travel as decimal strings.
5. **Make it observable.** Every request gets a request id, an `X-Response-Time` header and one console line with its duration in milliseconds.
6. **Test at two levels.** Unit tests for the rules, and end-to-end tests that boot the real app over HTTP.

## 2. What assumptions did you make?

**Request**

- The model portfolio is sent with each order as a list of `{ symbol, percent, marketPrice? }`. Percentages must add up to exactly 100; I reject rather than rescale, because the weights are the partner's decision.
- `totalAmount` is in USD, in whole cents.
- A partner `marketPrice` overrides the fixed $100 price for that stock only. The response says which price was used (`PARTNER` or `FIXED`).
- Fees, taxes and currency conversion are out of scope.

**Splitting and rounding**

- The total is split into whole cents by weight, and leftover cents go to the stocks closest to the next cent, so the per-stock amounts always add up to the total.
- Quantity is `amount ÷ price`, rounded **down** to the configured decimal places (`QUANTITY_DECIMAL_PLACES`, default 3). An order never spends or raises more than its share; the leftover is returned as `unallocatedAmount`.
- Each stock needs at least $1 (configurable). Smaller allocations, or ones that round to zero shares, are rejected with `422` instead of being dropped silently.
- SELL follows the same rules. The service does not hold positions, so it does not check that the user owns the shares.

**When to execute**

- If the market is open, execute now. Otherwise, at the next open.
- Market hours are Monday to Friday, 09:30 to 16:00 New York time. I also skip NYSE holidays, because an order scheduled for a closed market would not run when the response says it will.
- The service only works out the split and the time. It does not send orders to a broker.

**History and API**

- "Historic orders" means every successful split, newest first, with paging, a BUY/SELL filter and lookup by id. Rejected requests are not stored.
- There is no login in this version, so all callers share one history.
- An optional `Request-Key` header makes retries safe: the same key with the same body returns the original order instead of creating a second one.

### Checked against industry practice

I compared the main rules with public broker documentation, to make sure they were not just my own invention:

- **Weights sum to 100, cents only for dollar amounts:** same as Alpaca's rebalancing and fractional trading APIs ([portfolios](https://docs.alpaca.markets/us/reference/post-v1-rebalancing-portfolios), [fractional trading](https://docs.alpaca.markets/us/docs/fractional-trading)).
- **Up to 9 decimal places, rounded down:** Alpaca accepts up to 9 and truncates extra digits.
- **$1 minimum per stock:** [Robinhood](https://robinhood.com/us/en/support/articles/fractional-shares/) requires $1 per fractional order; [Alpaca's rebalancer](https://docs.alpaca.markets/us/docs/runs) skips anything under $1. I reject instead of skipping.
- **Holidays and early closes:** taken from the [NYSE calendar](https://www.nyse.com/markets/hours-calendars).

## 3. What challenges did you face?

- **Cents that do not divide evenly.** Rounding each stock on its own gives totals like $99.99 or $100.01. Handing out the leftover cents by largest remainder fixed it.
- **Decimal precision.** The default precision of `decimal.js` was not enough for very large orders at very small prices and could round a quantity up. I raised it to 40 digits.
- **Time zones.** Friday evening in New York is already Saturday in UTC, and the market open shifts by an hour with daylight saving. I used Luxon and a clock I can fix in tests.
- **Numbers losing precision before validation.** JSON turns `10.0000000000000001` into `10` before any check runs. The API now validates the exact digits the client sent.
- **Two identical requests at the same time.** A check-then-save has a race, so the repository refuses a duplicate key on save, like a unique index would.
- **Open questions in the brief.** The hardest calls were not technical: what to do with weights that do not add up, or amounts too small to trade. I chose to reject and explain rather than quietly change the order.
- **Bugs that only showed up by running it.** Malformed JSON came back without a request id or timing, and the order-not-found page returned `200` instead of `404`. Both are fixed and tested.

## 4. What would you change for production?

**Security**

- Authentication per partner (OAuth client credentials or mTLS) behind an API gateway, with secrets in a secrets manager.
- Every order and history query scoped to the partner that created it.
- Rate limits per partner, backed by Redis instead of in-process memory.
- TLS everywhere, and single sign-on with roles for the web console.
- An append-only audit log of every order request and response.
- Dependency and container scanning in CI.

**Data**

- PostgreSQL with `NUMERIC` columns behind the existing repository interface, so the services do not change.
- Real market prices, and rejection of a partner price that is far from the reference price.
- Precision, fixed price and market hours configurable per partner, with change history.
- Limits per order and per day, and a kill switch to stop order flow.

**Execution and operations**

- A queue and worker that place orders with a broker at `executeAt`, with retries and status updates back to the partner.
- Order states (accepted, sent, filled, rejected) and daily reconciliation against the broker.
- Containers with health checks and autoscaling, plus metrics, tracing and alerts.
- Database backups with a tested restore.

## 5. If you've used LLMs, describe how and where

Yes. I used Claude Code, an AI coding assistant that runs in the terminal, as a pair programmer. The core of the solution is mine; I used the assistant to move faster on the parts around it.

**What I did myself**

- **The splitting logic.** I defined how an order is split: allocate by weight in whole cents, hand leftover cents to the largest remainders, round quantities down, and reject amounts too small to trade.
- **Scaffolding.** I set up the monorepo (pnpm and Turborepo), the NestJS API and the Next.js console, and chose the controller / service / repository structure.
- **API design.** I defined the endpoints, the request and response shapes, the status codes and the error format.

**Where the assistant helped**

- **Tests.** It wrote most of the unit and end-to-end tests from the rules I gave it, which surfaced edge cases such as an empty allocation list and numbers losing precision in JSON.
- **Research.** It checked current package versions and how brokers handle fractional and dollar-based orders, so I could compare my rules with theirs.
- **Web console and docs.** It built much of the console UI and drafted the README, which I then edited.
- **Review.** I asked it to review the code more than once. That found real problems, for example the order history growing without limit in memory.

It saved the most time on tests and boilerplate. I reviewed what it produced and ran the checks myself before keeping it.
