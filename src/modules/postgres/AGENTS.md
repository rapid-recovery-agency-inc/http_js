# Postgres Module

## Purpose

This module provides PostgreSQL connection string builders and cached reader/writer pool factories. It is a first-class library feature for managing database connectivity, used by application code as well as internally by the cache, request logger, and rate limiter modules.

## Architecture

```text
Postgres environment
	-> connection string helpers
		 -> cached writer pool
		 -> cached reader pools
```

## File Structure

| File                | Role                                               |
| ------------------- | -------------------------------------------------- |
| `../../../index.ts` | Root package export surface for this module        |
| `services.ts`       | Pool creation, caching, warm-up, and cleanup logic |
| `postgres.test.ts`  | Module tests                                       |

## Key Responsibilities

- Build writer and reader connection strings.
- Create and cache `pg.Pool` instances.
- Expose warm-up and cleanup helpers.

## Dependencies

- Depends on: [../logging](../logging)
- Used across: [../cache](../cache), [../request-logger](../request-logger), [../rate-limiter](../rate-limiter)
- Parent guide: [../../../AGENTS.md](../../../AGENTS.md)
- Root README: [../../../README.md](../../../README.md)

## Navigation

- Public exports: [../../../index.ts](../../../index.ts)
- Main implementation: [services.ts](services.ts)
- Tests: [postgres.test.ts](postgres.test.ts)
