import { randomUUID } from 'node:crypto';

import type {
  ContextRequestLike,
  ServiceContext,
} from '../../shared/context/services';
import {
  createContextRequestFromExpress,
  type ExpressMiddleware,
  type ExpressRequestLike,
  type ExpressResponseLike,
  hasExpressHeader,
  normalizeExpressHeaders,
  stringifyExpressBody,
} from '../../shared/express/services';
import { createLogger, LogLevel } from '../../shared/logging/services';
import {
  extractRequestData,
  validateRequestData,
} from '../../shared/requests/services';

import {
  REQUEST_LOGGER_CACHE_HEADER,
  REQUEST_LOGGER_HEADER,
} from './constants';
import type {
  RequestLoggerOverride,
  RequestLoggerPersistenceLike,
} from './types';
import { saveRequestLog } from './utils';

const logger = createLogger('request-logger', { logLevel: LogLevel.DEBUG });

function applyOverride(
  requestData: Awaited<ReturnType<typeof extractRequestData>>,
  override: RequestLoggerOverride | null,
): Awaited<ReturnType<typeof extractRequestData>> {
  return {
    ...requestData,
    ...(override?.productName === undefined
      ? {}
      : { productName: override.productName }),
    ...(override?.productModule === undefined
      ? {}
      : { productModule: override.productModule }),
    ...(override?.productFeature === undefined
      ? {}
      : { productFeature: override.productFeature }),
    ...(override?.productTenant === undefined
      ? {}
      : { productTenant: override.productTenant }),
    ...(override?.requestHeaders === undefined ||
    override.requestHeaders === null
      ? {}
      : { requestHeaders: override.requestHeaders }),
    ...(override?.requestBody === undefined || override.requestBody === null
      ? {}
      : { requestBody: override.requestBody }),
  };
}

function createSingleExecutionCallback<TArgs extends unknown[]>(
  callback: (...args: TArgs) => void,
): (...args: TArgs) => void {
  let hasRun = false;

  return (...args: TArgs): void => {
    if (hasRun) {
      return;
    }

    hasRun = true;
    callback(...args);
  };
}

function attachResponseBodyTracker(
  response: ExpressResponseLike,
): () => string | null {
  let responseBody: string | null = null;

  const mutableResponse = response as ExpressResponseLike & {
    end(body?: unknown): ExpressResponseLike;
    json(body: unknown): ExpressResponseLike;
    send(body?: unknown): ExpressResponseLike;
  };
  const originalSend = mutableResponse.send.bind(mutableResponse);
  const originalJson = mutableResponse.json.bind(mutableResponse);
  const originalEnd = mutableResponse.end.bind(mutableResponse);

  mutableResponse.send = (body?: unknown): ExpressResponseLike => {
    if (body !== undefined) {
      responseBody = stringifyExpressBody(body);
    }

    return originalSend(body);
  };
  mutableResponse.json = (body: unknown): ExpressResponseLike => {
    responseBody = stringifyExpressBody(body);
    return originalJson(body);
  };
  mutableResponse.end = (body?: unknown): ExpressResponseLike => {
    if (body !== undefined) {
      responseBody = stringifyExpressBody(body);
    }

    return originalEnd(body);
  };

  return (): string | null => responseBody;
}

export function consoleRequestLoggerMiddleware(
  pathWhitelist: string[],
): ExpressMiddleware {
  return (
    request: ExpressRequestLike,
    response: ExpressResponseLike,
    next,
  ): void => {
    const contextRequest = createContextRequestFromExpress(request);

    if (pathWhitelist.includes(contextRequest.url.path)) {
      next();
      return;
    }

    const startedAt = Date.now();

    response.on('finish', () => {
      const durationMs = Date.now() - startedAt;

      logger.info(`${contextRequest.method} ${contextRequest.url.path}`, {
        durationMs,
        statusCode: response.statusCode,
      });
    });

    next();
  };
}

export function databaseRequestLoggerMiddleware(
  pathWhitelist: string[],
  createServiceContext: (
    request: ContextRequestLike,
  ) => ServiceContext<
    RequestLoggerPersistenceLike,
    RequestLoggerPersistenceLike
  >,
  override: RequestLoggerOverride | null = null,
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

    const requestUuid = randomUUID();
    contextRequest.state.requestUuid = requestUuid;

    let requestData;
    try {
      requestData = applyOverride(
        await extractRequestData(contextRequest),
        override,
      );
      validateRequestData(requestData);
    } catch (error) {
      logger.error(`databaseRequestLoggerMiddleware: ${String(error)}`);
      response.status(400).json({ error: String(error) });
      return;
    }

    const ctx = createServiceContext(contextRequest);
    const startedAt = Date.now();
    const getResponseBody = attachResponseBodyTracker(response);
    const finalizeLog = createSingleExecutionCallback(
      (responseWasFinished: boolean): void => {
        const durationMs = Date.now() - startedAt;
        const responseHeaders = responseWasFinished
          ? JSON.stringify(normalizeExpressHeaders(response.getHeaders()))
          : null;
        const responseBody = responseWasFinished ? getResponseBody() : null;

        void saveRequestLog(
          {
            ctx,
            path: requestData.path,
            fromCache: hasExpressHeader(response, REQUEST_LOGGER_CACHE_HEADER),
            productName: requestData.productName,
            productModule: requestData.productModule,
            productFeature: requestData.productFeature,
            productTenant: requestData.productTenant,
            requestHeaders: requestData.requestHeaders,
            requestBody: requestData.requestBody,
            responseHeaders,
            responseBody,
            statusCode: response.statusCode,
            durationMs,
            requestUuid,
          },
          tablePrefix,
        ).catch((error) => {
          logger.error(`Failed to save request log: ${String(error)}`);
        });
      },
    );

    response.on('finish', () => {
      finalizeLog(true);
    });
    response.on('close', () => {
      finalizeLog(false);
    });
    response.setHeader(REQUEST_LOGGER_HEADER, requestUuid);

    next();
  };
}
