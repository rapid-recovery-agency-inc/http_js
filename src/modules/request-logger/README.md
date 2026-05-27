# Request Logger

Middleware for logging HTTP request and response metadata — either to the console or through an injected repository. The default Prisma repository stays schema-agnostic and keeps SQL out of the middleware layer.

## Why use it

- Provides a consistent audit trail of every inbound request including path, product metadata, headers, body, status code, and duration.
- Console variant is lightweight and needs no database — useful in development or low-volume services.
- Repository-backed variant persists structured rows that the rate-limiter can later query for count aggregation.
- A per-request UUID is attached to `request.state` and emitted as a response header so downstream handlers can correlate logs.

## Console logger middleware

```typescript
import { consoleRequestLoggerMiddleware } from 'http_js';

app.use(
  consoleRequestLoggerMiddleware(
    ['/health'], // path whitelist — not logged
  ),
);
// Emits: INFO  POST /api/users  { durationMs: 42, statusCode: 201 }
```

## Repository-backed logger middleware

```typescript
import { databaseRequestLoggerMiddleware } from 'http_js';

app.use(
  databaseRequestLoggerMiddleware(
    ['/health'],
    createServiceContext, // factory returning a Context with a writer repository
    null, // optional RequestLoggerOverride
    'myapp', // optional table prefix  → myapp_request_log
  ),
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

## Prisma repository

```typescript
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaRequestLoggerRepository } from 'http_js';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL! } },
});

const repository = new PrismaRequestLoggerRepository({
  client: prisma,
  sql: {
    sql: Prisma.sql,
    raw: Prisma.raw,
  },
  schemaName: 'public',
});
```

## Example schema

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
| `consoleRequestLoggerMiddleware`  | Express middleware factory for console logging   |
| `databaseRequestLoggerMiddleware` | Express middleware factory for persisted logging |
| `saveRequestLog`                  | Delegates a single request log row to a writer   |
| `PrismaRequestLoggerRepository`   | Default schema-agnostic Prisma repository        |
| `resolveRequestLoggerTableName`   | Builds the table name with optional prefix       |
| `DEFAULT_REQUEST_TABLE`           | Default table name: `'request_log'`              |
| `REQUEST_LOGGER_HEADER`           | Header name used to pass a logger hint           |
| `REQUEST_LOGGER_CACHE_HEADER`     | Header name used to indicate a cache hit         |
| `RequestLoggerArgs`               | Argument shape for `saveRequestLog`              |
| `RequestLogRecord`                | Persistence payload shape for repositories       |
| `RequestLoggerOverride`           | Fields that can be overridden before persistence |
| `RequestLoggerContextLike`        | Minimal context shape required by this module    |
