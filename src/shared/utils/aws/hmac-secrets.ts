import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';

const INVALID_PAYLOAD =
  'HmacClient requires AWS Secrets Manager payload to be a non-empty plain object of non-empty strings.';

/** HMAC-specific parsing: preserve value order and never expose secret bytes in parse errors. */
export async function resolveAwsHmacSecrets(
  secretName: string,
): Promise<readonly string[]> {
  const client = new SecretsManagerClient({});
  let response;
  try {
    response = await client.send(
      new GetSecretValueCommand({ SecretId: secretName }),
    );
  } finally {
    client.destroy();
  }
  if (
    typeof response.SecretString !== 'string' ||
    response.SecretString.length === 0
  ) {
    throw new Error(INVALID_PAYLOAD);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(response.SecretString);
  } catch {
    throw new Error(INVALID_PAYLOAD);
  }
  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload)
  ) {
    throw new Error(INVALID_PAYLOAD);
  }
  const prototype = Object.getPrototypeOf(payload);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(INVALID_PAYLOAD);
  }
  const values = Object.values(payload);
  if (
    values.length === 0 ||
    values.some((value) => typeof value !== 'string' || value.length === 0)
  ) {
    throw new Error(INVALID_PAYLOAD);
  }
  return values as string[];
}
