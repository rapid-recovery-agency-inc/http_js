# Request Logger Module

## Purpose

This module provides request logging helpers for HTTP-style requests. It supports both console logging and database persistence, and it acts as the source of truth for the request log table naming used by other modules such as the rate limiter.

## Architecture

```text
request
	-> consoleRequestLoggerMiddleware() or databaseRequestLoggerMiddleware()
		 -> extract and validate request data
		 -> call downstream handler
		 -> persist request log or emit console log
```

## File Structure

| File                     | Role                                              |
| ------------------------ | ------------------------------------------------- |
| `../../../index.ts`      | Root package export surface for this module       |
| `services.ts`            | Console and database request logger middleware    |
| `utils.ts`               | Table-name resolution and request log persistence |
| `types.ts`               | Middleware and context-related types              |
| `constants.ts`           | Request logger header and table constants         |
| `request-logger.test.ts` | Module tests                                      |

## Key Responsibilities

- Extract and validate request data before persistence.
- Attach a request UUID to logged requests.
- Write request/response metadata to PostgreSQL.
- Expose shared table resolution helpers for other modules.

## Dependencies

- Shared Context: [../../shared/context](../../shared/context)
- Shared Requests: [../../shared/requests](../../shared/requests)
- Logging module: [../logging](../logging)
- Postgres module: [../postgres](../postgres)
- Parent guide: [../../../AGENTS.md](../../../AGENTS.md)
- Root README: [../../../README.md](../../../README.md)

## Navigation

- Public exports: [../../../index.ts](../../../index.ts)
- Middleware layer: [services.ts](services.ts)
- Persistence helpers: [utils.ts](utils.ts)
- Tests: [request-logger.test.ts](request-logger.test.ts)
