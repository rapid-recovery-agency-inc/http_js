# Shared Postgres

## Purpose

This shared area provides PostgreSQL connection string builders and cached reader/writer pool factories. It is the main database infrastructure boundary used by the cache, request logger, and rate limiter modules.

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
| `../../../index.ts` | Root package export surface for this shared area   |
| `services.ts`       | Pool creation, caching, warm-up, and cleanup logic |
| `postgres.test.ts`  | Shared area tests                                  |

## Key Responsibilities

- Build writer and reader connection strings.
- Create and cache `pg.Pool` instances.
- Expose warm-up and cleanup helpers.
- Keep connection management separate from feature modules.

## Dependencies

- Used across: [../../modules/cache](../../modules/cache), [../../modules/request-logger](../../modules/request-logger), [../../modules/rate-limiter](../../modules/rate-limiter)
- Parent guide: [../../../AGENTS.md](../../../AGENTS.md)
- Root README: [../../../README.md](../../../README.md)

## Navigation

- Public exports: [../../../index.ts](../../../index.ts)
- Main implementation: [services.ts](services.ts)
- Tests: [postgres.test.ts](postgres.test.ts)
