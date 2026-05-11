jest.mock('pg', () => {
  class MockPool {
    public readonly config: Record<string, unknown>;
    public end = jest.fn(async () => undefined);
    public connect = jest.fn(async () => ({
      release: jest.fn(),
    }));

    public constructor(config: Record<string, unknown>) {
      this.config = config;
    }
  }

  return { Pool: MockPool };
});

import {
  cleanupConnectionsPools,
  createReaderConnectionString,
  createWriterConnectionString,
  getAsyncReadersConnectionPools,
  getAsyncWriterConnectionPool,
  getRandomReaderConnectionPool,
  getSyncWriterConnectionPool,
  resetPostgresPoolCache,
  warmUpConnectionsPools,
  type PostgresPool,
} from './services.js';

type MockedPostgresPool = PostgresPool & {
  connect: jest.Mock;
  end: jest.Mock;
};

describe('postgres', () => {
  const env = {
    DB_USERNAME: 'postgres',
    DB_PASSWORD: 'secret',
    DB_WRITER_HOST: 'writer.db.internal',
    DB_READER_HOSTS: 'reader-a.db.internal,reader-b.db.internal',
    DB_PORT: '5432',
    DB_NAME: 'service_db',
    DB_POOL_TIMEOUT: 30,
    DB_MIN_POOL_SIZE: 1,
    DB_MAX_POOL_SIZE: 10,
    DB_POOL_MAX_IDLE_TIME_SECONDS: 300,
  };

  beforeEach(() => {
    resetPostgresPoolCache();
    jest.restoreAllMocks();
  });

  it('builds writer and reader connection strings', () => {
    expect(createWriterConnectionString(env)).toBe(
      'postgresql://postgres:secret@writer.db.internal:5432/service_db',
    );
    expect(createReaderConnectionString(env, 'reader-a.db.internal')).toBe(
      'postgresql://postgres:secret@reader-a.db.internal:5432/service_db',
    );
  });

  it('caches the async and sync writer pools independently', () => {
    const asyncWriterPool = getAsyncWriterConnectionPool(env);
    const asyncWriterPoolAgain = getAsyncWriterConnectionPool(env);
    const syncWriterPool = getSyncWriterConnectionPool(env);
    const syncWriterPoolAgain = getSyncWriterConnectionPool(env);

    expect(asyncWriterPool).toBe(asyncWriterPoolAgain);
    expect(syncWriterPool).toBe(syncWriterPoolAgain);
    expect(syncWriterPool).not.toBe(asyncWriterPool);
  });

  it('caches reader pools and returns all configured replicas', () => {
    const readerPools = getAsyncReadersConnectionPools(env);
    const readerPoolsAgain = getAsyncReadersConnectionPools(env);

    expect(readerPoolsAgain).toBe(readerPools);
    expect(readerPools).toHaveLength(2);
  });

  it('returns a random reader pool from the cached pool list', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.75);

    const readerPool = getRandomReaderConnectionPool(env);

    expect((readerPool as { name?: string }).name).toContain(
      'reader-b.db.internal',
    );
  });

  it('throws when no reader pools are configured', () => {
    expect(() =>
      getRandomReaderConnectionPool({
        ...env,
        DB_READER_HOSTS: '   ',
      }),
    ).toThrow('Postgres: reader connection pools cannot be empty');
  });

  it('warms up and cleans up all cached pools', async () => {
    const asyncWriterPool = getAsyncWriterConnectionPool(
      env,
    ) as unknown as MockedPostgresPool;
    const syncWriterPool = getSyncWriterConnectionPool(
      env,
    ) as unknown as MockedPostgresPool;
    const readerPools = getAsyncReadersConnectionPools(
      env,
    ) as unknown as MockedPostgresPool[];

    await warmUpConnectionsPools(env);

    expect(asyncWriterPool.connect).toHaveBeenCalledTimes(1);
    expect(syncWriterPool.connect).toHaveBeenCalledTimes(1);
    expect(readerPools[0]?.connect).toHaveBeenCalledTimes(1);
    expect(readerPools[1]?.connect).toHaveBeenCalledTimes(1);

    await cleanupConnectionsPools();

    expect(asyncWriterPool.end).toHaveBeenCalledTimes(1);
    expect(syncWriterPool.end).toHaveBeenCalledTimes(1);
    expect(readerPools[0]?.end).toHaveBeenCalledTimes(1);
    expect(readerPools[1]?.end).toHaveBeenCalledTimes(1);
  });
});
