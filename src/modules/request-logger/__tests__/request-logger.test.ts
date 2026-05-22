import { Context } from '../../../shared/context/services';
import type { ContextRequestLike } from '../../../shared/context/services';
import type {
  ExpressNextFunction,
  ExpressRequestLike,
  ExpressResponseLike,
} from '../../../shared/express/services';

import { DEFAULT_REQUEST_TABLE, REQUEST_LOGGER_HEADER } from '../constants';
import { PrismaRequestLoggerRepository } from '../repositories';
import {
  consoleRequestLoggerMiddleware,
  databaseRequestLoggerMiddleware,
} from '../services';
import { resolveRequestLoggerTableName, saveRequestLog } from '../utils';
import type { RequestLoggerPersistenceLike } from '../types';

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

class MockPersistence {
  public readonly saveMock = jest.fn<
    Promise<void>,
    [unknown, (string | null)?]
  >(async () => undefined);

  public async save(
    entry: unknown,
    tablePrefix?: string | null,
  ): Promise<void> {
    await this.saveMock(entry, tablePrefix);
  }
}

class MockPrismaClient {
  public readonly executeRawMock = jest.fn<Promise<number>, [string]>();
  public readonly queryRawMock = jest.fn<Promise<unknown[]>, [string]>(
    async () => [],
  );

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

  public emitClose(): void {
    for (const listener of this.closeListeners) {
      listener();
    }
  }

  public emitFinish(): void {
    for (const listener of this.finishListeners) {
      listener();
    }
  }
}

function createExpressRequest(body?: unknown): ExpressRequestLike {
  return {
    body: body ?? {
      product_name: 'api',
      product_module: 'notifications',
      product_feature: 'send',
      product_tenant: 'tenant-a',
    },
    headers: {},
    method: 'POST',
    path: '/notifications',
    query: {},
    state: {},
  };
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
    const persistence = new MockPersistence();
    const ctx = new Context({
      env: {},
      writerPool: persistence,
      readerPools: [] as MockPersistence[],
      request: createRequest(),
    });

    await saveRequestLog({
      ctx,
      path: '/notifications',
      fromCache: false,
    });

    expect(persistence.saveMock).toHaveBeenCalledTimes(1);
  });

  it('uses a prisma request logger repository for SQL persistence', async () => {
    const client = new MockPrismaClient();
    const repository = new PrismaRequestLoggerRepository({
      client,
      sql: new MockSqlFactory(),
    });

    await repository.save(
      {
        path: '/notifications',
        fromCache: false,
        productName: 'api',
      },
      'service_a',
    );

    expect(client.executeRawMock).toHaveBeenCalledTimes(1);
    expect(client.executeRawMock.mock.calls[0]?.[0]).toContain(
      'INSERT INTO public.service_a_request_logger_request',
    );
  });

  it('logs console requests unless the path is whitelisted', async () => {
    const request = createExpressRequest();
    const response = new MockExpressResponse();
    const next = jest.fn<void, [unknown?]>();
    const middleware = consoleRequestLoggerMiddleware([]);

    await middleware(request, response, next as ExpressNextFunction);
    response.status(200).send('ok');
    response.emitFinish();

    expect(response.statusCode).toBe(200);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when request data validation fails', async () => {
    const request = createExpressRequest({});
    const response = new MockExpressResponse();
    const next = jest.fn<void, [unknown?]>();
    const middleware = databaseRequestLoggerMiddleware(
      [],
      (currentRequest) =>
        new Context({
          env: {},
          writerPool: new MockPersistence() as RequestLoggerPersistenceLike,
          readerPools: [] as RequestLoggerPersistenceLike[],
          request: currentRequest,
        }),
    );

    await middleware(request, response, next as ExpressNextFunction);

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({
      error: 'Error: validateRequestData:Missing required field: product_name',
    });
  });

  it('persists successful requests and attaches the request id header', async () => {
    const persistence = new MockPersistence();
    const request = createExpressRequest();
    const response = new MockExpressResponse();
    const next = jest.fn<void, [unknown?]>(() => {
      response.status(202).send('accepted');
      response.emitFinish();
    });
    const middleware = databaseRequestLoggerMiddleware(
      [],
      (currentRequest) =>
        new Context({
          env: {},
          writerPool: persistence as RequestLoggerPersistenceLike,
          readerPools: [] as RequestLoggerPersistenceLike[],
          request: currentRequest,
        }),
    );

    await middleware(request, response, next as ExpressNextFunction);

    expect(response.statusCode).toBe(202);
    expect(response.getHeader(REQUEST_LOGGER_HEADER)).toBeDefined();
    expect(persistence.saveMock).toHaveBeenCalledTimes(1);
  });

  it('persists closed requests when the response closes before finish', async () => {
    const persistence = new MockPersistence();
    const request = createExpressRequest();
    const response = new MockExpressResponse();
    const next = jest.fn<void, [unknown?]>(() => {
      response.status(500);
      response.emitClose();
    });
    const middleware = databaseRequestLoggerMiddleware(
      [],
      (currentRequest) =>
        new Context({
          env: {},
          writerPool: persistence as RequestLoggerPersistenceLike,
          readerPools: [] as RequestLoggerPersistenceLike[],
          request: currentRequest,
        }),
    );

    await middleware(request, response, next as ExpressNextFunction);

    expect(persistence.saveMock).toHaveBeenCalledTimes(1);
  });
});
