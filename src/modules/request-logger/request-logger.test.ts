import { Context } from '../../shared/context/services.js';
import type { ContextRequestLike } from '../../shared/context/services.js';
import type { PostgresPool } from '../../shared/postgres/services.js';

import { DEFAULT_REQUEST_TABLE, REQUEST_LOGGER_HEADER } from './constants.js';
import {
  consoleRequestLoggerMiddleware,
  databaseRequestLoggerMiddleware,
} from './services.js';
import { resolveRequestLoggerTableName, saveRequestLog } from './utils.js';

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

class MockPool {
  public readonly query = jest.fn<Promise<unknown>, [string, unknown[]?]>(
    async () => undefined,
  );
}

describe('request logger', () => {
  it('resolves table names with optional prefixes', () => {
    expect(resolveRequestLoggerTableName(DEFAULT_REQUEST_TABLE)).toBe(
      DEFAULT_REQUEST_TABLE,
    );
    expect(
      resolveRequestLoggerTableName(DEFAULT_REQUEST_TABLE, 'service_a'),
    ).toBe('service_a_request_logger_request');
    expect(() =>
      resolveRequestLoggerTableName(DEFAULT_REQUEST_TABLE, 'bad-prefix!'),
    ).toThrow("Invalid table_prefix 'bad-prefix!'");
  });

  it('saves request logs through the writer pool', async () => {
    const pool = new MockPool();
    const ctx = new Context({
      env: {},
      writerPool: pool as unknown as PostgresPool,
      readerPools: [] as PostgresPool[],
      request: createRequest(),
    });

    await saveRequestLog({
      ctx,
      path: '/notifications',
      fromCache: false,
    });

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0]?.[0]).toContain(
      'INSERT INTO public.request_logger_request',
    );
  });

  it('logs console requests unless the path is whitelisted', async () => {
    const request = createRequest();
    const response = await consoleRequestLoggerMiddleware(
      [],
      request,
      async () => ({
        statusCode: 200,
        headers: {},
        body: 'ok',
      }),
    );

    expect(response.statusCode).toBe(200);
  });

  it('returns 400 when request data validation fails', async () => {
    const request = createRequest();
    request.text = async () => JSON.stringify({});

    const response = await databaseRequestLoggerMiddleware(
      [],
      request,
      async () => ({ statusCode: 200, headers: {}, body: 'ok' }),
      (currentRequest) =>
        new Context({
          env: {},
          writerPool: new MockPool() as unknown as PostgresPool,
          readerPools: [] as PostgresPool[],
          request: currentRequest,
        }),
    );

    expect(response.statusCode).toBe(400);
  });

  it('persists successful requests and attaches the request id header', async () => {
    const pool = new MockPool();
    const request = createRequest();

    const response = await databaseRequestLoggerMiddleware(
      [],
      request,
      async () => ({ statusCode: 202, headers: {}, body: 'accepted' }),
      (currentRequest) =>
        new Context({
          env: {},
          writerPool: pool as unknown as PostgresPool,
          readerPools: [] as PostgresPool[],
          request: currentRequest,
        }),
    );

    expect(response.statusCode).toBe(202);
    expect(response.headers[REQUEST_LOGGER_HEADER]).toBeDefined();
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('persists failed requests before rethrowing', async () => {
    const pool = new MockPool();
    const request = createRequest();

    await expect(
      databaseRequestLoggerMiddleware(
        [],
        request,
        async () => {
          throw new Error('boom');
        },
        (currentRequest) =>
          new Context({
            env: {},
            writerPool: pool as unknown as PostgresPool,
            readerPools: [] as PostgresPool[],
            request: currentRequest,
          }),
      ),
    ).rejects.toThrow('boom');

    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});
