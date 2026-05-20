# Postgres

Cached PostgreSQL connection pool management for writer and reader hosts. Provides typed connection string builders and lifecycle helpers (warm-up, cleanup) on top of the `pg` library.

## Why use it

- Pools are created once and cached in-process — no reconnect overhead on repeated calls.
- Separates writer and reader pools by convention, matching a primary/replica database topology.
- `DB_READER_HOSTS` supports multiple comma-separated replicas; a random one is selected per call.
- `warmUpConnectionsPools` pre-connects all pools at startup so the first real request is not delayed.
- `resetPostgresPoolCache` lets tests reset pool state cleanly between suites.

## Environment variables

```typescript
import type { PostgresEnvironment } from 'http_js';

const env: PostgresEnvironment = {
  DB_NAME: 'mydb',
  DB_USERNAME: 'app',
  DB_PASSWORD: 'secret',
  DB_WRITER_HOST: 'db-primary.internal',
  DB_READER_HOSTS: 'db-replica-1.internal,db-replica-2.internal',
  DB_PORT: '5432',
  DB_MAX_POOL_SIZE: 10,
  DB_MIN_POOL_SIZE: 2,
  DB_POOL_MAX_IDLE_TIME_SECONDS: 30,
  DB_POOL_TIMEOUT: 5,
};
```

## Getting pools

```typescript
import {
  getAsyncWriterConnectionPool,
  getSyncWriterConnectionPool,
  getAsyncReadersConnectionPools,
  getRandomReaderConnectionPool,
} from 'http_js';

// Primary writer pool (async pg.Pool)
const writer = getAsyncWriterConnectionPool(env);
await writer.query('INSERT INTO events ...', []);

// Reader — randomly selected from the replica list
const reader = getRandomReaderConnectionPool(env);
const result = await reader.query('SELECT * FROM events WHERE id = $1', [id]);
```

## Warm-up at startup

```typescript
import { warmUpConnectionsPools } from 'http_js';

// Call once at application startup to pre-connect all pools
await warmUpConnectionsPools(env);
```

## Cleanup on shutdown

```typescript
import { cleanupConnectionsPools } from 'http_js';

process.on('SIGTERM', async () => {
  await cleanupConnectionsPools();
  process.exit(0);
});
```

## Connection strings

```typescript
import {
  createWriterConnectionString,
  createReaderConnectionString,
} from 'http_js';

const writerUrl = createWriterConnectionString(env);
// postgresql://app:secret@db-primary.internal:5432/mydb

const readerUrl = createReaderConnectionString(env, 'db-replica-1.internal');
// postgresql://app:secret@db-replica-1.internal:5432/mydb
```

## Testing

```typescript
import { resetPostgresPoolCache } from 'http_js';

afterEach(() => resetPostgresPoolCache());
```

## API

| Export                           | Description                                               |
| -------------------------------- | --------------------------------------------------------- |
| `getAsyncWriterConnectionPool`   | Returns (or creates) the cached async writer pool         |
| `getSyncWriterConnectionPool`    | Returns (or creates) the cached sync writer pool          |
| `getAsyncReadersConnectionPools` | Returns (or creates) all cached async reader pools        |
| `getRandomReaderConnectionPool`  | Returns a randomly selected reader pool                   |
| `warmUpConnectionsPools`         | Pre-connects all cached pools                             |
| `cleanupConnectionsPools`        | Ends all pool connections and clears the cache            |
| `resetPostgresPoolCache`         | Clears the in-memory pool cache (testing)                 |
| `createWriterConnectionString`   | Builds a writer `postgresql://` connection URL            |
| `createReaderConnectionString`   | Builds a reader `postgresql://` connection URL for a host |
| `PostgresEnvironment`            | Interface for the DB\_\* environment variables            |
| `PostgresPool`                   | `pg.Pool` extended with optional `open` and `wait` hooks  |
