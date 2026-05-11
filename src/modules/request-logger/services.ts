import { randomUUID } from 'node:crypto';

import type {
  Context,
  ContextRequestLike,
} from '../../shared/context/services.js';
import { createLogger, LogLevel } from '../../shared/logging/services.js';
import type { PostgresPool } from '../../shared/postgres/services.js';
import {
  extractRequestData,
  validateRequestData,
} from '../../shared/requests/services.js';

import {
  REQUEST_LOGGER_CACHE_HEADER,
  REQUEST_LOGGER_HEADER,
} from './constants.js';
import type {
  RequestLoggerNext,
  RequestLoggerOverride,
  RequestLoggerResponseLike,
} from './types.js';
import { saveRequestLog } from './utils.js';

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

export async function consoleRequestLoggerMiddleware(
  pathWhitelist: string[],
  request: ContextRequestLike,
  callNext: RequestLoggerNext,
): Promise<RequestLoggerResponseLike> {
  if (pathWhitelist.includes(request.url.path)) {
    return callNext(request);
  }

  const startedAt = Date.now();
  const response = await callNext(request);
  const durationMs = Date.now() - startedAt;

  logger.info(`${request.method} ${request.url.path}`, {
    durationMs,
    statusCode: response.statusCode,
  });

  return response;
}

export async function databaseRequestLoggerMiddleware(
  pathWhitelist: string[],
  request: ContextRequestLike,
  callNext: RequestLoggerNext,
  createServiceContext: (
    request: ContextRequestLike,
  ) => Context<unknown, PostgresPool, PostgresPool, ContextRequestLike>,
  override: RequestLoggerOverride | null = null,
  tablePrefix: string | null = null,
): Promise<RequestLoggerResponseLike> {
  if (pathWhitelist.includes(request.url.path)) {
    return callNext(request);
  }

  const requestUuid = randomUUID();
  request.state ??= {};
  request.state.requestUuid = requestUuid;

  const ctx = createServiceContext(request);
  const requestData = applyOverride(
    await extractRequestData(request),
    override,
  );

  try {
    validateRequestData(requestData);
  } catch (error) {
    logger.error(`databaseRequestLoggerMiddleware: ${String(error)}`);
    return {
      statusCode: 400,
      headers: {},
      body: JSON.stringify({ error: String(error) }),
    };
  }

  const startedAt = Date.now();

  try {
    const response = await callNext(request);
    const durationMs = Date.now() - startedAt;
    const headers = {
      ...response.headers,
      [REQUEST_LOGGER_HEADER]: requestUuid,
    };

    await saveRequestLog(
      {
        ctx,
        path: requestData.path,
        fromCache: REQUEST_LOGGER_CACHE_HEADER in response.headers,
        productName: requestData.productName,
        productModule: requestData.productModule,
        productFeature: requestData.productFeature,
        productTenant: requestData.productTenant,
        requestHeaders: requestData.requestHeaders,
        requestBody: requestData.requestBody,
        responseHeaders: JSON.stringify(headers),
        responseBody: response.body ?? '',
        statusCode: response.statusCode,
        durationMs,
        requestUuid,
      },
      tablePrefix,
    );

    return {
      ...response,
      headers,
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;

    await saveRequestLog(
      {
        ctx,
        path: requestData.path,
        fromCache: false,
        productName: requestData.productName,
        productModule: requestData.productModule,
        productFeature: requestData.productFeature,
        productTenant: requestData.productTenant,
        requestHeaders: requestData.requestHeaders,
        requestBody: requestData.requestBody,
        responseHeaders: null,
        responseBody: null,
        statusCode: 500,
        durationMs,
        requestUuid,
      },
      tablePrefix,
    );

    throw error;
  }
}
