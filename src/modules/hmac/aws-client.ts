import { resolveAwsHmacSecrets } from '../../shared/utils/aws/hmac-secrets';

import { createHmacClient } from './client';
import type { AwsHmacClientOptions, HmacClientInstance } from './types';

/** AWS-backed configuration adapter; the core client owns lazy loading, caching and retries. */
export function createAwsHmacClient({
  secretName,
  ...options
}: AwsHmacClientOptions): HmacClientInstance {
  if (typeof secretName !== 'string' || secretName.trim().length === 0) {
    throw new Error('HmacClient requires a non-empty secretName.');
  }
  const normalizedName = secretName.trim();
  return createHmacClient({
    ...options,
    resolveSecrets: () => resolveAwsHmacSecrets(normalizedName),
  });
}
