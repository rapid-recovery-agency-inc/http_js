import {
  HMAC_INVALID_SIGNATURE,
  HMAC_MISSING_SIGNATURE,
  HMAC_UNSUPPORTED_METHOD,
} from './constants.js';
import {
  buildHmacFactoryDependency,
  requireHmacSignature,
} from './services.js';
import type { HMACRequestLike } from './types.js';
import { sign } from './utils.js';

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
          method: 'DELETE',
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
});
