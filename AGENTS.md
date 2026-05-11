# AGENTS.md

## Purpose

This repository is a TypeScript utility library for HTTP APIs and microservices. It mirrors the module coverage of `http_py`, but the internal layout follows a `src/modules` and `src/shared` split similar to the notifications microservice reference.

## Architecture

```text
package consumer
	-> src/index.ts
		 -> src/modules/*   for standalone capabilities
		 -> src/shared/*    for cross-cutting infrastructure
```

The design intent is:

- Put top-level reusable product capabilities in `src/modules`.
- Put infrastructure reused by multiple modules in `src/shared`.
- Keep the public package surface stable through `src/index.ts` even when internals move.

## Repository Layout

### Public Entry Points

| Path           | Role                                          |
| -------------- | --------------------------------------------- |
| `src/index.ts` | Package-level public API barrel               |
| `README.md`    | User-facing overview and development commands |

### Standalone Modules

| Path                         | Role                                                       |
| ---------------------------- | ---------------------------------------------------------- |
| `src/modules/cache`          | Cache interfaces and cache backend implementations         |
| `src/modules/e2e-testing`    | Isolated PostgreSQL test harness utilities                 |
| `src/modules/environment`    | Schema-driven environment loading and coercion             |
| `src/modules/exceptions`     | Request-aware exception handling and response builders     |
| `src/modules/hmac`           | HMAC signing and signature verification                    |
| `src/modules/rate-limiter`   | Rule lookup, count aggregation, and rate-limit enforcement |
| `src/modules/request-logger` | Console/database request logging helpers                   |

### Shared Infrastructure

| Path                  | Role                                                       |
| --------------------- | ---------------------------------------------------------- |
| `src/shared/context`  | Request-scoped context creation and attachment             |
| `src/shared/logging`  | Cached logger factory and structured log types             |
| `src/shared/postgres` | Writer/reader pool helpers and connection string utilities |
| `src/shared/requests` | Request extraction and request validation helpers          |
| `src/shared/utils`    | Protocol helpers and supporting utility areas              |

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
- Rate limiter: [src/modules/rate-limiter](src/modules/rate-limiter)
- Request logger: [src/modules/request-logger](src/modules/request-logger)
- Context: [src/shared/context](src/shared/context)
- Logging: [src/shared/logging](src/shared/logging)
- Postgres: [src/shared/postgres](src/shared/postgres)
- Requests: [src/shared/requests](src/shared/requests)
- Shared utils: [src/shared/utils](src/shared/utils)

## Working Rules

- Keep public exports stable through `src/index.ts`.
- Put top-level capabilities in `src/modules`.
- Put reusable infrastructure in `src/shared`.
- Keep AWS helpers in `src/shared/utils/aws`.
- Keep timeout-style helpers in `src/shared/utils/async`.
- Prefer colocated tests inside the owning folder.

## Validation

- `npm run lint`
- `npm run type-check`
- `npm run test`
- `npm run precommit`
