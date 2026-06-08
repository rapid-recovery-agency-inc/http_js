import { IncomingMessage, ServerResponse } from 'http';
import morgan from 'morgan';
import winston from 'winston';
import * as Transport from 'winston-transport';

import { type ExpressMiddleware } from '../express/services';

export type LogContext = Record<string, unknown>;

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARNING = 'warn',
  ERROR = 'error',
  CRITICAL = 'fatal',
}

/**
 * A clean logger interface that abstracts away the underlying
 * logging implementation (Winston). Consumers should depend on
 * this interface rather than Winston types directly.
 *
 * The first argument (`message`) can be a string, an object, or an Error:
 * - **string** – used as the log message; remaining args are meta.
 * - **Error** – the Error's `.message` becomes the log message and it is
 *   also serialised under the top-level `"error"` key.
 * - **object** – no log message is emitted; the object is stored under
 *   `args["1"]` as the first meta argument.
 */
export interface Logger {
  debug(message: unknown, ...meta: unknown[]): void;
  info(message: unknown, ...meta: unknown[]): void;
  warn(message: unknown, ...meta: unknown[]): void;
  error(message: unknown, ...meta: unknown[]): void;
}

/**
 * Recursively convert Error instances to plain serializable objects.
 * Error properties (name, message, stack, cause) are non-enumerable so
 * they would otherwise be lost during JSON serialization.
 */
const errorsToPlain = (value: unknown): unknown => {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      ...(value.cause ? { cause: errorsToPlain(value.cause) } : {}),
    };
  }
  if (Array.isArray(value)) {
    return value.map(errorsToPlain);
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = errorsToPlain(val);
    }
    return result;
  }
  return value;
};

/**
 * Merge multiple splat meta arguments into a single metadata object.
 * - Direct `Error` args are converted via `errorsToPlain` and placed under
 *   the top-level `"error"` key.
 * - All other args (objects, primitives) are placed in the sub-object
 *   `args` keyed by 1-based position (`"1"`, `"2"`, …).
 */
const mergeMeta = (...meta: unknown[]): Record<string, unknown> | undefined => {
  if (meta.length === 0) return undefined;

  const result: Record<string, any> = {};
  for (let i = 0; i < meta.length; i++) {
    const arg = meta[i];

    if (arg instanceof Error) {
      result.error = errorsToPlain(arg);
    } else {
      if (!result.args) {
        result.args = {};
      }
      result.args[`${i + 1}`] = arg;
    }
  }
  return result;
};

const logCache = new Map<string, Logger>();

const HIGHEST_LOG_LEVEL = process.env.LOG_LEVEL ?? 'debug';

const createLogTransports = (
  streamName: string,
  logInJSON = true,
): Transport[] => {
  const transports: Transport[] = [];

  const labelFormat = winston.format.label({ label: streamName });
  const logFormat = logInJSON
    ? winston.format.combine(
        winston.format.timestamp(),
        labelFormat,
        winston.format.errors({ stack: true }),
        winston.format.json({ space: 2 }),
      )
    : winston.format.combine(
        winston.format.timestamp(),
        labelFormat,
        winston.format.errors({ stack: true }),
        winston.format.simple(),
      );

  transports.push(
    new winston.transports.Console({
      level: HIGHEST_LOG_LEVEL,
      format: logFormat,
    }),
  );

  return transports;
};

export const createLogger = (
  streamName: string,
  logInJSON = true,
  extraTransports: Transport[] = [],
): Logger => {
  const cachedLogger = logCache.get(streamName);
  if (cachedLogger) {
    return cachedLogger;
  }

  const winstonLogger = winston.createLogger({
    level: HIGHEST_LOG_LEVEL,
    transports: [
      ...createLogTransports(streamName, logInJSON),
      ...extraTransports,
    ],
  });

  // Wrap the raw winston logger so we control how the first argument and
  // splat meta args are handled.
  //   - Winston natively only uses the *first* splat arg as metadata.
  //   - Error properties are non-enumerable ⇒ serialised as "{}".
  //
  // The wrapper:
  //   1. Normalises the first arg (string / Error / object) – see `Logger` doc.
  //   2. Converts direct Error meta args to plain objects under `error`.
  //   3. Groups all other meta args under an `args` sub-object (1-based keys).
  const log = (level: string, first: unknown, ...rest: unknown[]): void => {
    if (first instanceof Error) {
      winstonLogger.log(level, first.message, mergeMeta(first, ...rest));
    } else if (typeof first === 'object' && first !== null) {
      winstonLogger.log(level, '', mergeMeta(first, ...rest));
    } else {
      winstonLogger.log(level, first as string, mergeMeta(...rest));
    }
  };

  const logger: Logger = {
    debug: (first, ...rest) => log('debug', first, ...rest),
    info: (first, ...rest) => log('info', first, ...rest),
    warn: (first, ...rest) => log('warn', first, ...rest),
    error: (first, ...rest) => log('error', first, ...rest),
  };

  logCache.set(streamName, logger);
  return logger;
};

export const loggerMiddleware = (logger: Logger): ExpressMiddleware => {
  const middleware = morgan(
    ':method :url :status :res[content-length] - :response-time ms',
    {
      stream: {
        write(message: string): void {
          logger.info(message.trim());
        },
      },
    },
  );

  return (req, res, next): void => {
    middleware(
      req as unknown as IncomingMessage,
      res as unknown as ServerResponse,
      next,
    );
  };
};
