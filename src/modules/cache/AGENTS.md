# Cache Module

## Purpose

This module provides the package cache abstractions and implementations. It includes a synchronous in-memory cache plus asynchronous PostgreSQL and Redis-backed variants behind common cache interfaces.

## Architecture

```text
consumer
	-> Cache / AsyncCache contracts
		 -> InMemoryCache
		 -> DatabaseCache
		 -> RedisCache
```

The module is treated as a standalone capability under `src/modules` because users may consume cache support directly, even though some implementations depend on shared infrastructure.

## File Structure

| File                 | Role                                              |
| -------------------- | ------------------------------------------------- |
| `../../../index.ts`  | Root package export surface for this module       |
| `types.ts`           | Shared cache interfaces and async cache contracts |
| `models.ts`          | Internal cache item model                         |
| `utils.ts`           | TTL and validity helpers                          |
| `in-memory-cache.ts` | Synchronous in-memory cache implementation        |
| `database-cache.ts`  | PostgreSQL-backed async cache implementation      |
| `redis-cache.ts`     | Redis-backed async cache implementation           |
| `cache.test.ts`      | Module tests                                      |

## Key Responsibilities

- Define stable cache interfaces.
- Support time-based expiration across implementations.
- Keep backend-specific details inside each implementation.
- Reuse shared PostgreSQL helpers where database-backed behavior is needed.

## Dependencies

- Postgres module: [../postgres](../postgres)
- Parent guide: [../../../AGENTS.md](../../../AGENTS.md)
- Root README: [../../../README.md](../../../README.md)

## Navigation

- Public exports: [../../../index.ts](../../../index.ts)
- Tests: [cache.test.ts](cache.test.ts)
