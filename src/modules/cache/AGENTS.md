# Cache Module

## Purpose

This module provides the package cache abstractions and implementations. It includes a synchronous in-memory cache plus asynchronous repository-backed SQL and Redis variants behind common cache interfaces.

## Architecture

```text
consumer
	-> Cache / AsyncCache contracts
		 -> InMemoryCache
		 -> DatabaseCache
		    -> CacheRepository
		    -> PrismaCacheRepository
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
| `database-cache.ts`  | Repository-backed async cache implementation      |
| `repositories.ts`    | Cache repository interfaces and Prisma adapter    |
| `redis-cache.ts`     | Redis-backed async cache implementation           |
| `cache.test.ts`      | Module tests                                      |

## Key Responsibilities

- Define stable cache interfaces.
- Support time-based expiration across implementations.
- Keep backend-specific details inside each implementation.
- Keep service-level cache behavior free of raw SQL by delegating persistence to repositories.
- Provide a default Prisma raw-query repository without coupling to generated Prisma models.

## Dependencies

- Prisma module: [../prisma](../prisma)
- Parent guide: [../../../AGENTS.md](../../../AGENTS.md)
- Root README: [../../../README.md](../../../README.md)

## Navigation

- Public exports: [../../../index.ts](../../../index.ts)
- Repository layer: [repositories.ts](repositories.ts)
- Tests: [cache.test.ts](cache.test.ts)
