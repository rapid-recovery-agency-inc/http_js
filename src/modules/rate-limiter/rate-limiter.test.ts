import { Context } from '../../shared/context/services.js';
import type { ContextRequestLike } from '../../shared/context/services.js';
import type { PostgresPool } from '../../shared/postgres/services.js';

import { RULE_CACHING_EXPIRATION_IN_SECONDS } from './constants.js';
import { rateLimiterMiddleware } from './services.js';
import { RateLimitException } from './types.js';
import {
  assertCapacity,
  fetchRateLimiterCount,
  fetchRateLimiterDailyCount,
  fetchRateLimiterHourlyCount,
  fetchRateLimiterMonthlyCount,
  fetchRateLimiterRule,
  resetRateLimiterCache,
} from './utils.js';

class MockPool {
  public readonly query = jest.fn<
    Promise<{ rowCount: number | null; rows: unknown[] }>,
    [string, unknown[]?]
  >();
}

function createRequest(): ContextRequestLike {
  return {
    headers: { toString: () => '{}' },
    method: 'POST',
    queryParams: { get: () => null },
    async text(): Promise<string> {
      return JSON.stringify({
        product_name: 'api',
        product_module: 'notifications',
        product_feature: 'send',
        product_tenant: 'tenant-a',
      });
    },
    url: { path: '/notifications' },
    state: {},
  };
}

describe('rate limiter', () => {
  beforeEach(() => {
    resetRateLimiterCache();
  });

  it('exports the default cache expiration', () => {
    expect(RULE_CACHING_EXPIRATION_IN_SECONDS).toBe(300);
  });

  it('fetches a rate limiter rule and caches it', async () => {
    const pool = new MockPool();
    pool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          path: '/notifications',
          product_name: 'api',
          daily_limit: 100,
          monthly_limit: 1000,
          hourly_limit: 10,
        },
      ],
    });
    const ctx = new Context({
      env: {},
      writerPool: pool as unknown as PostgresPool,
      readerPools: [pool as unknown as PostgresPool],
      request: createRequest(),
      selectReader: (readers) => readers[0]!,
    });

    await expect(
      fetchRateLimiterRule(
        {
          path: '/notifications',
          requestHeaders: '{}',
          requestBody: '{}',
          productName: 'api',
          productModule: 'notifications',
          productFeature: 'send',
          productTenant: 'tenant-a',
        },
        ctx,
      ),
    ).resolves.toEqual({
      path: '/notifications',
      productName: 'api',
      dailyLimit: 100,
      monthlyLimit: 1000,
      hourlyLimit: 10,
    });
  });

  it('fetches monthly, daily, and hourly counts', async () => {
    const pool = new MockPool();
    pool.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '30' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '12' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '2' }] });
    const ctx = new Context({
      env: {},
      writerPool: pool as unknown as PostgresPool,
      readerPools: [pool as unknown as PostgresPool],
      request: createRequest(),
      selectReader: (readers) => readers[0]!,
    });
    const args = {
      path: '/notifications',
      requestHeaders: '{}',
      requestBody: '{}',
      productName: 'api',
      productModule: 'notifications',
      productFeature: 'send',
      productTenant: 'tenant-a',
    };

    await expect(fetchRateLimiterMonthlyCount(args, ctx)).resolves.toBe(30);
    await expect(fetchRateLimiterDailyCount(args, ctx)).resolves.toBe(12);
    await expect(fetchRateLimiterHourlyCount(args, ctx)).resolves.toBe(2);
  });

  it('fetches and caches aggregate counts', async () => {
    const pool = new MockPool();
    pool.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '30' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '12' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '2' }] });
    const ctx = new Context({
      env: {},
      writerPool: pool as unknown as PostgresPool,
      readerPools: [pool as unknown as PostgresPool],
      request: createRequest(),
      selectReader: (readers) => readers[0]!,
    });

    await expect(
      fetchRateLimiterCount(
        {
          path: '/notifications',
          requestHeaders: '{}',
          requestBody: '{}',
          productName: 'api',
          productModule: 'notifications',
          productFeature: 'send',
          productTenant: 'tenant-a',
        },
        ctx,
      ),
    ).resolves.toEqual({
      path: '/notifications',
      productName: 'api',
      monthlyCount: 30,
      dailyCount: 12,
      hourlyCount: 2,
    });
  });

  it('throws when limits are exceeded', async () => {
    const pool = new MockPool();
    pool.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            path: '/notifications',
            product_name: 'api',
            daily_limit: 100,
            monthly_limit: 1000,
            hourly_limit: 1,
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '30' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '12' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '2' }] });
    const ctx = new Context({
      env: {},
      writerPool: pool as unknown as PostgresPool,
      readerPools: [pool as unknown as PostgresPool],
      request: createRequest(),
      selectReader: (readers) => readers[0]!,
    });

    await expect(
      assertCapacity(
        {
          path: '/notifications',
          requestHeaders: '{}',
          requestBody: '{}',
          productName: 'api',
          productModule: 'notifications',
          productFeature: 'send',
          productTenant: 'tenant-a',
        },
        ctx,
      ),
    ).rejects.toThrow(RateLimitException);
  });

  it('returns 429 from middleware when a rate limit is hit', async () => {
    const pool = new MockPool();
    pool.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            path: '/notifications',
            product_name: 'api',
            daily_limit: 100,
            monthly_limit: 1000,
            hourly_limit: 1,
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '30' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '12' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '2' }] });
    const request = createRequest();

    const response = await rateLimiterMiddleware(
      [],
      request,
      async () => ({ statusCode: 200, headers: {}, body: 'ok' }),
      (currentRequest) =>
        new Context({
          env: {},
          writerPool: pool as unknown as PostgresPool,
          readerPools: [pool as unknown as PostgresPool],
          request: currentRequest,
          selectReader: (readers) => readers[0]!,
        }),
    );

    expect(response.statusCode).toBe(429);
  });
});
