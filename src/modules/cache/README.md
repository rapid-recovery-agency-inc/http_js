# Cache

Backend-agnostic cache interfaces with three ready-to-use implementations: in-memory, PostgreSQL, and Redis.

## Why use it

- Provides a single `Cache` / `AsyncCache` interface so you can swap backends without changing call sites.
- In-memory variant needs no external service — good for test doubles and lightweight caching within a process.
- Database-backed variant reuses your existing PostgreSQL pool — no extra infrastructure.
- Redis variant is suitable for distributed, multi-process caching.

## Interfaces

```typescript
import type { Cache, AsyncCache } from 'http_js';

// Synchronous (in-memory only)
interface Cache<TValue> {
  exists(key: string): boolean;
  get(key: string): TValue | null;
  set(key: string, value: TValue, expirationInSeconds?: number): void;
  removeItem(key: string): void;
  clear(): void;
}

// Asynchronous (PostgreSQL or Redis)
interface AsyncCache<TValue> {
  exists(key: string): Promise<boolean>;
  get(key: string): Promise<TValue | null>;
  set(key: string, value: TValue, expirationInSeconds?: number): Promise<void>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
}
```

## Usage

### In-memory cache

```typescript
import { InMemoryCache, DEFAULT_EXPIRATION_IN_SECONDS } from 'http_js';

const cache = new InMemoryCache<string>();

cache.set('key', 'hello', 60); // expires in 60 s
cache.get('key'); // 'hello'
cache.exists('key'); // true
cache.removeItem('key');
```

### PostgreSQL-backed cache

Requires a `PostgresPool` and a `cache` table with columns `key TEXT PRIMARY KEY`, `value TEXT`, `expires_at BIGINT`.

```typescript
import { DatabaseCache } from 'http_js';
import { getAsyncWriterConnectionPool } from 'http_js';

const pool = getAsyncWriterConnectionPool(env);
const cache = new DatabaseCache<Record<string, unknown>>(pool);

await cache.set('session:abc', { userId: 1 }, 3600);
const value = await cache.get('session:abc');
```

### Redis-backed cache

```typescript
import { RedisCache } from 'http_js';
import { createClient } from 'redis';

const client = createClient({ url: process.env.REDIS_URL });
await client.connect();

const cache = new RedisCache<string>(client);
await cache.set('token:xyz', 'data', 300);
```

### Checking expiry

```typescript
import { isCacheItemValid } from 'http_js';

// Low-level helper used internally; useful when working with raw CacheItem values
const valid = isCacheItemValid(item);
```

## API

| Export                          | Description                                  |
| ------------------------------- | -------------------------------------------- |
| `InMemoryCache`                 | Synchronous in-process LRU-style cache       |
| `DatabaseCache`                 | PostgreSQL-backed async cache                |
| `RedisCache`                    | Redis-backed async cache                     |
| `isCacheItemValid`              | Checks whether a `CacheItem` has not expired |
| `DEFAULT_EXPIRATION_IN_SECONDS` | Default TTL (300 s)                          |
| `Cache`                         | Synchronous cache interface                  |
| `AsyncCache`                    | Asynchronous cache interface                 |
| `CacheItem`                     | Internal model type for cache entries        |
