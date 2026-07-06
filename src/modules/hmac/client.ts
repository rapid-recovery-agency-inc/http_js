import { HMAC_SIGNATURE_HEADER } from './constants';
import {
  buildHmacMessage,
  createLazyHmacSecretResolver,
  normalizeCustomHeaderRules,
  signHmacMessage,
  validateHmacSecrets,
  verifyHmacMessage,
} from './core';
import type {
  HmacClientInstance,
  HmacClientOptions,
  HmacCustomHeaderRule,
  HmacRequestInput,
  HmacSecretResolver,
} from './types';

function normalizeSignatureHeader(signatureHeader: string | undefined): string {
  if (signatureHeader === undefined) {
    return HMAC_SIGNATURE_HEADER;
  }

  if (
    typeof signatureHeader !== 'string' ||
    signatureHeader.trim().length === 0
  ) {
    throw new Error(
      'HmacClient requires signatureHeader to be a non-empty string when provided.',
    );
  }

  return signatureHeader.trim();
}

function createOptionsResolver(options: HmacClientOptions): HmacSecretResolver {
  const configuredSources = [
    'secrets' in options,
    'resolveSecrets' in options,
  ].filter(Boolean).length;

  if (configuredSources !== 1) {
    throw new Error(
      'HmacClient requires exactly one of secrets or resolveSecrets.',
    );
  }

  if ('secrets' in options) {
    const secrets = validateHmacSecrets(options.secrets);
    return async (): Promise<readonly string[]> => secrets;
  }

  if (
    !('resolveSecrets' in options) ||
    typeof options.resolveSecrets !== 'function'
  ) {
    throw new Error(
      'HmacClient requires exactly one of secrets or resolveSecrets.',
    );
  }

  return options.resolveSecrets;
}

class HmacClient implements HmacClientInstance {
  public readonly signatureHeader: string;
  private readonly customHeaders: readonly HmacCustomHeaderRule[];
  private readonly resolveSecrets: HmacSecretResolver;

  public constructor(options: HmacClientOptions) {
    this.signatureHeader = normalizeSignatureHeader(options.signatureHeader);
    normalizeCustomHeaderRules(options.customHeaders);
    this.customHeaders = options.customHeaders ?? [];
    this.resolveSecrets = createLazyHmacSecretResolver(
      createOptionsResolver(options),
    );
  }

  public async sign(input: HmacRequestInput): Promise<string> {
    const message = buildHmacMessage(input, this.customHeaders);
    const secrets = await this.resolveSecrets();
    const secret = secrets[0];

    if (secret === undefined) {
      throw new Error('HmacClient requires at least one non-empty secret.');
    }

    return signHmacMessage(secret, message);
  }

  public async verify(
    signature: string,
    input: HmacRequestInput,
  ): Promise<void> {
    const message = buildHmacMessage(input, this.customHeaders);
    await verifyHmacMessage(signature, message, await this.resolveSecrets());
  }
}

export function createHmacClient(
  options: HmacClientOptions,
): HmacClientInstance {
  return new HmacClient(options);
}
