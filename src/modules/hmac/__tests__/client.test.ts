jest.mock('../../../shared/utils/aws/services', () => ({
  fetchAwsSecret: jest.fn(),
}));

import { fetchAwsSecret } from '../../../shared/utils/aws/services';
import { createHmacClient } from '../client';
import {
  HMAC_INVALID_HEADERS,
  HMAC_INVALID_SIGNATURE,
  HMAC_SIGNATURE_HEADER,
  HMAC_UNSUPPORTED_METHOD,
} from '../constants';
import { HmacError, HMACException } from '../exceptions';
import type { HmacRequestInput } from '../types';

const fetchAwsSecretMock = jest.mocked(fetchAwsSecret);

function createDeferred<T>(): {
  promise: Promise<T>;
  reject(reason?: unknown): void;
  resolve(value: T): void;
} {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    reject: rejectPromise,
    resolve: resolvePromise,
  };
}

const baseInput: HmacRequestInput = {
  method: 'GET',
  params: { b: 2, a: 'x' },
  url: '/v1/orders',
};

describe('createHmacClient', () => {
  beforeEach(() => {
    fetchAwsSecretMock.mockResolvedValue({
      current: 'primary-secret',
      previous: 'rotated-secret',
    });
  });

  it('uses the legacy environment API defaults', () => {
    const client = createHmacClient({ secretName: 'prod/hmac' });

    expect(client.signatureHeader).toBe(HMAC_SIGNATURE_HEADER);
  });

  it('validates client configuration eagerly', () => {
    expect(() => createHmacClient({ secretName: ' ' })).toThrow(
      'HmacClient requires a non-empty secretName.',
    );
    expect(() =>
      createHmacClient({ secrets: ['secret'], signatureHeader: ' ' }),
    ).toThrow(
      'HmacClient requires signatureHeader to be a non-empty string when provided.',
    );
    expect(() => createHmacClient({ secrets: [] })).toThrow(
      'HmacClient requires at least one non-empty secret.',
    );
    expect(() =>
      createHmacClient({
        customHeaders: [
          { name: 'X-Tenant', validate: () => true },
          { name: 'x-tenant', validate: () => true },
        ],
        secrets: ['secret'],
      }),
    ).toThrow(
      'HmacClient requires customHeaders to contain unique header names.',
    );
  });

  it('matches the environment golden signature', async () => {
    const client = createHmacClient({ secrets: ['primary-secret'] });

    await expect(client.sign(baseInput)).resolves.toBe(
      'a579e453b6eaca57c60d0ab926c393ccfe55b00134c51f903820af7ef925439a',
    );
  });

  it('normalizes relative and absolute URLs without query or hash', async () => {
    const client = createHmacClient({ secrets: ['primary-secret'] });

    const relative = await client.sign(baseInput);
    const absolute = await client.sign({
      ...baseInput,
      url: 'https://api.example.com/v1/orders?ignored=true#fragment',
    });

    expect(absolute).toBe(relative);
  });

  it.each([
    [
      '/café/☃',
      'e755ddc106bc6cf46d6158ae7671cf773f3c4c6864dae0ba00df9417d72c9187',
    ],
    [
      "/v1/a:b!'()*",
      'c011909c72bac491607aecf77af19f0383ea32025c597213f2356a447871fba7',
    ],
    [
      '/v1/already%20encoded',
      '6f45f440a32f00d9bc1c033d57515b4827491a42c5244a6f09ee507924da25ee',
    ],
  ])('encodes path %s using golden fixtures', async (url, signature) => {
    const client = createHmacClient({ secrets: ['primary-secret'] });

    await expect(client.sign({ method: 'GET', url })).resolves.toBe(signature);
  });

  it('sorts query keys deterministically', async () => {
    const client = createHmacClient({ secrets: ['primary-secret'] });

    await expect(
      client.sign({
        method: 'GET',
        params: { a: 'x', b: 2 },
        url: '/v1/orders',
      }),
    ).resolves.toBe(await client.sign(baseInput));
  });

  it.each(['POST', 'PATCH', 'DELETE'])(
    'includes %s bodies in the canonical message',
    async (method) => {
      const client = createHmacClient({ secrets: ['primary-secret'] });

      await expect(
        client.sign({
          body: new Uint8Array(Buffer.from('payload')),
          method,
          params: { foo: ' bar' },
          url: '/v1/orders',
        }),
      ).resolves.toBe(
        'c7f627c283bad75d41449ef6ea3ab088d1148d639ae06ed4fbee0b3a66257ef7',
      );
    },
  );

  it('normalizes supported body input shapes and empty bodies', async () => {
    const client = createHmacClient({ secrets: ['primary-secret'] });
    const stringSignature = await client.sign({
      body: 'payload',
      method: 'POST',
      url: '/v1/orders',
    });
    const bufferSignature = await client.sign({
      body: Buffer.from('payload'),
      method: 'POST',
      url: '/v1/orders',
    });
    const bytesSignature = await client.sign({
      body: new Uint8Array(Buffer.from('payload')),
      method: 'POST',
      url: '/v1/orders',
    });
    const absentSignature = await client.sign({
      method: 'POST',
      url: '/v1/orders',
    });
    const emptySignature = await client.sign({
      body: '',
      method: 'POST',
      url: '/v1/orders',
    });

    expect(bufferSignature).toBe(stringSignature);
    expect(bytesSignature).toBe(stringSignature);
    expect(emptySignature).toBe(absentSignature);
  });

  it('ignores GET bodies and rejects unsupported methods', async () => {
    const client = createHmacClient({ secrets: ['primary-secret'] });

    await expect(client.sign({ ...baseInput, body: 'ignored' })).resolves.toBe(
      await client.sign(baseInput),
    );
    await expect(
      client.sign({ ...baseInput, method: 'PUT' }),
    ).rejects.toMatchObject({ detail: HMAC_UNSUPPORTED_METHOD });
  });

  it('normalizes, validates, and deterministically signs custom headers', async () => {
    const validateTenant = jest.fn(() => true);
    const client = createHmacClient({
      customHeaders: [
        { name: 'X-Tenant-Slug', validate: () => true },
        { name: 'X-Tenant-Id', validate: validateTenant },
      ],
      secrets: ['primary-secret'],
    });

    await expect(
      client.sign({
        ...baseInput,
        headers: [
          ['X-TENANT-ID', ' acme '],
          ['x-tenant-id', 'north'],
          ['x-tenant-slug', 'acme-inc'],
          ['authorization', 'not-signed'],
        ],
      }),
    ).resolves.toBe(
      'a0683813a37a3f0979b35f35fe642b02c8f447f38b0633a5e585cf99de05220f',
    );
    expect(validateTenant).toHaveBeenCalledWith(
      'acme,north',
      expect.objectContaining({
        authorization: 'not-signed',
        'x-tenant-id': 'acme,north',
      }),
    );
  });

  it('accepts the standard Headers input shape', async () => {
    const client = createHmacClient({
      customHeaders: [{ name: 'x-tenant-id', validate: () => true }],
      secrets: ['primary-secret'],
    });
    const headers = new Headers();
    headers.append('X-Tenant-Id', 'acme');

    await expect(client.sign({ ...baseInput, headers })).resolves.toMatch(
      /^[a-f0-9]{64}$/u,
    );
  });

  it.each([
    { validate: () => false },
    {
      validate: () => {
        throw new Error('validator failure');
      },
    },
  ])('rejects invalid custom headers', async ({ validate }) => {
    const client = createHmacClient({
      customHeaders: [{ name: 'x-tenant-id', validate }],
      secrets: ['primary-secret'],
    });

    await expect(
      client.sign({ ...baseInput, headers: { 'x-tenant-id': 'acme' } }),
    ).rejects.toMatchObject({ detail: HMAC_INVALID_HEADERS });
  });

  it('rejects a missing signed header', async () => {
    const client = createHmacClient({
      customHeaders: [{ name: 'x-tenant-id', validate: () => true }],
      secrets: ['primary-secret'],
    });

    await expect(client.sign(baseInput)).rejects.toMatchObject({
      detail: HMAC_INVALID_HEADERS,
    });
  });

  it('signs with the first secret and verifies rotation secrets', async () => {
    const client = createHmacClient({
      secrets: ['primary-secret', 'rotated-secret'],
    });
    const rotatedClient = createHmacClient({ secrets: ['rotated-secret'] });
    const rotatedSignature = await rotatedClient.sign(baseInput);

    await expect(client.verify(rotatedSignature, baseInput)).resolves.toBe(
      undefined,
    );
    await expect(client.sign(baseInput)).resolves.toBe(
      'a579e453b6eaca57c60d0ab926c393ccfe55b00134c51f903820af7ef925439a',
    );
  });

  it('rejects malformed and length-mismatched signatures safely', async () => {
    const client = createHmacClient({ secrets: ['primary-secret'] });

    await expect(client.verify('x', baseInput)).rejects.toMatchObject({
      detail: HMAC_INVALID_SIGNATURE,
      statusCode: 401,
    });
    await expect(
      client.verify(undefined as never, baseInput),
    ).rejects.toBeInstanceOf(HmacError);
  });

  it('keeps HmacError compatible with HMACException handlers', () => {
    expect(new HmacError(401, HMAC_INVALID_SIGNATURE)).toBeInstanceOf(
      HMACException,
    );
  });

  it('caches and shares one in-flight asynchronous resolution', async () => {
    const deferred = createDeferred<readonly string[]>();
    const resolver = jest.fn(() => deferred.promise);
    const client = createHmacClient({ resolveSecrets: resolver });

    const first = client.sign(baseInput);
    const second = client.sign(baseInput);
    expect(resolver).toHaveBeenCalledTimes(1);

    deferred.resolve(['primary-secret']);
    await expect(first).resolves.toBe(await second);
    await client.sign(baseInput);
    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it('retries resolution after failure and validates resolved values', async () => {
    const resolver = jest
      .fn<Promise<readonly string[]>, []>()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(['primary-secret']);
    const client = createHmacClient({ resolveSecrets: resolver });

    await expect(client.sign(baseInput)).rejects.toThrow('temporary failure');
    await expect(client.sign(baseInput)).resolves.toBe(
      'a579e453b6eaca57c60d0ab926c393ccfe55b00134c51f903820af7ef925439a',
    );
    expect(resolver).toHaveBeenCalledTimes(2);

    const invalid = createHmacClient({
      resolveSecrets: async () => [''],
    });
    await expect(invalid.sign(baseInput)).rejects.toThrow(
      'HmacClient requires every secret value to be a non-empty string.',
    );
  });

  it('loads AWS secrets lazily in payload property order', async () => {
    const client = createHmacClient({
      awsRegion: 'us-east-1',
      secretName: 'prod/hmac',
    });

    expect(fetchAwsSecretMock).not.toHaveBeenCalled();
    await expect(client.sign(baseInput)).resolves.toBe(
      'a579e453b6eaca57c60d0ab926c393ccfe55b00134c51f903820af7ef925439a',
    );
    expect(fetchAwsSecretMock).toHaveBeenCalledWith('prod/hmac', 'us-east-1');
    expect(fetchAwsSecretMock).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid AWS payloads', async () => {
    fetchAwsSecretMock.mockResolvedValueOnce({});
    const empty = createHmacClient({ secretName: 'prod/hmac' });
    await expect(empty.sign(baseInput)).rejects.toThrow(
      'HmacClient requires at least one secret value from AWS Secrets Manager.',
    );

    fetchAwsSecretMock.mockResolvedValueOnce({ current: '' });
    const invalid = createHmacClient({ secretName: 'prod/hmac' });
    await expect(invalid.sign(baseInput)).rejects.toThrow(
      'HmacClient requires every AWS secret value to be a non-empty string.',
    );
  });
});
