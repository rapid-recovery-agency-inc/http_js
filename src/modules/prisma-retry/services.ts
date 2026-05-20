import { msleep } from '../../shared/utils/sleep';
import { createLogger, type LogContext } from '../../shared/logging/services';

const logger = createLogger('prisma-retry');

export interface RetryOptions {
  maxAttempts: number;
  baseDelay: number;
  jitter: number;
  timeout: number | null;
}

export const PRISMA_RETRIES_OPTIONS_DEFAULTS: RetryOptions = {
  maxAttempts: 3,
  baseDelay: 100,
  jitter: 150,
  timeout: null,
};

type ErrorConstructor<TError extends Error = Error> = new (
  ...args: any[]
) => TError;

type KnownRequestError = Error & { code: string };

export interface PrismaRetryRuntime {
  defineExtension<TExtension>(extension: TExtension): TExtension;
  PrismaClientKnownRequestError?: ErrorConstructor<KnownRequestError>;
  PrismaClientUnknownRequestError?: ErrorConstructor;
  PrismaClientRustPanicError?: ErrorConstructor;
  PrismaClientValidationError?: ErrorConstructor;
}

interface PrismaModelOperationParams<TArgs, TResult> {
  operation: string;
  model?: string | null;
  args: TArgs;
  query: (args: TArgs) => Promise<TResult>;
}

interface PrismaOperationParams<TArgs, TResult> {
  operation: string;
  args: TArgs;
  query: (args: TArgs) => Promise<TResult>;
}

interface PrismaRetryExtension {
  name: string;
  query: {
    $allModels: {
      $allOperations<TArgs, TResult>(
        params: PrismaModelOperationParams<TArgs, TResult>,
      ): Promise<TResult>;
    };
    $allOperations<TArgs, TResult>(
      params: PrismaOperationParams<TArgs, TResult>,
    ): Promise<TResult>;
  };
}

export interface RetryExecutionSettings<T> {
  operationName: string;
  execute: () => Promise<T>;
  maxAttempts: number;
  baseDelay: number;
  jitter: number;
  timeout: number | null;
  logContext: LogContext;
}

// REF: https://www.prisma.io/docs/orm/reference/error-reference
export const RETRYABLE_ERROR_CODES = new Set<string>([
  'P1001', // Can't reach database server
  'P1002', // Database server timeout
  'P1008', // Operations timed out
  'P1011', // The database connection was lost
  'P1017', // Server closed the connection
  'P2024', // Timed out fetching connection from pool
  'P2028', // Deadlock detected
  'P2034', // Transaction failed due to write conflict or deadlock
  'P2036', // Error in external database connector
  'P2037', // Too many connections to the database server
]);

export const RETRYABLE_ERROR_MESSAGES = new Set<string>([
  'timed out',
  'timeout',
  'connection',
  'connection timeout',
  'econnreset',
  'econnrefused',
  'etimedout',
  'ehostunreach',
  'epipe',
  'deadlock',
  'lock wait timeout',
  'connection lost',
  'server has gone away',
]);

export class PrismaRetryTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrismaRetryTimeoutError';
  }
}

export const calculateDelay = (
  attempt: number,
  baseDelay: number,
  jitter: number,
): number => {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitterValue = Math.random() * jitter;
  return exponentialDelay + jitterValue;
};

function isErrorInstance(
  error: unknown,
  errorConstructor?: ErrorConstructor,
): boolean {
  return errorConstructor !== undefined && error instanceof errorConstructor;
}

function getErrorCode(error: unknown): string | null {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code;
  }

  return null;
}

function hasRetryableMessage(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidateTexts: string[] = [];

  if ('message' in error && typeof error.message === 'string') {
    candidateTexts.push(error.message.toLowerCase());
  }

  if ('name' in error && typeof error.name === 'string') {
    candidateTexts.push(error.name.toLowerCase());
  }

  return candidateTexts.some((text) =>
    [...RETRYABLE_ERROR_MESSAGES].some((fragment) => text.includes(fragment)),
  );
}

export const shouldRetry = (
  error: unknown,
  prisma?: PrismaRetryRuntime,
): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  if (error instanceof PrismaRetryTimeoutError) {
    return true;
  }

  if (isErrorInstance(error, prisma?.PrismaClientValidationError)) {
    return false;
  }

  if (hasRetryableMessage(error)) {
    return true;
  }

  if (isErrorInstance(error, prisma?.PrismaClientUnknownRequestError)) {
    return true;
  }

  if (isErrorInstance(error, prisma?.PrismaClientRustPanicError)) {
    return true;
  }

  const errorCode = getErrorCode(error);
  if (errorCode !== null && RETRYABLE_ERROR_CODES.has(errorCode)) {
    return true;
  }

  return false;
};

function validateRetryOptions(options: RetryOptions): RetryOptions {
  if (!Number.isInteger(options.maxAttempts) || options.maxAttempts < 1) {
    throw new Error(
      'prismaRetryExtension: maxAttempts must be an integer >= 1',
    );
  }

  if (options.baseDelay < 0 || options.jitter < 0) {
    throw new Error('prismaRetryExtension: baseDelay and jitter must be >= 0');
  }

  if (options.timeout !== null && options.timeout < 0) {
    throw new Error('prismaRetryExtension: timeout must be null or >= 0');
  }

  return options;
}

export const createTimeoutPromise = (
  timeoutMs: number,
  operation: string,
): { promise: Promise<never>; cancel: () => void } => {
  let timer: ReturnType<typeof setTimeout>;
  const promise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new PrismaRetryTimeoutError(
          `Operation '${operation}' timed out after ${timeoutMs}ms`,
        ),
      );
    }, timeoutMs);
  });
  return {
    promise,
    cancel: () => clearTimeout(timer),
  };
};

export const executeWithTimeout = async <T>(
  queryPromise: Promise<T>,
  timeoutMs: number,
  operation: string,
): Promise<T> => {
  const { promise: timeoutPromise, cancel } = createTimeoutPromise(
    timeoutMs,
    operation,
  );

  try {
    const result = await Promise.race([queryPromise, timeoutPromise]);
    cancel();
    return result as T;
  } catch (error) {
    cancel();
    throw error;
  }
};

const executeWithRetry = async <T>(
  settings: RetryExecutionSettings<T>,
  prisma?: PrismaRetryRuntime,
): Promise<T> => {
  const { logContext, operationName, timeout, execute, maxAttempts } = settings;
  let lastError: unknown = null;

  const errorHint = ` Operation: ${operationName}:`;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await (timeout !== null
        ? executeWithTimeout(execute(), timeout, operationName)
        : execute());
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts - 1) {
        logger.error(
          `executeWithRetry: ${errorHint} failed: attempts exhausted.`,
          logContext,
          error,
        );
        throw error;
      }

      if (!shouldRetry(error, prisma)) {
        logger.error(
          `executeWithRetry: ${errorHint} failed without recovery.`,
          {
            ...logContext,
            error,
          },
        );
        throw error;
      }

      const delay = calculateDelay(
        attempt,
        settings.baseDelay,
        settings.jitter,
      );
      const warnMessage = `executeWithRetry: ${errorHint} failed (attempt ${attempt + 1}/${
        settings.maxAttempts
      }). Retrying in ${delay}ms...`;

      logger.warn(warnMessage, logContext, error);
      await msleep(delay);
    }
  }

  logger.error(`executeWithRetry: ${errorHint} failed and exhausted retries.`, {
    ...settings.logContext,
    error: lastError,
  });

  throw (
    lastError ?? new Error(`${errorHint} failed without providing an error.`)
  );
};

export const prismaRetryExtension = (
  prisma: PrismaRetryRuntime,
  options: Partial<RetryOptions> = {},
): PrismaRetryExtension => {
  const { maxAttempts, baseDelay, jitter, timeout } = validateRetryOptions({
    ...PRISMA_RETRIES_OPTIONS_DEFAULTS,
    ...options,
  });

  return prisma.defineExtension({
    name: 'prisma-retry-extension',
    query: {
      $allModels: {
        async $allOperations<TArgs, TResult>({
          operation,
          model,
          args,
          query,
        }: PrismaModelOperationParams<TArgs, TResult>) {
          const operationName = `${model}.${operation}`;
          return executeWithRetry(
            {
              operationName,
              execute: () => query(args),
              maxAttempts,
              baseDelay,
              jitter,
              timeout,
              logContext: { model: model ?? null, operation: operationName },
            },
            prisma,
          );
        },
      },
      async $allOperations<TArgs, TResult>({
        operation,
        args,
        query,
      }: PrismaOperationParams<TArgs, TResult>) {
        return executeWithRetry(
          {
            operationName: operation,
            execute: () => query(args),
            maxAttempts,
            baseDelay,
            jitter,
            timeout,
            logContext: { model: null, operation, args },
          },
          prisma,
        );
      },
    },
  });
};
