import type {
  ContextRequestLike,
  ServiceContext,
} from '../../shared/context/services';
import {
  createContextRequestFromExpress,
  type ExpressMiddleware,
  type ExpressRequestLike,
  type ExpressResponseLike,
} from '../../shared/express/services';
import { createLogger, LogLevel } from '../../shared/logging/services';
import { extractRequestData } from '../../shared/requests/services';

import { RULE_CACHING_EXPIRATION_IN_SECONDS } from './constants';
import { type RateLimiterRepositoryLike, RateLimitException } from './types';
import { assertCapacity } from './utils';

const logger = createLogger('rate-limiter', { logLevel: LogLevel.DEBUG });

export function rateLimiterMiddleware(
  pathWhitelist: string[],
  createServiceContext: (
    request: ContextRequestLike,
  ) => ServiceContext<RateLimiterRepositoryLike, RateLimiterRepositoryLike>,
  ruleCachingExpirationSeconds = RULE_CACHING_EXPIRATION_IN_SECONDS,
  tablePrefix: string | null = null,
): ExpressMiddleware {
  return async (
    request: ExpressRequestLike,
    response: ExpressResponseLike,
    next,
  ): Promise<void> => {
    const contextRequest = createContextRequestFromExpress(request);

    if (pathWhitelist.includes(contextRequest.url.path)) {
      next();
      return;
    }

    try {
      const ctx = createServiceContext(contextRequest);
      const requestData = await extractRequestData(contextRequest);

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
          path: contextRequest.url.path,
        });
        response.status(429).send(detail);
        return;
      }

      next(error);
      return;
    }

    next();
  };
}
