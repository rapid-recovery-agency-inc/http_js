import { Pool } from 'pg';

import { createLogger, LogLevel } from '../../shared/logging/services';

const logger = createLogger('postgres', { logLevel: LogLevel.DEBUG });

let asyncWriterCachedConnectionPool: PostgresPool | null = null;
let syncWriterCachedConnectionPool: PostgresPool | null = null;
let asyncReadersCachedConnectionPools: PostgresPool[] | null = null;

export interface PostgresEnvironment {
  DB_MAX_POOL_SIZE: number;
  DB_MIN_POOL_SIZE: number;
  DB_NAME: string;
  DB_PASSWORD: string;
  DB_POOL_MAX_IDLE_TIME_SECONDS: number;
  DB_POOL_TIMEOUT: number;
  DB_PORT: string;
  DB_READER_HOSTS: string;
  DB_USERNAME: string;
  DB_WRITER_HOST: string;
}

export interface PostgresPool extends Pool {
  open?: () => Promise<void> | void;
  wait?: () => Promise<void> | void;
}

function toPoolConfig(connectionString: string, env: PostgresEnvironment) {
  return {
    connectionString,
    idleTimeoutMillis: env.DB_POOL_MAX_IDLE_TIME_SECONDS * 1000,
    max: env.DB_MAX_POOL_SIZE,
    min: env.DB_MIN_POOL_SIZE,
    connectionTimeoutMillis: env.DB_POOL_TIMEOUT * 1000,
    allowExitOnIdle: false,
  };
}

function createPoolName(
  role: string,
  host: string,
  env: PostgresEnvironment,
): string {
  return `${role}:${host}:${env.DB_PORT}/${env.DB_NAME}`;
}

function createPool(
  connectionString: string,
  env: PostgresEnvironment,
  role: string,
  host: string,
): PostgresPool {
  const pool = new Pool(toPoolConfig(connectionString, env)) as PostgresPool;

  Object.defineProperty(pool, 'name', {
    value: createPoolName(role, host, env),
    configurable: true,
    enumerable: true,
    writable: false,
  });

  pool.open = async (): Promise<void> => {
    const client = await pool.connect();
    client.release();
  };
  pool.wait = async (): Promise<void> => undefined;

  return pool;
}

export function createWriterConnectionString(env: PostgresEnvironment): string {
  return `postgresql://${env.DB_USERNAME}:${env.DB_PASSWORD}@${env.DB_WRITER_HOST}:${env.DB_PORT}/${env.DB_NAME}`;
}

export function createReaderConnectionString(
  env: PostgresEnvironment,
  host: string,
): string {
  return `postgresql://${env.DB_USERNAME}:${env.DB_PASSWORD}@${host}:${env.DB_PORT}/${env.DB_NAME}`;
}

export function getAsyncWriterConnectionPool(
  env: PostgresEnvironment,
): PostgresPool {
  if (asyncWriterCachedConnectionPool !== null) {
    return asyncWriterCachedConnectionPool;
  }

  asyncWriterCachedConnectionPool = createPool(
    createWriterConnectionString(env),
    env,
    'writer-async',
    env.DB_WRITER_HOST,
  );

  return asyncWriterCachedConnectionPool;
}

export function getSyncWriterConnectionPool(
  env: PostgresEnvironment,
): PostgresPool {
  if (syncWriterCachedConnectionPool !== null) {
    return syncWriterCachedConnectionPool;
  }

  syncWriterCachedConnectionPool = createPool(
    createWriterConnectionString(env),
    env,
    'writer-sync',
    env.DB_WRITER_HOST,
  );

  return syncWriterCachedConnectionPool;
}

export function getAsyncReadersConnectionPools(
  env: PostgresEnvironment,
): PostgresPool[] {
  if (asyncReadersCachedConnectionPools !== null) {
    return asyncReadersCachedConnectionPools;
  }

  asyncReadersCachedConnectionPools = env.DB_READER_HOSTS.split(',')
    .map((host) => host.trim())
    .filter((host) => host.length > 0)
    .map((host) =>
      createPool(
        createReaderConnectionString(env, host),
        env,
        'reader-async',
        host,
      ),
    );

  return asyncReadersCachedConnectionPools;
}

export function getRandomReaderConnectionPool(
  env: PostgresEnvironment,
): PostgresPool {
  const pools = getAsyncReadersConnectionPools(env);

  if (pools.length === 0) {
    throw new Error('Postgres: reader connection pools cannot be empty');
  }

  return pools[Math.floor(Math.random() * pools.length)] as PostgresPool;
}

export async function warmUpConnectionsPools(
  env: PostgresEnvironment,
): Promise<void> {
  const pools = [
    getAsyncWriterConnectionPool(env),
    ...getAsyncReadersConnectionPools(env),
    getSyncWriterConnectionPool(env),
  ];

  logger.info('Opening connection pools', { poolCount: pools.length });

  for (const pool of pools) {
    logger.info('Opening connection pool', {
      name: (pool as PostgresPool & { name?: string }).name ?? 'unknown',
    });
    await pool.open?.();
    await pool.wait?.();
  }
}

export async function cleanupConnectionsPools(): Promise<void> {
  const pools = [
    asyncWriterCachedConnectionPool,
    syncWriterCachedConnectionPool,
    ...(asyncReadersCachedConnectionPools ?? []),
  ].filter((pool): pool is PostgresPool => pool !== null);

  await Promise.all(pools.map(async (pool) => pool.end()));

  asyncWriterCachedConnectionPool = null;
  syncWriterCachedConnectionPool = null;
  asyncReadersCachedConnectionPools = null;
}

export function resetPostgresPoolCache(): void {
  asyncWriterCachedConnectionPool = null;
  syncWriterCachedConnectionPool = null;
  asyncReadersCachedConnectionPools = null;
}
