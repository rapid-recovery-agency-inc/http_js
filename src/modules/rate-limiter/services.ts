import type {
  Context,
  ContextRequestLike,
} from '../../shared/context/services';
import { createLogger, LogLevel } from '../../shared/logging/services';
import type { PostgresPool } from '../postgres/services';
import { extractRequestData } from '../../shared/requests/services';

import { RULE_CACHING_EXPIRATION_IN_SECONDS } from './constants';
import { RateLimitException } from './types';
import { assertCapacity } from './utils';

const logger = createLogger('rate-limiter', { logLevel: LogLevel.DEBUG });

export async function rateLimiterMiddleware(
  pathWhitelist: string[],
  request: ContextRequestLike,
  callNext: (request: ContextRequestLike) => Promise<{
    body?: string;
    headers: Record<string, string>;
    statusCode: number;
  }>,
  createServiceContext: (
    request: ContextRequestLike,
  ) => Context<unknown, PostgresPool, PostgresPool, ContextRequestLike>,
  ruleCachingExpirationSeconds = RULE_CACHING_EXPIRATION_IN_SECONDS,
  tablePrefix: string | null = null,
): Promise<{
  body?: string;
  headers: Record<string, string>;
  statusCode: number;
}> {
  if (pathWhitelist.includes(request.url.path)) {
    return callNext(request);
  }

  const ctx = createServiceContext(request);
  const requestData = await extractRequestData(request);

  try {
    await assertCapacity(
      requestData,
      ctx,
      ruleCachingExpirationSeconds,
      tablePrefix,
    );
  } catch (error) {
    if (error instanceof RateLimitException) {
      const detail = `${error.name}: ${error.message}`;
      logger.error('rateLimiterMiddleware:RateLimitException', {
        detail,
        path: request.url.path,
      });
      return {
        statusCode: 429,
        headers: {},
        body: detail,
      };
    }

    throw error;
  }

  return callNext(request);
}
