import { DatabaseCache } from '../database-cache';
import {
  DEFAULT_EXPIRATION_IN_SECONDS,
  InMemoryCache,
} from '../in-memory-cache';
import { PrismaCacheRepository } from '../repositories';
import { RedisCache } from '../redis-cache';
import { isCacheItemValid } from '../utils';

class MockPrismaClient {
  public readonly executeRawMock = jest.fn<Promise<number>, [string]>();
  public readonly queryRawMock = jest.fn<Promise<unknown[]>, [string]>();

  public async $executeRaw(statement: string): Promise<number> {
    return this.executeRawMock(statement);
  }

  public async $queryRaw<TResult>(statement: string): Promise<TResult> {
    return (await this.queryRawMock(statement)) as TResult;
  }
}

class MockSqlFactory {
  public raw(value: string): string {
    return value;
  }

  public sql(strings: TemplateStringsArray, ...values: unknown[]): string {
    return strings.reduce((output, segment, index) => {
      const value = values[index];
      return `${output}${segment}${stringifySqlValue(value)}`;
    }, '');
  }
}

class MockRedisClient {
  public readonly delete = jest.fn(async (...keys: string[]) => keys.length);
  public readonly decrby = jest.fn(
    async (_key: string, amount: number) => -amount,
  );
  public readonly exists = jest.fn(async () => 1);
  public readonly get = jest.fn<Promise<string | Buffer | null>, [string]>();
  public readonly incrby = jest.fn(
    async (_key: string, amount: number) => amount,
  );
  public readonly scan = jest.fn(async () => ({
    cursor: 0,
    keys: [] as string[],
  }));
  public readonly set = jest.fn(async () => 'OK');
  public readonly setex = jest.fn(async () => 'OK');
}

class MockCacheRepository {
  public readonly cleanupExpired = jest.fn(async () => 0);
  public readonly clear = jest.fn(async () => undefined);
  public readonly exists = jest.fn(async () => false);
  public readonly find = jest.fn(
    async () => null as { expiresAt: number | null; value: string } | null,
  );
  public readonly remove = jest.fn(async () => undefined);
  public readonly upsert = jest.fn(async () => undefined);
}

function stringifySqlValue(value: unknown): string {
  if (value === undefined) {
    return '';
  }
  if (Buffer.isBuffer(value)) {
    return '<buffer>';
  }
  return String(value);
}

describe('cache', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-11T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('exposes the default expiration constant', () => {
    expect(DEFAULT_EXPIRATION_IN_SECONDS).toBe(300);
  });

  it('stores and retrieves values from the in-memory cache', () => {
    const cache = new InMemoryCache<{ name: string }>();

    cache.set('user:1', { name: 'Alice' });

    expect(cache.get('user:1')).toEqual({ name: 'Alice' });
    expect(cache.exists('user:1')).toBe(true);
    expect(cache.itemsCount).toBe(1);
  });

  it('expires cached values after their ttl elapses', () => {
    const cache = new InMemoryCache<string>();

    cache.set('token', 'abc', 2);
    jest.advanceTimersByTime(2001);

    expect(cache.get('token')).toBeNull();
    expect(cache.exists('token')).toBe(false);
    expect(cache.itemsCount).toBe(0);
  });

  it('removes specific entries and can clear the cache', () => {
    const cache = new InMemoryCache<number>();

    cache.set('a', 1);
    cache.set('b', 2);
    cache.removeItem('a');

    expect(cache.get('a')).toBeNull();
    expect(cache.itemsCount).toBe(1);

    cache.clear();

    expect(cache.itemsCount).toBe(0);
  });

  it('rejects null and undefined values', () => {
    const cache = new InMemoryCache();

    expect(() => cache.set('null', null)).toThrow(
      'InMemoryCache: value cannot be null or undefined',
    );
    expect(() => cache.set('undefined', undefined)).toThrow(
      'InMemoryCache: value cannot be null or undefined',
    );
  });

  it('cleans expired entries when adding a new key at capacity', () => {
    const cache = new InMemoryCache<string>(1);

    cache.set('expired', 'value', 1);
    jest.advanceTimersByTime(1001);
    cache.set('fresh', 'value');

    expect(cache.exists('expired')).toBe(false);
    expect(cache.get('fresh')).toBe('value');
    expect(cache.itemsCount).toBe(1);
  });

  it('validates cache items by expiry time', () => {
    expect(
      isCacheItemValid({ value: 'active', expiresAt: Date.now() + 1000 }),
    ).toBe(true);
    expect(
      isCacheItemValid({ value: 'expired', expiresAt: Date.now() - 1000 }),
    ).toBe(false);
    expect(isCacheItemValid(null)).toBe(false);
  });

  it('delegates database cache behavior to an injected repository', async () => {
    const repository = new MockCacheRepository();
    const cache = new DatabaseCache<{ name: string }>(repository);

    repository.find.mockResolvedValueOnce({
      value: '{"name":"Alice"}',
      expiresAt: Math.floor(Date.now() / 1000) + 60,
    });
    repository.exists.mockResolvedValueOnce(true);
    repository.cleanupExpired.mockResolvedValueOnce(3);

    await cache.set('user:1', { name: 'Alice' }, 60);
    await expect(cache.get('user:1')).resolves.toEqual({ name: 'Alice' });
    await expect(cache.exists('user:1')).resolves.toBe(true);
    await cache.removeItem('user:1');
    await cache.clear();
    await expect(cache.cleanupExpired()).resolves.toBe(3);

    expect(repository.upsert).toHaveBeenCalledWith(
      'user:1',
      { name: 'Alice' },
      60,
    );
    expect(repository.remove).toHaveBeenCalledWith('user:1');
    expect(repository.clear).toHaveBeenCalledTimes(1);
  });

  it('removes expired database cache items on read', async () => {
    const repository = new MockCacheRepository();
    const cache = new DatabaseCache(repository);

    repository.find.mockResolvedValueOnce({
      value: '{"name":"Alice"}',
      expiresAt: Math.floor(Date.now() / 1000) - 1,
    });

    await expect(cache.get('user:1')).resolves.toBeNull();
    expect(repository.remove).toHaveBeenCalledWith('user:1');
  });

  it('uses prisma raw-query adapters with runtime table names', async () => {
    const client = new MockPrismaClient();
    const repository = new PrismaCacheRepository({
      client,
      sql: new MockSqlFactory(),
      tableName: 'cache_table',
    });
    const cache = new DatabaseCache<{ name: string }>({
      client,
      sql: new MockSqlFactory(),
      tableName: 'cache_table',
    });

    client.executeRawMock
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(3);
    client.queryRawMock
      .mockResolvedValueOnce([
        {
          value: '{"name":"Alice"}',
          expires_at: Math.floor(Date.now() / 1000) + 60,
        },
      ])
      .mockResolvedValueOnce([{ present: 1 }]);

    await cache.set('user:1', { name: 'Alice' }, 60);
    await expect(cache.get('user:1')).resolves.toEqual({ name: 'Alice' });
    await expect(repository.exists('user:1')).resolves.toBe(true);
    await repository.remove('user:1');
    await repository.clear();
    await expect(repository.cleanupExpired()).resolves.toBe(3);

    expect(client.executeRawMock.mock.calls[0]?.[0]).toContain(
      'INSERT INTO public.cache_table',
    );
    expect(client.queryRawMock.mock.calls[0]?.[0]).toContain(
      'SELECT value, expires_at',
    );
  });

  it('rejects invalid database cache inputs', async () => {
    const repository = new MockCacheRepository();
    const client = new MockPrismaClient();

    expect(
      () =>
        new PrismaCacheRepository({
          client,
          sql: new MockSqlFactory(),
          tableName: 'bad-table-name!',
        }),
    ).toThrow("Prisma: invalid table name 'bad-table-name!'");

    const cache = new DatabaseCache(repository);

    await expect(cache.set('user:1', null as never)).rejects.toThrow(
      'DatabaseCache: value cannot be null or undefined',
    );
  });

  it('stores and reads redis cache values with prefix namespacing', async () => {
    const client = new MockRedisClient();
    const cache = new RedisCache<{ name: string }>(client, 'myapp:');

    client.get.mockResolvedValueOnce('{"name":"Alice"}');

    await cache.set('user:1', { name: 'Alice' }, 60);
    const value = await cache.get('user:1');

    expect(client.setex).toHaveBeenCalledWith({
      name: 'myapp:user:1',
      time: 60,
      value: '{"name":"Alice"}',
    });
    expect(client.get).toHaveBeenCalledWith('myapp:user:1');
    expect(value).toEqual({ name: 'Alice' });
  });

  it('returns raw redis strings when the value is not json', async () => {
    const client = new MockRedisClient();
    const cache = new RedisCache<string>(client);

    client.get.mockResolvedValueOnce('plain-text');

    await expect(cache.get('message')).resolves.toBe('plain-text');
  });

  it('supports redis key existence, deletion, clear, nx, increment, and decrement', async () => {
    const client = new MockRedisClient();
    const cache = new RedisCache(client, 'cache:');

    client.scan
      .mockResolvedValueOnce({ cursor: 1, keys: ['cache:a', 'cache:b'] })
      .mockResolvedValueOnce({ cursor: 0, keys: [] });

    await expect(cache.exists('counter')).resolves.toBe(true);
    await cache.removeItem('counter');
    await cache.clear();
    await expect(cache.setWithNx('lock', { worker: 'abc' }, 30)).resolves.toBe(
      true,
    );
    await expect(cache.increment('counter', 5)).resolves.toBe(5);
    await expect(cache.decrement('counter', 2)).resolves.toBe(-2);

    expect(client.delete).toHaveBeenCalledWith('cache:counter');
    expect(client.delete).toHaveBeenCalledWith('cache:a', 'cache:b');
    expect(client.set).toHaveBeenCalledWith({
      name: 'cache:lock',
      value: '{"worker":"abc"}',
      ex: 30,
      nx: true,
    });
  });

  it('rejects nullish redis values', async () => {
    const client = new MockRedisClient();
    const cache = new RedisCache(client);

    await expect(cache.set('user:1', null as never)).rejects.toThrow(
      'RedisCache: value cannot be null or undefined',
    );
    await expect(cache.setWithNx('lock', undefined as never)).rejects.toThrow(
      'RedisCache: value cannot be null or undefined',
    );
  });
});
