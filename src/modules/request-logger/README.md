# Request Logger

Middleware for logging HTTP request and response metadata — either to the console or to a PostgreSQL table. Other modules (e.g. rate-limiter) query this table to aggregate request counts.

## Why use it

- Provides a consistent audit trail of every inbound request including path, product metadata, headers, body, status code, and duration.
- Console variant is lightweight and needs no database — useful in development or low-volume services.
- Database variant persists structured rows that the rate-limiter queries for count aggregation.
- A per-request UUID is attached to `request.state` so downstream handlers can correlate logs.

## Console logger middleware

```typescript
import { consoleRequestLoggerMiddleware } from 'http_js';

const response = await consoleRequestLoggerMiddleware(
  ['/health'], // path whitelist — not logged
  request,
  callNext,
);
// Emits: INFO  POST /api/users  { durationMs: 42, statusCode: 201 }
```

## Database logger middleware

```typescript
import { databaseRequestLoggerMiddleware } from 'http_js';

const response = await databaseRequestLoggerMiddleware(
  ['/health'],
  request,
  callNext,
  createServiceContext, // factory returning a Context with a writer pool
  null, // optional RequestLoggerOverride
  'myapp', // optional table prefix  → myapp_request_log
);
```

## Overriding request metadata

Use an override to scrub or replace fields before persistence:

```typescript
import type { RequestLoggerOverride } from 'http_js';

const override: RequestLoggerOverride = {
  requestBody: '<redacted>',
  productName: 'internal-tool',
};
```

## Saving a log entry directly

```typescript
import { saveRequestLog } from 'http_js';

await saveRequestLog(
  {
    ctx,
    path: '/api/events',
    productName: 'myapp',
    productModule: 'events',
    productFeature: 'list',
    productTenant: 'tenant-1',
    fromCache: false,
    requestHeaders: JSON.stringify(headers),
    requestBody: body,
    responseHeaders: '{}',
    responseBody: responseText,
    statusCode: 200,
    durationMs: 38,
    requestUuid: 'abc-123',
  },
  'myapp', // table prefix
);
```

## Resolving the table name

```typescript
import { resolveRequestLoggerTableName, DEFAULT_REQUEST_TABLE } from 'http_js';

const table = resolveRequestLoggerTableName(DEFAULT_REQUEST_TABLE, 'myapp');
// 'myapp_request_log'
```

## Database schema

```sql
CREATE TABLE request_log (
  id               SERIAL PRIMARY KEY,
  path             TEXT NOT NULL,
  product_name     TEXT,
  product_module   TEXT,
  product_feature  TEXT,
  product_tenant   TEXT,
  from_cache       BOOLEAN NOT NULL,
  request_headers  TEXT,
  request_body     TEXT,
  response_headers TEXT,
  response_body    TEXT,
  status_code      INTEGER NOT NULL,
  duration_ms      INTEGER,
  request_uuid     UUID,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
```

## API

| Export                            | Description                                      |
| --------------------------------- | ------------------------------------------------ |
| `consoleRequestLoggerMiddleware`  | Logs request + duration to the console           |
| `databaseRequestLoggerMiddleware` | Persists request metadata to PostgreSQL          |
| `saveRequestLog`                  | Inserts a single request log row                 |
| `resolveRequestLoggerTableName`   | Builds the table name with optional prefix       |
| `DEFAULT_REQUEST_TABLE`           | Default table name: `'request_log'`              |
| `REQUEST_LOGGER_HEADER`           | Header name used to pass a logger hint           |
| `REQUEST_LOGGER_CACHE_HEADER`     | Header name used to indicate a cache hit         |
| `RequestLoggerArgs`               | Argument shape for `saveRequestLog`              |
| `RequestLoggerOverride`           | Fields that can be overridden before persistence |
| `RequestLoggerNext`               | Type for the downstream `callNext` handler       |
| `RequestLoggerContextLike`        | Minimal context shape required by this module    |
| `RequestLoggerResponseLike`       | Response shape expected from `callNext`          |
