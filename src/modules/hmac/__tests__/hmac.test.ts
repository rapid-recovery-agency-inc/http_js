import type {
  ExpressNextFunction,
  ExpressRequestLike,
  ExpressResponseLike,
} from '../../../shared/express/services';
import {
  HMAC_INVALID_SIGNATURE,
  HMAC_MISSING_SIGNATURE,
  HMAC_UNSUPPORTED_METHOD,
} from '../constants';
import {
  buildHmacFactoryDependency,
  hmacMiddleware,
  requireHmacSignature,
} from '../services';
import type { HMACRequestLike } from '../types';
import { sign, signLegacyHmac } from '../utils';

class TestHeaders {
  private readonly entries: Record<string, string>;

  public constructor(entries: Record<string, string>) {
    this.entries = entries;
  }

  public get(key: string): string | null {
    return this.entries[key] ?? null;
  }
}

class TestQueryParams {
  private readonly queryEntries: Record<string, string>;

  public constructor(entries: Record<string, string>) {
    this.queryEntries = entries;
  }

  public *entries(): IterableIterator<[string, string]> {
    for (const entry of Object.entries(this.queryEntries)) {
      yield entry;
    }
  }
}

function createRequest(
  overrides: Partial<HMACRequestLike> = {},
): HMACRequestLike {
  return {
    async body(): Promise<Buffer> {
      return Buffer.from('{"name":"Alice"}', 'utf8');
    },
    headers: new TestHeaders({}),
    method: 'GET',
    queryParams: new TestQueryParams({}),
    url: 'https://api.example.com/users',
    ...overrides,
  };
}

class MockExpressResponse implements ExpressResponseLike {
  public statusCode = 200;
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
    _event: 'close' | 'finish',
    _listener: () => void,
  ): ExpressResponseLike {
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

function createExpressRequest(
  overrides: Partial<ExpressRequestLike> = {},
): ExpressRequestLike {
  return {
    body: undefined,
    headers: {},
    method: 'GET',
    originalUrl: '/users',
    path: '/users',
    query: {},
    ...overrides,
  };
}

describe('hmac', () => {
  const env = {
    SECRETS: ['current_secret', 'previous_secret'],
    HMAC_HEADER_NAME: 'X-HMAC-Signature',
  };

  it('signs GET requests deterministically with sorted query params', () => {
    expect(
      sign('secret', 'https://api.example.com/users', {
        limit: '10',
        page: '1',
      }),
    ).toBe(
      sign('secret', 'https://api.example.com/users', {
        page: '1',
        limit: '10',
      }),
    );
  });

  it('supports signing POST request bodies', () => {
    const signature = sign(
      'secret',
      'https://api.example.com/users',
      null,
      Buffer.from('{"name":"Alice"}', 'utf8'),
    );

    expect(signature).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('accepts valid GET request signatures', async () => {
    const signature = sign('current_secret', 'https://api.example.com/users', {
      page: '1',
    });
    const request = createRequest({
      headers: new TestHeaders({ 'X-HMAC-Signature': signature }),
      queryParams: new TestQueryParams({ page: '1' }),
    });

    await expect(requireHmacSignature(request, env)).resolves.toBeUndefined();
  });

  it('accepts valid POST signatures during key rotation', async () => {
    const body = Buffer.from('{"name":"Alice"}', 'utf8');
    const signature = sign(
      'previous_secret',
      'https://api.example.com/users',
      {},
      body,
    );
    const request = createRequest({
      async body(): Promise<Buffer> {
        return body;
      },
      headers: new TestHeaders({ 'X-HMAC-Signature': signature }),
      method: 'POST',
    });

    await expect(requireHmacSignature(request, env)).resolves.toBeUndefined();
  });

  it.each(['PATCH', 'DELETE'])(
    'accepts valid %s signatures with request bodies',
    async (method) => {
      const body = Buffer.from('{"name":"Alice"}', 'utf8');
      const signature = sign(
        'current_secret',
        'https://api.example.com/users',
        {},
        body,
      );
      const request = createRequest({
        async body(): Promise<Buffer> {
          return body;
        },
        headers: new TestHeaders({ 'X-HMAC-Signature': signature }),
        method,
      });

      await expect(requireHmacSignature(request, env)).resolves.toBeUndefined();
    },
  );

  it('accepts legacy http_js GET signatures during migration', async () => {
    const url = "https://api.example.com/v1/a:b!'()*";
    const signature = signLegacyHmac('current_secret', url);

    await expect(
      requireHmacSignature(
        createRequest({
          headers: new TestHeaders({ 'X-HMAC-Signature': signature }),
          url,
        }),
        env,
      ),
    ).resolves.toBeUndefined();
  });

  it('rejects requests without signatures', async () => {
    await expect(requireHmacSignature(createRequest(), env)).rejects.toEqual(
      expect.objectContaining({
        statusCode: 401,
        detail: HMAC_MISSING_SIGNATURE,
      }),
    );
  });

  it('rejects unsupported HTTP methods', async () => {
    await expect(
      requireHmacSignature(
        createRequest({
          headers: new TestHeaders({ 'X-HMAC-Signature': 'abc' }),
          method: 'PUT',
        }),
        env,
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        statusCode: 401,
        detail: HMAC_UNSUPPORTED_METHOD,
      }),
    );
  });

  it('rejects invalid signatures', async () => {
    await expect(
      requireHmacSignature(
        createRequest({
          headers: new TestHeaders({ 'X-HMAC-Signature': 'invalid' }),
        }),
        env,
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        statusCode: 401,
        detail: HMAC_INVALID_SIGNATURE,
      }),
    );
  });

  it('builds a dependency after validating the environment', async () => {
    const signature = sign('current_secret', 'https://api.example.com/users');
    const dependency = buildHmacFactoryDependency(env);

    await expect(
      dependency(
        createRequest({
          headers: new TestHeaders({ 'X-HMAC-Signature': signature }),
        }),
      ),
    ).resolves.toBeUndefined();
  });

  it('rejects invalid dependency environment configuration', () => {
    expect(() =>
      buildHmacFactoryDependency({
        HMAC_HEADER_NAME: ' ',
        SECRETS: ['secret'],
      }),
    ).toThrow(
      'requireHmacSignature:HMAC_HEADER_NAME must be set in the environment',
    );

    expect(() =>
      buildHmacFactoryDependency({
        HMAC_HEADER_NAME: 'X-HMAC-Signature',
        SECRETS: [],
      }),
    ).toThrow(
      'requireHmacSignature:SECRETS must be a non-empty list in the environment',
    );
  });

  it('allows valid signatures through middleware and calls next once', async () => {
    const middleware = hmacMiddleware(env);
    const signature = sign('current_secret', 'http://localhost/users', {
      page: '1',
      tags: 'a,b',
    });
    const request = createExpressRequest({
      headers: { 'X-HMAC-Signature': signature },
      originalUrl: '/users?page=1&tags=a&tags=b',
      query: { page: '1', tags: ['a', 'b'] },
    });
    const response = new MockExpressResponse();
    const next = jest.fn<void, [unknown?]>();

    await middleware(request, response, next as ExpressNextFunction);

    expect(response.statusCode).toBe(200);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it.each(['PATCH', 'DELETE'])(
    'allows valid %s signatures through middleware',
    async (method) => {
      const middleware = hmacMiddleware(env);
      const body = { name: 'Alice' };
      const signature = sign(
        'current_secret',
        'http://localhost/users',
        {},
        Buffer.from(JSON.stringify(body), 'utf8'),
      );
      const request = createExpressRequest({
        body,
        headers: { 'X-HMAC-Signature': signature },
        method,
      });
      const response = new MockExpressResponse();
      const next = jest.fn<void, [unknown?]>();

      await middleware(request, response, next as ExpressNextFunction);

      expect(response.statusCode).toBe(200);
      expect(next).toHaveBeenCalledWith();
    },
  );

  it('returns 401 from middleware when the signature is missing', async () => {
    const middleware = hmacMiddleware(env);
    const request = createExpressRequest();
    const response = new MockExpressResponse();
    const next = jest.fn<void, [unknown?]>();

    await middleware(request, response, next as ExpressNextFunction);

    expect(response.statusCode).toBe(401);
    expect(response.body).toBe(HMAC_MISSING_SIGNATURE);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 from middleware for unsupported methods', async () => {
    const middleware = hmacMiddleware(env);
    const request = createExpressRequest({
      headers: { 'X-HMAC-Signature': 'abc' },
      method: 'PUT',
    });
    const response = new MockExpressResponse();
    const next = jest.fn<void, [unknown?]>();

    await middleware(request, response, next as ExpressNextFunction);

    expect(response.statusCode).toBe(401);
    expect(response.body).toBe(HMAC_UNSUPPORTED_METHOD);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 from middleware when signature is invalid', async () => {
    const middleware = hmacMiddleware(env);
    const request = createExpressRequest({
      headers: { 'X-HMAC-Signature': 'invalid' },
    });
    const response = new MockExpressResponse();
    const next = jest.fn<void, [unknown?]>();

    await middleware(request, response, next as ExpressNextFunction);

    expect(response.statusCode).toBe(401);
    expect(response.body).toBe(HMAC_INVALID_SIGNATURE);
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards unexpected middleware errors to next(error)', async () => {
    const middleware = hmacMiddleware({
      HMAC_HEADER_NAME: 'X-HMAC-Signature',
      SECRETS: ['secret'],
    });
    const circularBody: { self?: unknown } = {};
    circularBody.self = circularBody;
    const signature = sign(
      'secret',
      'http://localhost/users',
      null,
      Buffer.alloc(0),
    );
    const request = createExpressRequest({
      body: circularBody,
      headers: { 'X-HMAC-Signature': signature },
      method: 'POST',
    });
    const response = new MockExpressResponse();
    const next = jest.fn<void, [unknown?]>();

    await middleware(request, response, next as ExpressNextFunction);

    expect(response.statusCode).toBe(200);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(TypeError);
  });
});
