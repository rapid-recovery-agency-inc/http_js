# Request Logger Module

## Purpose

This module provides request logging helpers for HTTP-style requests. It supports both console logging and injected repository-backed persistence, and it acts as the source of truth for request log table naming used by other modules such as the rate limiter.

## Architecture

```text
request
	-> consoleRequestLoggerMiddleware() or databaseRequestLoggerMiddleware()
		 -> adapt Express request/response
		 -> extract and validate request data
		 -> register response lifecycle hooks
		 -> persist request log through RequestLoggerPersistenceLike or emit console log
```

## File Structure

| File                     | Role                                               |
| ------------------------ | -------------------------------------------------- |
| `../../../index.ts`      | Root package export surface for this module        |
| `services.ts`            | Console and database request logger middleware     |
| `utils.ts`               | Table-name resolution and repository delegation    |
| `repositories.ts`        | Prisma-backed request log repository               |
| `types.ts`               | Middleware, persistence, and context-related types |
| `constants.ts`           | Request logger header and table constants          |
| `request-logger.test.ts` | Module tests                                       |

## Key Responsibilities

- Extract and validate request data before persistence.
- Attach a request UUID to logged requests.
- Adapt Express request/response objects without coupling the module to the `express` package.
- Keep middleware free of SQL by delegating persistence to repositories.
- Expose shared table resolution helpers for other modules.

## Dependencies

- Shared Context: [../../shared/context](../../shared/context)
- Shared Requests: [../../shared/requests](../../shared/requests)
- Logging module: [../logging](../logging)
- Prisma module: [../prisma](../prisma)
- Parent guide: [../../../AGENTS.md](../../../AGENTS.md)
- Root README: [../../../README.md](../../../README.md)

## Navigation

- Public exports: [../../../index.ts](../../../index.ts)
- Middleware layer: [services.ts](services.ts)
- Persistence helpers: [utils.ts](utils.ts)
- Repository layer: [repositories.ts](repositories.ts)
- Tests: [request-logger.test.ts](request-logger.test.ts)
