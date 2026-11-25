import { createHmac, timingSafeEqual } from 'node:crypto';

import {
  HMAC_INVALID_HEADERS,
  HMAC_INVALID_SIGNATURE,
  HMAC_UNSUPPORTED_METHOD,
} from './constants';
import { HmacError } from './exceptions';
import type {
  HmacCustomHeaderRule,
  HmacHeadersInput,
  HmacHeaderValue,
  HmacRequestInput,
  HmacSecretResolver,
} from './types';

const HTTP_UNAUTHORIZED = 401;
const ABSOLUTE_URL_PATTERN = /^[A-Za-z][A-Za-z\d+.-]*:\/\/[^/?#]*(\/[^?#]*)?/u;

export type SupportedHmacMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST';

interface NormalizedCustomHeaderRule {
  name: string;
  validate: (
    value: string,
    headers: Readonly<Record<string, string>>,
  ) => boolean;
}

export function normalizeHmacMethod(method: string): SupportedHmacMethod {
  if (typeof method !== 'string') {
    throw new HmacError(HTTP_UNAUTHORIZED, HMAC_UNSUPPORTED_METHOD);
  }

  const normalizedMethod = method.trim().toUpperCase();

  if (
    normalizedMethod === 'GET' ||
    normalizedMethod === 'POST' ||
    normalizedMethod === 'PATCH' ||
    normalizedMethod === 'DELETE'
  ) {
    return normalizedMethod;
  }

  throw new HmacError(HTTP_UNAUTHORIZED, HMAC_UNSUPPORTED_METHOD);
}

function getPathFromUrl(url: string): string {
  const absoluteMatch = ABSOLUTE_URL_PATTERN.exec(url);
  if (absoluteMatch !== null) {
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

export function encodeHmacPath(path: string): string {
  let encodedPath = '';

  for (const byte of Buffer.from(path, 'utf8')) {
    encodedPath += isSafePathByte(byte)
      ? String.fromCharCode(byte)
      : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }

  return encodedPath;
}

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function buildSortedParams(
  params: Readonly<Record<string, unknown>> | null | undefined,
): string {
  if (params === null || params === undefined) {
    return '';
  }

  return Object.entries(params)
    .sort(([leftKey], [rightKey]) => compareStrings(leftKey, rightKey))
    .map(([key, value]) => `${key}${String(value)}`)
    .join('');
}

function normalizeBody(
  method: SupportedHmacMethod,
  body: string | Uint8Array | null | undefined,
): string {
  if (method === 'GET' || body === null || body === undefined) {
    return '';
  }

  return typeof body === 'string' ? body : Buffer.from(body).toString('utf8');
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

function appendHeaderValue(
  valuesByHeader: Map<string, string[]>,
  name: string,
  value: Exclude<HmacHeaderValue, null | undefined>,
): void {
  const normalizedName = name.trim().toLowerCase();
  if (normalizedName.length === 0) {
    return;
  }

  const normalizedValue = String(value).trim();
  const values = valuesByHeader.get(normalizedName);

  if (values === undefined) {
    valuesByHeader.set(normalizedName, [normalizedValue]);
    return;
  }

  values.push(normalizedValue);
}

function appendHeaderValues(
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
    if (isHeaderValue(item)) {
      appendHeaderValue(valuesByHeader, name, item);
    }
  }
}

export function normalizeHmacHeaders(
  headers: HmacHeadersInput | undefined,
): Readonly<Record<string, string>> {
  const valuesByHeader = new Map<string, string[]>();

  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    for (const [name, value] of headers) {
      appendHeaderValue(valuesByHeader, name, value);
    }
  } else if (Array.isArray(headers)) {
    for (const entry of headers) {
      if (entry.length >= 2) {
        appendHeaderValues(valuesByHeader, entry[0], entry[1]);
      }
    }
  } else if (headers !== undefined) {
    for (const [name, value] of Object.entries(headers)) {
      appendHeaderValues(valuesByHeader, name, value);
    }
  }

  return Object.fromEntries(
    Array.from(valuesByHeader.entries()).map(([name, values]) => [
      name,
      values.join(','),
    ]),
  );
}

function normalizeCustomHeaderName(name: string): string {
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new Error(
      'HmacClient requires every custom header name to be a non-empty string.',
    );
  }

  return name.trim().toLowerCase();
}

export function normalizeCustomHeaderRules(
  customHeaders: readonly HmacCustomHeaderRule[] | undefined,
): readonly NormalizedCustomHeaderRule[] {
  if (customHeaders === undefined) {
    return [];
  }

  if (!Array.isArray(customHeaders)) {
    throw new Error(
      'HmacClient requires customHeaders to be an array when provided.',
    );
  }

  const names = new Set<string>();
  const rules = customHeaders.map((rule) => {
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

    const name = normalizeCustomHeaderName(rule.name);
    if (names.has(name)) {
      throw new Error(
        'HmacClient requires customHeaders to contain unique header names.',
      );
    }

    names.add(name);
    return { name, validate: rule.validate };
  });

  return rules.sort((left, right) => compareStrings(left.name, right.name));
}

function buildCustomHeadersFragment(
  rules: readonly NormalizedCustomHeaderRule[],
  headers: HmacHeadersInput | undefined,
): string {
  if (rules.length === 0) {
    return '';
  }

  const normalizedHeaders = normalizeHmacHeaders(headers);
  const lines: string[] = [];

  for (const rule of rules) {
    const value = normalizedHeaders[rule.name];
    if (value === undefined) {
      throw new HmacError(HTTP_UNAUTHORIZED, HMAC_INVALID_HEADERS);
    }

    let isValid = false;
    try {
      isValid = rule.validate(value, normalizedHeaders);
    } catch {
      isValid = false;
    }

    if (!isValid) {
      throw new HmacError(HTTP_UNAUTHORIZED, HMAC_INVALID_HEADERS);
    }

    lines.push(`${rule.name}:${value}`);
  }

  return lines.join('\n');
}

export function buildHmacMessage(
  input: HmacRequestInput,
  customHeaders: readonly HmacCustomHeaderRule[] = [],
): string {
  const method = normalizeHmacMethod(input.method);
  const path = encodeHmacPath(getPathFromUrl(input.url)).trim();
  const params = buildSortedParams(input.params).trim();
  const body = normalizeBody(method, input.body).trim();
  const rules = normalizeCustomHeaderRules(customHeaders);
  const headers = buildCustomHeadersFragment(rules, input.headers).trim();

  return `${path}${params}${body}${headers}`;
}

export function signHmacMessage(secret: string, message: string): string {
  return createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(message, 'utf8')
    .digest('hex');
}

export function hmacSignaturesMatch(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const actualBuffer = Buffer.from(actual, 'utf8');

  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

export function validateHmacSecrets(secrets: readonly string[]): string[] {
  if (!Array.isArray(secrets) || secrets.length === 0) {
    throw new Error('HmacClient requires at least one non-empty secret.');
  }

  if (
    secrets.some((secret) => typeof secret !== 'string' || secret.length === 0)
  ) {
    throw new Error(
      'HmacClient requires every secret value to be a non-empty string.',
    );
  }

  return [...secrets];
}

export function createLazyHmacSecretResolver(
  resolver: HmacSecretResolver,
): HmacSecretResolver {
  let secretsPromise: Promise<readonly string[]> | undefined;

  return (): Promise<readonly string[]> => {
    if (secretsPromise === undefined) {
      try {
        secretsPromise = Promise.resolve(resolver())
          .then(validateHmacSecrets)
          .catch((error: unknown) => {
            secretsPromise = undefined;
            throw error;
          });
      } catch (error) {
        return Promise.reject(error);
      }
    }

    return secretsPromise;
  };
}

export async function verifyHmacMessage(
  signature: string,
  message: string,
  secrets: readonly string[],
): Promise<void> {
  if (typeof signature !== 'string') {
    throw new HmacError(HTTP_UNAUTHORIZED, HMAC_INVALID_SIGNATURE);
  }

  for (const secret of secrets) {
    if (hmacSignaturesMatch(signHmacMessage(secret, message), signature)) {
      return;
    }
  }

  throw new HmacError(HTTP_UNAUTHORIZED, HMAC_INVALID_SIGNATURE);
}
