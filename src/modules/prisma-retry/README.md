# Prisma Retry

Framework-agnostic Prisma extension factory that retries transient query failures with exponential backoff, optional jitter, and an optional per-operation timeout.

## Why use it

- Keeps retry behavior close to the Prisma client instead of scattering retry loops around services.
- Uses the consuming project's Prisma runtime, so the module can be shared across different applications without bundling a fixed `@prisma/client` version.
- Retries common transient connection, timeout, and deadlock failures while letting validation errors fail fast.
- Supports both model operations like `User.findMany()` and top-level operations like `$executeRaw()`.

## Usage

```typescript
import { PrismaClient, Prisma } from '@prisma/client';
import { PRISMA_RETRIES_OPTIONS_DEFAULTS, prismaRetryExtension } from 'http_js';

const writerPrisma = new PrismaClient({
  datasources: { db: { url: writeUrl } },
}).$extends(
  prismaRetryExtension(Prisma, {
    ...PRISMA_RETRIES_OPTIONS_DEFAULTS,
    timeout: PRISMA_CONNECTION_TIMEOUT,
  }),
);
```

The first argument is the Prisma runtime namespace from the consuming application. That keeps this package decoupled from a specific Prisma client version while still allowing Prisma-specific error detection.

## Default options

```typescript
import { PRISMA_RETRIES_OPTIONS_DEFAULTS } from 'http_js';

// {
//   maxAttempts: 3,
//   baseDelay: 100,
//   jitter: 100,
//   timeout: null,
// }
```

Pass only the overrides you need:

```typescript
const extension = prismaRetryExtension(Prisma, {
  maxAttempts: 5,
  timeout: 2_000,
});
```

## Low-level helpers

```typescript
import { calculateDelay, executeWithTimeout, shouldRetry } from 'http_js';

const delay = calculateDelay(1, 100, 25);
const retry = shouldRetry(new Error('connection timeout from database'));
const result = await executeWithTimeout(queryPromise, 1_000, 'User.findMany');
```

## API

| Export                            | Description                                                        |
| --------------------------------- | ------------------------------------------------------------------ |
| `prismaRetryExtension`            | Builds a Prisma extension that retries query operations            |
| `PRISMA_RETRIES_OPTIONS_DEFAULTS` | Default retry settings                                             |
| `shouldRetry`                     | Returns `true` for retryable transient errors                      |
| `calculateDelay`                  | Computes exponential backoff with jitter                           |
| `executeWithTimeout`              | Wraps a promise with an optional timeout                           |
| `createTimeoutPromise`            | Creates the timeout promise used by `executeWithTimeout`           |
| `PrismaRetryTimeoutError`         | Error thrown when an operation exceeds the configured timeout      |
| `RETRYABLE_ERROR_CODES`           | Prisma error codes treated as transient                            |
| `RETRYABLE_ERROR_MESSAGES`        | Message fragments treated as transient                             |
| `RetryOptions`                    | Retry settings shape                                               |
| `PrismaRetryRuntime`              | Minimal Prisma runtime contract expected by `prismaRetryExtension` |
