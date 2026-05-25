import type { ServiceContext } from '../../../shared/context/services';
import type {
  ExpressNextFunction,
  ExpressRequestLike,
  ExpressResponseLike,
} from '../../../shared/express/services';

import { RULE_CACHING_EXPIRATION_IN_SECONDS } from '../constants';
import { PrismaRateLimiterRepository } from '../repositories';
import { rateLimiterMiddleware } from '../services';
import { RateLimitException, type RateLimiterRule } from '../types';
import {
  assertCapacity,
  fetchRateLimiterCount,
  fetchRateLimiterDailyCount,
  fetchRateLimiterHourlyCount,
  fetchRateLimiterMonthlyCount,
  fetchRateLimiterRule,
  resetRateLimiterCache,
} from '../utils';
import type { RateLimiterRepositoryLike } from '../types';

class MockRateLimiterRepository implements RateLimiterRepositoryLike {
  public readonly fetchDailyCountMock = jest.fn<
    Promise<number>,
    [unknown, string, (string | null)?]
  >();
  public readonly fetchHourlyCountMock = jest.fn<
    Promise<number>,
    [unknown, string, (string | null)?]
  >();
  public readonly fetchMonthlyCountMock = jest.fn<
    Promise<number>,
    [unknown, string, (string | null)?]
  >();
  public readonly fetchRuleMock = jest.fn<
    Promise<RateLimiterRule | null>,
    [unknown, (string | null)?]
  >();

  public async fetchDailyCount(
    args: unknown,
    dayStart: string,
    tablePrefix?: string | null,
  ): Promise<number> {
    return this.fetchDailyCountMock(args, dayStart, tablePrefix);
  }

  public async fetchHourlyCount(
    args: unknown,
    hourStart: string,
    tablePrefix?: string | null,
  ): Promise<number> {
    return this.fetchHourlyCountMock(args, hourStart, tablePrefix);
  }

  public async fetchMonthlyCount(
    args: unknown,
    monthStart: string,
    tablePrefix?: string | null,
  ): Promise<number> {
    return this.fetchMonthlyCountMock(args, monthStart, tablePrefix);
  }

  public async fetchRule(
    args: unknown,
    tablePrefix?: string | null,
  ): Promise<RateLimiterRule | null> {
    return this.fetchRuleMock(args, tablePrefix);
  }
}

class MockPrismaClient {
  public readonly executeRawMock = jest.fn<Promise<number>, [string]>(
    async () => 0,
  );
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
      return `${output}${segment}${value === undefined ? '' : String(value)}`;
    }, '');
  }
}

class MockExpressResponse implements ExpressResponseLike {
  public statusCode = 200;
  public readonly finishListeners: Array<() => void> = [];
  public readonly closeListeners: Array<() => void> = [];
  public readonly headers = new Map<string, unknown>();
  public body: unknown = undefined;

  public end(body?: unknown): ExpressResponseLike {
    if (body !== undefined) {
      this.body = body;
    }

    return this;
  }

  public getHeader(name: string): unknown {
    return this.headers.get(name.toLowerCase());
  }

  public getHeaders(): Record<string, unknown> {
    return Object.fromEntries(this.headers.entries());
  }

  public json(body: unknown): ExpressResponseLike {
    this.body = body;
    return this;
  }

  public on(
    event: 'close' | 'finish',
    listener: () => void,
  ): ExpressResponseLike {
    if (event === 'finish') {
      this.finishListeners.push(listener);
    } else {
      this.closeListeners.push(listener);
    }

    return this;
  }

  public send(body?: unknown): ExpressResponseLike {
    this.body = body;
    return this;
  }

  public setHeader(
    name: string,
    value: number | string | readonly string[],
  ): void {
    this.headers.set(name.toLowerCase(), value);
  }

  public status(code: number): ExpressResponseLike {
    this.statusCode = code;
    return this;
  }
}

function createExpressRequest(): ExpressRequestLike {
  return {
    headers: {},
    method: 'POST',
    body: {
      product_name: 'api',
      product_module: 'notifications',
      product_feature: 'send',
      product_tenant: 'tenant-a',
    },
    path: '/notifications',
    query: {},
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
    const repository = new MockRateLimiterRepository();
    repository.fetchRuleMock.mockResolvedValueOnce({
      path: '/notifications',
      productName: 'api',
      dailyLimit: 100,
      monthlyLimit: 1000,
      hourlyLimit: 10,
    });
    const ctx: ServiceContext<
      RateLimiterRepositoryLike,
      RateLimiterRepositoryLike
    > = {
      writer: repository,
      reader: repository,
    };

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
    const repository = new MockRateLimiterRepository();
    repository.fetchMonthlyCountMock.mockResolvedValueOnce(30);
    repository.fetchDailyCountMock.mockResolvedValueOnce(12);
    repository.fetchHourlyCountMock.mockResolvedValueOnce(2);
    const ctx: ServiceContext<
      RateLimiterRepositoryLike,
      RateLimiterRepositoryLike
    > = {
      writer: repository,
      reader: repository,
    };
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
    const repository = new MockRateLimiterRepository();
    repository.fetchMonthlyCountMock.mockResolvedValueOnce(30);
    repository.fetchDailyCountMock.mockResolvedValueOnce(12);
    repository.fetchHourlyCountMock.mockResolvedValueOnce(2);
    const ctx: ServiceContext<
      RateLimiterRepositoryLike,
      RateLimiterRepositoryLike
    > = {
      writer: repository,
      reader: repository,
    };

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
    const repository = new MockRateLimiterRepository();
    repository.fetchRuleMock.mockResolvedValueOnce({
      path: '/notifications',
      productName: 'api',
      dailyLimit: 100,
      monthlyLimit: 1000,
      hourlyLimit: 1,
    });
    repository.fetchMonthlyCountMock.mockResolvedValueOnce(30);
    repository.fetchDailyCountMock.mockResolvedValueOnce(12);
    repository.fetchHourlyCountMock.mockResolvedValueOnce(2);
    const ctx: ServiceContext<
      RateLimiterRepositoryLike,
      RateLimiterRepositoryLike
    > = {
      writer: repository,
      reader: repository,
    };

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

  it('returns 429 from Express middleware when a rate limit is hit', async () => {
    const repository = new MockRateLimiterRepository();
    repository.fetchRuleMock.mockResolvedValueOnce({
      path: '/notifications',
      productName: 'api',
      dailyLimit: 100,
      monthlyLimit: 1000,
      hourlyLimit: 1,
    });
    repository.fetchMonthlyCountMock.mockResolvedValueOnce(30);
    repository.fetchDailyCountMock.mockResolvedValueOnce(12);
    repository.fetchHourlyCountMock.mockResolvedValueOnce(2);
    const request = createExpressRequest();
    const response = new MockExpressResponse();
    const next = jest.fn<void, [unknown?]>();

    const middleware = rateLimiterMiddleware([], (_currentRequest) => ({
      writer: repository as RateLimiterRepositoryLike,
      reader: repository as RateLimiterRepositoryLike,
    }));

    await middleware(request, response, next as ExpressNextFunction);

    expect(response.statusCode).toBe(429);
    expect(response.body).toBe(
      'RateLimitException: Hourly limit exceeded for: /notifications - api',
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('uses a prisma rate limiter repository for SQL access', async () => {
    const client = new MockPrismaClient();
    const repository = new PrismaRateLimiterRepository({
      client,
      sql: new MockSqlFactory(),
    });

    client.queryRawMock
      .mockResolvedValueOnce([
        {
          path: '/notifications',
          product_name: 'api',
          daily_limit: 100,
          monthly_limit: 1000,
          hourly_limit: 10,
        },
      ])
      .mockResolvedValueOnce([{ count: '30' }]);

    await expect(
      repository.fetchRule(
        {
          path: '/notifications',
          requestHeaders: '{}',
          requestBody: '{}',
          productName: 'api',
          productModule: 'notifications',
          productFeature: 'send',
          productTenant: 'tenant-a',
        },
        'service_a',
      ),
    ).resolves.toEqual({
      path: '/notifications',
      productName: 'api',
      dailyLimit: 100,
      monthlyLimit: 1000,
      hourlyLimit: 10,
    });

    await expect(
      repository.fetchMonthlyCount(
        {
          path: '/notifications',
          requestHeaders: '{}',
          requestBody: '{}',
          productName: 'api',
          productModule: 'notifications',
          productFeature: 'send',
          productTenant: 'tenant-a',
        },
        '2026-05-01T00:00:00.000Z',
        'service_a',
      ),
    ).resolves.toBe(30);

    expect(client.queryRawMock.mock.calls[0]?.[0]).toContain(
      'FROM public.service_a_rate_limiter_rule',
    );
    expect(client.queryRawMock.mock.calls[1]?.[0]).toContain(
      'FROM public.service_a_request_log',
    );
  });
});
