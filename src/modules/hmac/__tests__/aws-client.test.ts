import { createAwsHmacClient, createHmacClient } from '../../../index';
import type { HmacRequestInput } from '../types';

const mockSend = jest.fn();
const mockDestroy = jest.fn();

jest.mock('@aws-sdk/client-secrets-manager', () => {
  const actual = jest.requireActual('@aws-sdk/client-secrets-manager');
  return {
    ...actual,
    SecretsManagerClient: jest
      .fn()
      .mockImplementation(() => ({ send: mockSend, destroy: mockDestroy })),
  };
});

const input: HmacRequestInput = {
  method: 'POST',
  url: '/graphql',
  body: '{ "query": "{ company { id } }" }',
};
const payload = { current: 'current-test-key', previous: 'previous-test-key' };

beforeEach(() => {
  mockSend
    .mockReset()
    .mockResolvedValue({ SecretString: JSON.stringify(payload) });
  mockDestroy.mockReset();
});

it('exports a lazy AWS client, shares one in-flight resolution and caches success', async () => {
  let complete!: (response: { SecretString: string }) => void;
  mockSend.mockReturnValue(
    new Promise((resolve) => {
      complete = resolve;
    }),
  );
  const client = createAwsHmacClient({
    secretName: '  test/hmac  ',
    signatureHeader: 'X-Custom-Signature',
  });
  expect(client.signatureHeader).toBe('X-Custom-Signature');
  expect(mockSend).not.toHaveBeenCalled();
  const requests = [client.sign(input), client.sign(input)];
  expect(mockSend).toHaveBeenCalledTimes(1);
  expect(mockSend.mock.calls[0][0].input.SecretId).toBe('test/hmac');
  complete({ SecretString: JSON.stringify(payload) });
  const signatures = await Promise.all(requests);
  expect(signatures[0]).toBe(signatures[1]);
  await expect(client.verify(signatures[0]!, input)).resolves.toBeUndefined();
  expect(mockSend).toHaveBeenCalledTimes(1);
  expect(mockDestroy).toHaveBeenCalledTimes(1);
});

it('preserves first-key signing order and previous-key verification without date sorting', async () => {
  mockSend.mockResolvedValue({
    SecretString: JSON.stringify({
      '2025-01-01': 'older-first',
      '2026-01-01': 'newer-second',
    }),
  });
  const client = createAwsHmacClient({ secretName: 'test/hmac' });
  const first = createHmacClient({ secrets: ['older-first'] });
  const second = createHmacClient({ secrets: ['newer-second'] });
  await expect(client.sign(input)).resolves.toBe(await first.sign(input));
  await expect(
    client.verify(await second.sign(input), input),
  ).resolves.toBeUndefined();
});

it('preserves custom-header validation and signature binding through the core client', async () => {
  const rule = {
    name: 'X-Tenant',
    validate: (value: string) => /^insightt\/[1-9]\d*$/.test(value),
  };
  const client = createAwsHmacClient({
    secretName: 'test/hmac',
    customHeaders: [rule],
  });
  const direct = createHmacClient({
    secrets: [payload.current],
    customHeaders: [rule],
  });
  const request = { ...input, headers: { 'x-tenant': 'insightt/42' } };
  const signature = await client.sign(request);
  expect(signature).toBe(await direct.sign(request));
  await expect(
    client.verify(signature, {
      ...request,
      headers: { 'x-tenant': 'insightt/43' },
    }),
  ).rejects.toThrow();
  await expect(
    client.sign({ ...request, headers: { 'x-tenant': 'insightt/0' } }),
  ).rejects.toThrow();
});

it('retries failed AWS resolution and releases each SDK client', async () => {
  mockSend.mockRejectedValueOnce(new Error('AWS unavailable'));
  const client = createAwsHmacClient({ secretName: 'test/hmac' });
  await expect(client.sign(input)).rejects.toThrow('AWS unavailable');
  await expect(client.sign(input)).resolves.toMatch(/^[a-f0-9]{64}$/);
  expect(mockSend).toHaveBeenCalledTimes(2);
  expect(mockDestroy).toHaveBeenCalledTimes(2);
});

it.each([
  null,
  [],
  ['key'],
  'key',
  42,
  {},
  { key: '' },
  { key: null },
  { key: 1 },
  { key: {} },
  { current: 'valid', previous: '' },
])(
  'rejects malformed original payload %j and allows retry',
  async (invalid) => {
    mockSend.mockResolvedValueOnce({ SecretString: JSON.stringify(invalid) });
    const client = createAwsHmacClient({ secretName: 'test/hmac' });
    await expect(client.sign(input)).rejects.toThrow();
    await expect(client.sign(input)).resolves.toMatch(/^[a-f0-9]{64}$/);
  },
);

it.each([{}, { SecretString: '' }, { SecretBinary: new Uint8Array([1]) }])(
  'rejects missing SecretString %j',
  async (response) => {
    mockSend.mockResolvedValueOnce(response);
    await expect(
      createAwsHmacClient({ secretName: 'test/hmac' }).sign(input),
    ).rejects.toThrow();
  },
);

it('hides malformed JSON contents and original parsing errors without logging', async () => {
  mockSend.mockResolvedValueOnce({
    SecretString: 'private-key-material not valid JSON',
  });
  const logs = [
    jest.spyOn(console, 'error'),
    jest.spyOn(console, 'warn'),
    jest.spyOn(console, 'log'),
  ];
  try {
    const error = await createAwsHmacClient({ secretName: 'test/hmac' })
      .sign(input)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      'HmacClient requires AWS Secrets Manager payload to be a non-empty plain object of non-empty strings.',
    );
    expect((error as Error).cause).toBeUndefined();
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  } finally {
    for (const log of logs) log.mockRestore();
  }
});

it.each(['', '   '])('rejects empty secret name %j eagerly', (secretName) => {
  expect(() => createAwsHmacClient({ secretName })).toThrow(
    'HmacClient requires a non-empty secretName.',
  );
  expect(mockSend).not.toHaveBeenCalled();
});
