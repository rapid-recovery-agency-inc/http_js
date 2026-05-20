# AGENTS.md

## Purpose

This repository is a TypeScript utility library for HTTP APIs and microservices. It mirrors the module coverage of `http_py`, but the internal layout follows a `src/modules` and `src/shared` split similar to the notifications microservice reference.

## Architecture

```text
package consumer
	-> src/index.ts
		 -> src/modules/*   for first-class library features
		 -> src/shared/*    for cross-cutting infrastructure primitives
```

The design intent is:

- Put first-class library features in `src/modules` — these are capabilities consumers import and use directly.
- Put lightweight infrastructure primitives in `src/shared` — these are request/context plumbing reused by multiple modules but not primary features in their own right.
- Keep the public package surface stable through `src/index.ts` even when internals move.

## Repository Layout

### Public Entry Points

| Path           | Role                                          |
| -------------- | --------------------------------------------- |
| `src/index.ts` | Package-level public API barrel               |
| `README.md`    | User-facing overview and development commands |

### Feature Modules

| Path                         | Role                                                       |
| ---------------------------- | ---------------------------------------------------------- |
| `src/modules/cache`          | Cache interfaces and cache backend implementations         |
| `src/modules/environment`    | Schema-driven environment loading and coercion             |
| `src/modules/exceptions`     | Request-aware exception handling and response builders     |
| `src/modules/hmac`           | HMAC signing and signature verification                    |
| `src/modules/prisma-retry`   | Prisma extension factory for retrying transient failures   |
| `src/modules/postgres`       | Writer/reader pool helpers and connection string utilities |
| `src/modules/rate-limiter`   | Rule lookup, count aggregation, and rate-limit enforcement |
| `src/modules/request-logger` | Console/database request logging helpers                   |

### Shared Infrastructure

| Path                     | Role                                              |
| ------------------------ | ------------------------------------------------- |
| `src/shared/context`     | Request-scoped context creation and attachment    |
| `src/shared/e2e-testing` | Isolated PostgreSQL test harness utilities        |
| `src/shared/logging`     | Structured logger factory with level filtering    |
| `src/shared/requests`    | Request extraction and request validation helpers |
| `src/shared/utils`       | Protocol helpers and supporting utility areas     |

## Navigation

- README: [README.md](README.md)
- Public API: [src/index.ts](src/index.ts)
- Modules root: [src/modules](src/modules)
- Shared root: [src/shared](src/shared)
- Cache: [src/modules/cache](src/modules/cache)
- E2E testing: [src/modules/e2e-testing](src/modules/e2e-testing)
- Environment: [src/modules/environment](src/modules/environment)
- Exceptions: [src/modules/exceptions](src/modules/exceptions)
- HMAC: [src/modules/hmac](src/modules/hmac)
- Prisma retry: [src/modules/prisma-retry](src/modules/prisma-retry)
- Postgres: [src/modules/postgres](src/modules/postgres)
- Rate limiter: [src/modules/rate-limiter](src/modules/rate-limiter)
- Request logger: [src/modules/request-logger](src/modules/request-logger)
- Context: [src/shared/context](src/shared/context)
- Logging: [src/shared/logging](src/shared/logging)
- Requests: [src/shared/requests](src/shared/requests)
- Shared utils: [src/shared/utils](src/shared/utils)

## Working Rules

- Keep public exports stable through `src/index.ts`.
- Put first-class library features in `src/modules`.
- Put cross-cutting infrastructure primitives in `src/shared`.
- Keep AWS helpers in `src/shared/utils/aws`.
- Keep timeout-style helpers in `src/shared/utils/async`.
- Prefer colocated tests inside the owning folder.

## Validation

- `npm run lint`
- `npm run type-check`
- `npm run test`
- `npm run precommit`
