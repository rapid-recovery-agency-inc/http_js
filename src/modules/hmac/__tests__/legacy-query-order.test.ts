import { createAwsHmacClient } from '../aws-client';
import { createHmacClient } from '../client';

const mockSend = jest.fn();
jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest
    .fn()
    .mockImplementation(() => ({ send: mockSend, destroy: jest.fn() })),
  GetSecretValueCommand: jest.fn(),
}));

// Frozen from SSO's former buildCompatMessage/crypto path with this synthetic key.
const key = 'synthetic-review-key';
const legacySignature =
  'a424ebb43136fe4ae1962d22e4ea9d5ba533739f03c95cbe41866fb659d1bf0c';
const canonicalSignature =
  '107201929d0a9ae59e4b9b35e0107ed5d35aa0c8ff94ba7171536b02ae2dd331';
const canonicalGetSignature =
  '68067137c9b54d26ecfc3c763a77fafecdf67077378bc5a1c8c0347ff7a0b5fe';
const input = { url: '/api/users/user-1', body: '{}', params: { a: 1, Z: 2 } };

it.each(['GET', 'POST', 'PATCH', 'DELETE'])(
  'keeps default and explicit false query ordering for %s',
  async (method) => {
    const ordinary = createHmacClient({ secrets: [key] });
    const options = { secrets: [key], legacyPatchDeleteQueryOrder: false };
    const explicit = createHmacClient(options);
    await expect(ordinary.sign({ ...input, method })).resolves.toBe(
      method === 'GET' ? canonicalGetSignature : canonicalSignature,
    );
    await expect(explicit.sign({ ...input, method })).resolves.toBe(
      method === 'GET' ? canonicalGetSignature : canonicalSignature,
    );
  },
);

it.each(['PATCH', 'DELETE'])(
  'preserves the legacy %s signature only when explicitly enabled',
  async (method) => {
    const options = { secrets: [key], legacyPatchDeleteQueryOrder: true };
    const client = createHmacClient(options);
    await expect(client.sign({ ...input, method })).resolves.toBe(
      legacySignature,
    );
    await expect(
      client.verify(legacySignature, { ...input, method }),
    ).resolves.toBeUndefined();
    await expect(
      client.verify(canonicalSignature, { ...input, method }),
    ).rejects.toThrow();
    await expect(
      createHmacClient({ secrets: [key] }).verify(legacySignature, {
        ...input,
        method,
      }),
    ).rejects.toThrow();
  },
);

it.each(['GET', 'POST'])(
  'does not apply the legacy query order to %s',
  async (method) => {
    const options = { secrets: [key], legacyPatchDeleteQueryOrder: true };
    await expect(
      createHmacClient(options).sign({ ...input, method }),
    ).resolves.toBe(
      method === 'GET' ? canonicalGetSignature : canonicalSignature,
    );
  },
);

it.each(['true', 1, null])(
  'rejects invalid compatibility option %j eagerly',
  (legacyPatchDeleteQueryOrder) => {
    expect(() =>
      createHmacClient({
        secrets: [key],
        legacyPatchDeleteQueryOrder,
      } as never),
    ).toThrow(
      'HmacClient requires legacyPatchDeleteQueryOrder to be a boolean when provided.',
    );
  },
);

it('forwards the option through the AWS factory', async () => {
  mockSend.mockResolvedValue({
    SecretString: JSON.stringify({ current: key }),
  });
  const options = {
    secretName: 'test/legacy-query-order',
    legacyPatchDeleteQueryOrder: true,
  };
  const client = createAwsHmacClient(options);
  await expect(client.sign({ ...input, method: 'PATCH' })).resolves.toBe(
    legacySignature,
  );
});
