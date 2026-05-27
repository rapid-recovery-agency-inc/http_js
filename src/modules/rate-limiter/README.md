# Rate Limiter

Per-product, per-path rate limiting with hourly, daily, and monthly windows. Rules and counts are resolved through an injected repository so the module stays schema-agnostic while caching remains in-process for hot paths.

## Why use it

- Prevents individual products or tenants from consuming a disproportionate share of API capacity.
- Rules live behind a repository — adjust storage details without changing middleware code.
- Counts are cached in-memory for `RULE_CACHING_EXPIRATION_IN_SECONDS` to avoid a database round-trip on every request.
- Exposes an Express-compatible middleware factory that sends a 429 response directly when capacity is exhausted.

## Middleware usage

```typescript
import {
  rateLimiterMiddleware,
  RULE_CACHING_EXPIRATION_IN_SECONDS,
} from 'http_js';

// Plug into your request pipeline
app.use(
  rateLimiterMiddleware(
    ['/health', '/metrics'], // path whitelist — never rate-limited
    createServiceContext, // factory that builds a Context for the request
    RULE_CACHING_EXPIRATION_IN_SECONDS,
    'myapp', // optional table prefix (null = no prefix)
  ),
);
```

## Direct capacity assertion

```typescript
import { assertCapacity, fetchRateLimiterRule } from 'http_js';

const rule = await fetchRateLimiterRule(
  requestData,
  ctx,
  cacheExpiry,
  tablePrefix,
);
// throws RateLimitException if any window is exhausted
await assertCapacity(requestData, ctx, cacheExpiry, tablePrefix);
```

## Fetching counts individually

```typescript
import {
  fetchRateLimiterCount,
  fetchRateLimiterHourlyCount,
  fetchRateLimiterDailyCount,
  fetchRateLimiterMonthlyCount,
} from 'http_js';

const hourly = await fetchRateLimiterHourlyCount(requestData, ctx, tablePrefix);
const daily = await fetchRateLimiterDailyCount(requestData, ctx, tablePrefix);
```

## Resetting the cache

```typescript
import { resetRateLimiterCache } from 'http_js';

afterEach(() => resetRateLimiterCache());
```

## Prisma repository

```typescript
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaRateLimiterRepository } from 'http_js';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL! } },
});

const repository = new PrismaRateLimiterRepository({
  client: prisma,
  sql: {
    sql: Prisma.sql,
    raw: Prisma.raw,
  },
  schemaName: 'public',
});
```

## Example schema

The module expects two tables (optionally prefixed):

**`rate_limiter_rule`**

| Column          | Type      |
| --------------- | --------- |
| `path`          | `TEXT`    |
| `product_name`  | `TEXT`    |
| `hourly_limit`  | `INTEGER` |
| `daily_limit`   | `INTEGER` |
| `monthly_limit` | `INTEGER` |

**`request_log`** (from the `request-logger` module — counts are queried against this table)

## API

| Export                               | Description                                              |
| ------------------------------------ | -------------------------------------------------------- |
| `rateLimiterMiddleware`              | Express middleware factory that enforces limits          |
| `assertCapacity`                     | Throws `RateLimitException` when any window is exhausted |
| `fetchRateLimiterRule`               | Fetches and caches the rule for a path + product         |
| `fetchRateLimiterCount`              | Fetches aggregate counts across all windows              |
| `fetchRateLimiterHourlyCount`        | Fetches hourly request count                             |
| `fetchRateLimiterDailyCount`         | Fetches daily request count                              |
| `fetchRateLimiterMonthlyCount`       | Fetches monthly request count                            |
| `resetRateLimiterCache`              | Clears in-memory rule and count caches (testing)         |
| `PrismaRateLimiterRepository`        | Default schema-agnostic Prisma repository                |
| `RateLimitException`                 | Thrown when capacity is exceeded                         |
| `RateLimiterRepositoryLike`          | Repository contract consumed by the rate limiter         |
| `RateLimiterRule`                    | Rule shape `{ path, productName, hourlyLimit, ... }`     |
| `RateLimiterRequestCount`            | Count shape `{ path, productName, hourlyCount, ... }`    |
| `RULE_CACHING_EXPIRATION_IN_SECONDS` | Default rule cache TTL                                   |
