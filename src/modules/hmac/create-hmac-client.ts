import { fetchAwsSecret } from '../../shared/utils/aws/services';

import {
  extractSecretsFromPayload,
  HmacClient,
  normalizeCustomHeaderRules,
  normalizeSecretName,
  normalizeSignatureHeader,
} from './client';
import type { HmacClientInstance, HmacClientOptions } from './types';

/**
 * Create an HMAC client for signing and verifying requests.
 *
 * Returns a ready-to-use `HmacClientInstance`. Secrets are fetched
 * lazily on the first `sign`/`verify` call and cached for reuse.
 *
 * @example
 * ```ts
 * const hmac = createHmacClient({ secretName: 'prod/hmac' });
 * const sig = await hmac.sign({ method: 'POST', url: '/v1/orders', body });
 * ```
 */
export function createHmacClient(
  options: HmacClientOptions,
): HmacClientInstance {
  const secretName = normalizeSecretName(options.secretName);
  const signatureHeader = normalizeSignatureHeader(options.signatureHeader);
  const customHeaders = normalizeCustomHeaderRules(options.customHeaders);
  const awsRegion =
    options.awsRegion ?? process.env['AWS_REGION'] ?? 'us-east-1';
  let secretsPromise: Promise<string[]> | undefined;

  const resolveSecrets = (): Promise<string[]> => {
    if (!secretsPromise) {
      secretsPromise = fetchAwsSecret(secretName, awsRegion)
        .then((payload) => extractSecretsFromPayload(payload))
        .catch((error: unknown) => {
          secretsPromise = undefined;
          throw error;
        });
    }

    return secretsPromise;
  };

  return new HmacClient(resolveSecrets, signatureHeader, customHeaders);
}
