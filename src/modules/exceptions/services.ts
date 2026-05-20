import { createLogger, LogLevel } from '../../shared/logging/services';
import type { ContextRequestLike } from '../../shared/context/services';

const logger = createLogger('exceptions', { logLevel: LogLevel.DEBUG });

type ErrorType<TError extends Error = Error> = abstract new (
  ...args: never[]
) => TError;

export type LogLevelName = 'debug' | 'info' | 'warning' | 'error' | 'critical';

export interface RequestMetadata {
  method: string;
  path: string;
  requestId: string;
}

export interface ValidationErrorLike {
  errors(): readonly unknown[];
}

export interface ExceptionRequestLike extends ContextRequestLike {
  bodyText?: string;
}

export interface ExceptionHandlerResponse {
  content: Record<string, unknown> | null;
  statusCode: number;
}

export type ContentBuilder = (
  request: ExceptionRequestLike,
  error: Error,
  metadata: RequestMetadata,
) =>
  | Promise<readonly [Record<string, unknown> | null, Record<string, unknown>]>
  | readonly [Record<string, unknown> | null, Record<string, unknown>];

export interface HandlerRule {
  contentBuilder?: ContentBuilder;
  errorType: ErrorType;
  includeDetail?: boolean;
  logLevel?: LogLevelName | null;
  statusCode: number;
}

export interface HandlerRuleMatch {
  handler: ExceptionHandler;
  rule: HandlerRule;
}

export type ExceptionHandler = (
  request: ExceptionRequestLike,
  error: Error,
) => Promise<ExceptionHandlerResponse>;

function toLoggerMethod(
  logLevel: LogLevelName,
): 'debug' | 'info' | 'warning' | 'error' | 'critical' {
  return logLevel;
}

function isValidationErrorLike(value: unknown): value is ValidationErrorLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    'errors' in value &&
    typeof (value as ValidationErrorLike).errors === 'function'
  );
}

export function getRequestMetadata(
  request: ExceptionRequestLike,
): RequestMetadata {
  const requestId =
    typeof request.state?.requestId === 'string'
      ? request.state.requestId
      : 'unknown';

  return {
    requestId,
    path: request.url.path,
    method: request.method,
  };
}

export async function buildValidationContent(
  request: ExceptionRequestLike,
  error: Error,
  metadata: RequestMetadata,
): Promise<readonly [Record<string, unknown>, Record<string, unknown>]> {
  const body = request.bodyText ?? '<unavailable>';
  const validationErrors = isValidationErrorLike(error) ? error.errors() : [];
  const errorCount = validationErrors.length;

  const content = {
    detail: 'Request validation failed',
    ...metadata,
    errorCount,
    errors: validationErrors,
    body,
  };

  return [
    content,
    {
      errorCount,
      errors: validationErrors,
      body,
    },
  ] as const;
}

export async function buildClientErrorContent(
  _request: ExceptionRequestLike,
  error: Error,
  metadata: RequestMetadata,
): Promise<readonly [Record<string, unknown>, Record<string, unknown>]> {
  const response = (error as Error & { response?: Record<string, unknown> })
    .response;

  if (response === undefined) {
    return [{ detail: 'AWS service error', ...metadata }, {}] as const;
  }

  const errorInfo =
    typeof response.Error === 'object' && response.Error !== null
      ? (response.Error as Record<string, unknown>)
      : {};
  const responseMetadata =
    typeof response.ResponseMetadata === 'object' &&
    response.ResponseMetadata !== null
      ? (response.ResponseMetadata as Record<string, unknown>)
      : {};

  const awsMetadata = {
    awsRequestId:
      typeof responseMetadata.RequestId === 'string'
        ? responseMetadata.RequestId
        : 'unknown',
    httpStatusCode:
      typeof responseMetadata.HTTPStatusCode === 'number'
        ? responseMetadata.HTTPStatusCode
        : 0,
    errorCode:
      typeof errorInfo.Code === 'string' ? errorInfo.Code : 'UnknownError',
    errorMessage:
      typeof errorInfo.Message === 'string' ? errorInfo.Message : 'No message',
  };

  return [
    { detail: 'AWS service error', awsMetadata, ...metadata },
    { awsMetadata },
  ] as const;
}

export async function buildUnexpectedContent(
  _request: ExceptionRequestLike,
  error: Error,
  metadata: RequestMetadata,
): Promise<readonly [Record<string, unknown>, Record<string, unknown>]> {
  const exceptionType = error.name || 'Error';

  return [
    { detail: `Internal Server Error (${exceptionType})`, ...metadata },
    { exceptionType },
  ] as const;
}

function createHandler(rule: HandlerRule): ExceptionHandler {
  return async (
    request: ExceptionRequestLike,
    error: Error,
  ): Promise<ExceptionHandlerResponse> => {
    const metadata = getRequestMetadata(request);

    let content: Record<string, unknown> | null;
    let logExtras: Record<string, unknown> = {};

    if (rule.contentBuilder !== undefined) {
      [content, logExtras] = await rule.contentBuilder(
        request,
        error,
        metadata,
      );
    } else if (rule.includeDetail ?? true) {
      content = { detail: error.message, ...metadata };
    } else {
      content = null;
    }

    if (rule.logLevel !== null && rule.logLevel !== undefined) {
      const logMethod = toLoggerMethod(rule.logLevel);
      logger[logMethod](`createExceptionHandler:${error.name}`, {
        ...metadata,
        ...logExtras,
        errorMessage: error.message,
      });
    }

    return {
      statusCode: rule.statusCode,
      content,
    };
  };
}

export function createExceptionHandlers(
  rules: HandlerRule[],
): Map<ErrorType, ExceptionHandler> {
  const handlers = new Map<ErrorType, ExceptionHandler>();

  for (const rule of rules) {
    handlers.set(rule.errorType, createHandler(rule));
  }

  return handlers;
}

export function createExceptionHandler(
  rules: HandlerRule[],
): (
  request: ExceptionRequestLike,
  error: Error,
) => Promise<ExceptionHandlerResponse> {
  const handlers = rules.map((rule) => ({
    rule,
    handler: createHandler(rule),
  }));

  return async (
    request: ExceptionRequestLike,
    error: Error,
  ): Promise<ExceptionHandlerResponse> => {
    const matchedHandler = handlers.find(
      ({ rule }) => error instanceof rule.errorType,
    );

    if (matchedHandler !== undefined) {
      return matchedHandler.handler(request, error);
    }

    const metadata = getRequestMetadata(request);
    logger.error('createExceptionHandler:Unhandled exception', {
      ...metadata,
      errorMessage: error.message,
      errorName: error.name,
    });

    return {
      statusCode: 500,
      content: { detail: 'Unhandled exception', ...metadata },
    };
  };
}
