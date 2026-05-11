import { timingSafeEqual } from 'node:crypto';

import {
  HMAC_INVALID_SIGNATURE,
  HMAC_MISSING_SIGNATURE,
  HMAC_UNSUPPORTED_METHOD,
} from './constants.js';
import { HMACException } from './exceptions.js';
import type {
  HMACEnvironment,
  HMACFactoryDependency,
  HMACRequestLike,
} from './types.js';
import { sign } from './utils.js';

function normalizeQueryParams(
  queryParams: HMACRequestLike['queryParams'],
): Record<string, string> {
  return Object.fromEntries(queryParams.entries());
}

function signaturesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export async function requireHmacSignature(
  request: HMACRequestLike,
  env: HMACEnvironment,
): Promise<void> {
  const signature = request.headers.get(env.HMAC_HEADER_NAME, null);

  if (signature === null || signature === undefined) {
    throw new HMACException(401, HMAC_MISSING_SIGNATURE);
  }

  if (request.method !== 'GET' && request.method !== 'POST') {
    throw new HMACException(401, HMAC_UNSUPPORTED_METHOD);
  }

  const params = normalizeQueryParams(request.queryParams);
  const body = request.method === 'POST' ? await request.body() : null;

  const isValid = env.SECRETS.some((secret) => {
    const expectedSignature = sign(secret, request.url, params, body);
    return signaturesMatch(expectedSignature, signature);
  });

  if (!isValid) {
    throw new HMACException(401, HMAC_INVALID_SIGNATURE);
  }
}

export function buildHmacFactoryDependency(
  env: HMACEnvironment,
): HMACFactoryDependency {
  if (env.HMAC_HEADER_NAME.trim() === '') {
    throw new Error(
      'requireHmacSignature:HMAC_HEADER_NAME must be set in the environment',
    );
  }

  if (!Array.isArray(env.SECRETS) || env.SECRETS.length === 0) {
    throw new Error(
      'requireHmacSignature:SECRETS must be a non-empty list in the environment',
    );
  }

  return async (request: HMACRequestLike): Promise<void> => {
    await requireHmacSignature(request, env);
  };
}
