import { createHmac, timingSafeEqual } from 'node:crypto';

import {
  HMAC_INVALID_HEADERS,
  HMAC_INVALID_SIGNATURE,
  HMAC_SIGNATURE_HEADER,
  HMAC_UNSUPPORTED_METHOD,
} from './constants';
import { HMACException } from './exceptions';
import type {
  HmacCustomHeaderRule,
  HmacHeadersInput,
  HmacHeaderValue,
  HmacRequestInput,
} from './types';

const HTTP_UNAUTHORIZED = 401;
const ABSOLUTE_URL_PATTERN = /^[A-Za-z][A-Za-z\d+.-]*:\/\/[^/?#]*(\/[^?#]*)?/;

type SupportedMethod = 'GET' | 'POST';

export type NormalizedCustomHeaderRule = {
  name: string;
  validate: (
    value: string,
    headers: Readonly<Record<string, string>>,
  ) => boolean;
};

// ---------------------------------------------------------------------------
// Method normalisation
// ---------------------------------------------------------------------------

function normalizeMethod(method: string): SupportedMethod {
  if (typeof method !== 'string') {
    throw new HMACException(HTTP_UNAUTHORIZED, HMAC_UNSUPPORTED_METHOD);
  }

  const normalizedMethod = method.trim().toUpperCase();

  if (normalizedMethod === 'GET' || normalizedMethod === 'POST') {
    return normalizedMethod;
  }

  throw new HMACException(HTTP_UNAUTHORIZED, HMAC_UNSUPPORTED_METHOD);
}

// ---------------------------------------------------------------------------
// Path encoding
// ---------------------------------------------------------------------------

function getPathFromUrl(url: string): string {
  const absoluteMatch = ABSOLUTE_URL_PATTERN.exec(url);
  if (absoluteMatch) {
    return absoluteMatch[1] ?? '';
  }

  const hashIndex = url.indexOf('#');
  const withoutHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const queryIndex = withoutHash.indexOf('?');

  return queryIndex === -1 ? withoutHash : withoutHash.slice(0, queryIndex);
}

function isSafePathByte(byte: number): boolean {
  return (
    (byte >= 48 && byte <= 57) ||
    (byte >= 65 && byte <= 90) ||
    (byte >= 97 && byte <= 122) ||
    byte === 45 ||
    byte === 46 ||
    byte === 95 ||
    byte === 126 ||
    byte === 47 ||
    byte === 58
  );
}

function quotePath(path: string): string {
  const bytes = Buffer.from(path, 'utf8');
  let encodedPath = '';

  for (const byte of bytes) {
    if (isSafePathByte(byte)) {
      encodedPath += String.fromCharCode(byte);
      continue;
    }

    encodedPath += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }

  return encodedPath;
}

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

function buildSortedParams(
  params?: Record<string, string | number | boolean>,
): string {
  if (!params) {
    return '';
  }

  return Object.entries(params)
    .sort(([keyA], [keyB]) => {
      if (keyA < keyB) {
        return -1;
      }

      if (keyA > keyB) {
        return 1;
      }

      return 0;
    })
    .map(([key, value]) => `${key}${value}`)
    .join('');
}

// ---------------------------------------------------------------------------
// Body normalisation
// ---------------------------------------------------------------------------

function normalizeBody(
  method: SupportedMethod,
  body?: string | Buffer,
): string {
  if (method !== 'POST') {
    return '';
  }

  if (typeof body === 'string') {
    return body;
  }

  if (Buffer.isBuffer(body)) {
    return body.toString('utf8');
  }

  return '';
}

// ---------------------------------------------------------------------------
// Custom-header helpers
// ---------------------------------------------------------------------------

function normalizeCustomHeaderName(name: string): string {
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new Error(
      'HmacClient requires every custom header name to be a non-empty string.',
    );
  }

  return name.trim().toLowerCase();
}

function isHeaderValue(
  value: unknown,
): value is Exclude<HmacHeaderValue, null | undefined> {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function normalizeHeaderValue(
  value: Exclude<HmacHeaderValue, null | undefined>,
): string {
  return String(value).trim();
}

function appendHeaderValue(
  valuesByHeader: Map<string, string[]>,
  name: string,
  value: Exclude<HmacHeaderValue, null | undefined>,
): void {
  const normalizedName = name.trim().toLowerCase();

  if (normalizedName.length === 0) {
    return;
  }

  const normalizedValue = normalizeHeaderValue(value);
  const values = valuesByHeader.get(normalizedName);

  if (!values) {
    valuesByHeader.set(normalizedName, [normalizedValue]);
    return;
  }

  values.push(normalizedValue);
}

function appendHeaderValuesFromUnknown(
  valuesByHeader: Map<string, string[]>,
  name: string,
  value: unknown,
): void {
  if (isHeaderValue(value)) {
    appendHeaderValue(valuesByHeader, name, value);
    return;
  }

  if (!Array.isArray(value)) {
    return;
  }

  for (const item of value) {
    if (!isHeaderValue(item)) {
      continue;
    }

    appendHeaderValue(valuesByHeader, name, item);
  }
}

function collectHeaderValues(
  headers?: HmacHeadersInput,
): Map<string, string[]> {
  const valuesByHeader = new Map<string, string[]>();

  if (!headers) {
    return valuesByHeader;
  }

  if (headers instanceof Headers) {
    for (const [name, value] of headers) {
      appendHeaderValue(valuesByHeader, name, value);
    }

    return valuesByHeader;
  }

  if (Array.isArray(headers)) {
    for (const entry of headers) {
      if (!Array.isArray(entry) || entry.length < 2) {
        continue;
      }

      const [name, value] = entry;

      if (typeof name !== 'string') {
        continue;
      }

      appendHeaderValuesFromUnknown(valuesByHeader, name, value);
    }

    return valuesByHeader;
  }

  for (const [name, value] of Object.entries(headers)) {
    appendHeaderValuesFromUnknown(valuesByHeader, name, value);
  }

  return valuesByHeader;
}

function collapseHeaderValues(
  valuesByHeader: Map<string, string[]>,
): Readonly<Record<string, string>> {
  const normalizedHeaders: Record<string, string> = {};

  for (const [name, values] of valuesByHeader) {
    normalizedHeaders[name] = values.join(',');
  }

  return normalizedHeaders;
}

function buildCustomHeadersFragment(
  customHeaders: readonly NormalizedCustomHeaderRule[],
  headers?: HmacHeadersInput,
): string {
  if (customHeaders.length === 0) {
    return '';
  }

  const normalizedHeaders = collapseHeaderValues(collectHeaderValues(headers));
  const lines: string[] = [];

  for (const rule of customHeaders) {
    const normalizedValue = normalizedHeaders[rule.name];

    if (normalizedValue === undefined) {
      throw new HMACException(HTTP_UNAUTHORIZED, HMAC_INVALID_HEADERS);
    }

    let isValid = false;

    try {
      isValid = rule.validate(normalizedValue, normalizedHeaders);
    } catch {
      isValid = false;
    }

    if (!isValid) {
      throw new HMACException(HTTP_UNAUTHORIZED, HMAC_INVALID_HEADERS);
    }

    lines.push(`${rule.name}:${normalizedValue}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Signing message construction
// ---------------------------------------------------------------------------

function buildSigningMessage(
  input: HmacRequestInput,
  customHeaders: readonly NormalizedCustomHeaderRule[],
): string {
  const method = normalizeMethod(input.method);
  const path = quotePath(getPathFromUrl(input.url)).trim();
  const sortedParams = buildSortedParams(input.params).trim();
  const body = normalizeBody(method, input.body).trim();
  const customHeadersFragment = buildCustomHeadersFragment(
    customHeaders,
    input.headers,
  ).trim();

  return `${path}${sortedParams}${body}${customHeadersFragment}`;
}

// ---------------------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------------------

function signWithSecret(secret: string, message: string): string {
  return createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(message, 'utf8')
    .digest('hex');
}

function signaturesMatch(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const actualBuffer = Buffer.from(actual, 'utf8');

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

// ---------------------------------------------------------------------------
// Input normalisation helpers (exported for use by create-hmac-client)
// ---------------------------------------------------------------------------

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

function normalizeSecretName(secretName: string): string {
  if (typeof secretName !== 'string' || secretName.trim().length === 0) {
    throw new Error('HmacClient requires a non-empty secretName.');
  }

  return secretName.trim();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}

function extractSecretsFromPayload(payload: unknown): string[] {
  if (!isPlainObject(payload)) {
    throw new Error(
      'HmacClient requires AWS Secrets Manager payload to be a plain object.',
    );
  }

  const secrets = Object.values(payload);

  if (secrets.length === 0) {
    throw new Error(
      'HmacClient requires at least one secret value from AWS Secrets Manager.',
    );
  }

  const normalizedSecrets: string[] = [];

  for (const secret of secrets) {
    if (typeof secret !== 'string' || secret.length === 0) {
      throw new Error(
        'HmacClient requires every AWS secret value to be a non-empty string.',
      );
    }

    normalizedSecrets.push(secret);
  }

  return normalizedSecrets;
}

function sortHeaderRulesByName(
  a: NormalizedCustomHeaderRule,
  b: NormalizedCustomHeaderRule,
): number {
  if (a.name < b.name) {
    return -1;
  }

  if (a.name > b.name) {
    return 1;
  }

  return 0;
}

function normalizeCustomHeaderRules(
  customHeaders: HmacCustomHeaderRule[] | undefined,
): NormalizedCustomHeaderRule[] {
  if (customHeaders === undefined) {
    return [];
  }

  if (!Array.isArray(customHeaders)) {
    throw new Error(
      'HmacClient requires customHeaders to be an array when provided.',
    );
  }

  const normalizedRules: NormalizedCustomHeaderRule[] = [];
  const uniqueHeaderNames = new Set<string>();

  for (const rule of customHeaders) {
    if (typeof rule !== 'object' || rule === null) {
      throw new Error(
        'HmacClient requires every custom header rule to be an object with name and validate.',
      );
    }

    if (typeof rule.validate !== 'function') {
      throw new Error(
        'HmacClient requires every custom header rule to define a validate callback.',
      );
    }

    const normalizedName = normalizeCustomHeaderName(rule.name);

    if (uniqueHeaderNames.has(normalizedName)) {
      throw new Error(
        'HmacClient requires customHeaders to contain unique header names.',
      );
    }

    uniqueHeaderNames.add(normalizedName);
    normalizedRules.push({ name: normalizedName, validate: rule.validate });
  }

  return normalizedRules.sort(sortHeaderRulesByName);
}

// ---------------------------------------------------------------------------
// HmacClient class
// ---------------------------------------------------------------------------

export class HmacClient {
  private readonly resolveSecrets: () => Promise<string[]>;
  private readonly customHeaders: readonly NormalizedCustomHeaderRule[];
  readonly signatureHeader: string;

  /** @internal Use `createHmacClient` factory instead. */
  constructor(
    resolveSecrets: () => Promise<string[]>,
    signatureHeader: string,
    customHeaders: readonly NormalizedCustomHeaderRule[],
  ) {
    this.resolveSecrets = resolveSecrets;
    this.signatureHeader = signatureHeader;
    this.customHeaders = customHeaders;
  }

  private buildMessage(input: HmacRequestInput): string {
    return buildSigningMessage(input, this.customHeaders);
  }

  async sign(input: HmacRequestInput): Promise<string> {
    const message = this.buildMessage(input);
    const secrets = await this.resolveSecrets();
    const firstSecret = secrets[0];

    if (!firstSecret) {
      throw new Error('HmacClient requires at least one secret to sign.');
    }

    return signWithSecret(firstSecret, message);
  }

  async verify(signature: string, input: HmacRequestInput): Promise<void> {
    if (typeof signature !== 'string') {
      throw new HMACException(HTTP_UNAUTHORIZED, HMAC_INVALID_SIGNATURE);
    }

    const message = this.buildMessage(input);
    const secrets = await this.resolveSecrets();

    for (const secret of secrets) {
      const expectedSignature = signWithSecret(secret, message);

      if (signaturesMatch(expectedSignature, signature)) {
        return;
      }
    }

    throw new HMACException(HTTP_UNAUTHORIZED, HMAC_INVALID_SIGNATURE);
  }
}

export {
  extractSecretsFromPayload,
  normalizeCustomHeaderRules,
  normalizeSecretName,
  normalizeSignatureHeader,
};
