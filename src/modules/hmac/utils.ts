import { createHmac } from 'node:crypto';

import { buildHmacMessage, signHmacMessage } from './core';

function encodeLegacyPath(url: URL): string {
  return url.pathname
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export function sign(
  secretKey: string,
  url: string,
  params: Record<string, unknown> | null = null,
  body: Uint8Array | Buffer | null = null,
): string {
  return signHmacMessage(
    secretKey,
    buildHmacMessage({
      ...(body === null ? {} : { body }),
      method: body === null ? 'GET' : 'POST',
      ...(params === null ? {} : { params }),
      url,
    }),
  );
}

export function signLegacyHmac(
  secretKey: string,
  url: string,
  params: Record<string, unknown> | null = null,
  body: Uint8Array | Buffer | null = null,
): string {
  const parsedUrl = new URL(url);
  const path = encodeLegacyPath(parsedUrl);
  const sortedParams =
    params === null
      ? ''
      : Object.entries(params)
          .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
          .map(([key, value]) => `${key}${String(value)}`)
          .join('');
  const bodyString = body === null ? '' : Buffer.from(body).toString('utf8');
  const message = `${path.trim()}${sortedParams.trim()}${bodyString.trim()}`;

  return createHmac('sha256', secretKey).update(message, 'utf8').digest('hex');
}
