import { timingSafeEqual } from 'node:crypto';

import type {
  ExpressMiddleware,
  ExpressRequestLike,
  ExpressResponseLike,
} from '../../shared/express/services';

import {
  HMAC_INVALID_SIGNATURE,
  HMAC_MISSING_SIGNATURE,
  HMAC_UNSUPPORTED_METHOD,
} from './constants';
import { HMACException } from './exceptions';
import type {
  HMACEnvironment,
  HMACFactoryDependency,
  HMACRequestLike,
} from './types';
import { sign } from './utils';

function resolveRequestUrl(request: ExpressRequestLike): string {
  if (request.originalUrl !== undefined && request.originalUrl.length > 0) {
    return request.originalUrl.startsWith('http')
      ? request.originalUrl
      : `http://localhost${request.originalUrl}`;
  }

  if (request.path !== undefined && request.path.length > 0) {
    return request.path.startsWith('http')
      ? request.path
      : `http://localhost${request.path}`;
  }

  return 'http://localhost/';
}

function createHmacRequestFromExpress(
  request: ExpressRequestLike,
): HMACRequestLike {
  const query = request.query ?? {};

  return {
    async body(): Promise<Buffer> {
      if (request.method !== 'POST') {
        return Buffer.alloc(0);
      }

      if (typeof request.body === 'string') {
        return Buffer.from(request.body, 'utf8');
      }

      if (request.body instanceof Buffer) {
        return request.body;
      }

      if (request.body instanceof Uint8Array) {
        return Buffer.from(request.body);
      }

      if (request.body instanceof ArrayBuffer) {
        return Buffer.from(request.body);
      }

      if (request.body !== null && request.body !== undefined) {
        return Buffer.from(JSON.stringify(request.body), 'utf8');
      }

      return Buffer.alloc(0);
    },
    headers: {
      get(key: string, defaultValue?: string | null): string | null {
        const expectedKey = key.toLowerCase();
        const entry = Object.entries(request.headers).find(
          ([headerKey]) => headerKey.toLowerCase() === expectedKey,
        );
        const value = entry?.[1];

        if (value === undefined) {
          return defaultValue ?? null;
        }

        if (Array.isArray(value)) {
          return value.join(',');
        }

        return String(value);
      },
    },
    method: request.method,
    queryParams: new Map<string, string>(
      Object.entries(query).map(([key, value]) => [
        key,
        Array.isArray(value) ? value.join(',') : String(value ?? ''),
      ]),
    ),
    url: resolveRequestUrl(request),
  };
}

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

export function hmacMiddleware(env: HMACEnvironment): ExpressMiddleware {
  const verifyHmacSignature = buildHmacFactoryDependency(env);

  return async (
    request: ExpressRequestLike,
    response: ExpressResponseLike,
    next,
  ): Promise<void> => {
    try {
      await verifyHmacSignature(createHmacRequestFromExpress(request));
    } catch (error) {
      if (error instanceof HMACException) {
        response.status(error.statusCode).send(error.detail);
        return;
      }

      next(error);
      return;
    }

    next();
  };
}
