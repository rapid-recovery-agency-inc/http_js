import pino, { type Logger as PinoLogger } from 'pino';
import pinoHttp from 'pino-http';

import { type ExpressMiddleware } from '../express/services';

export type LogContext = Record<string, unknown>;

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARNING = 'warn',
  ERROR = 'error',
  CRITICAL = 'fatal',
}

export type LoggerOptions = {
  logLevel?: LogLevel;
};

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  debug(value: unknown, message?: string, ...args: unknown[]): void;

  info(message: string, ...args: unknown[]): void;
  info(value: unknown, message?: string, ...args: unknown[]): void;

  warn(message: string, ...args: unknown[]): void;
  warn(value: unknown, message?: string, ...args: unknown[]): void;

  error(message: string, ...args: unknown[]): void;
  error(value: unknown, message?: string, ...args: unknown[]): void;

  critical(message: string, ...args: unknown[]): void;
  critical(value: unknown, message?: string, ...args: unknown[]): void;
}

type LogMethod = (
  object: unknown,
  message?: string,
  ...args: unknown[]
) => void;

class PinoLoggerAdapter implements Logger {
  private readonly logger: PinoLogger;

  public constructor(logger: PinoLogger) {
    this.logger = logger;
  }

  public toPinoLogger(): PinoLogger {
    return this.logger;
  }

  private log(method: LogMethod, value: unknown, ...args: unknown[]): void {
    if (typeof value === 'string') {
      const [context, ...rest] = args;

      if (context !== undefined) {
        method(context, value, ...rest);
        return;
      }

      method(value);
      return;
    }

    const [message, ...rest] = args;

    if (typeof message === 'string') {
      method(value, message, ...rest);
      return;
    }

    method(value);
  }

  public debug(value: string | object | Error, ...args: unknown[]): void {
    this.log(this.logger.debug.bind(this.logger), value, ...args);
  }

  public info(value: string | object | Error, ...args: unknown[]): void {
    this.log(this.logger.info.bind(this.logger), value, ...args);
  }

  public warn(value: string | object | Error, ...args: unknown[]): void {
    this.log(this.logger.warn.bind(this.logger), value, ...args);
  }

  public error(value: string | object | Error, ...args: unknown[]): void {
    this.log(this.logger.error.bind(this.logger), value, ...args);
  }

  public critical(value: string | object | Error, ...args: unknown[]): void {
    this.log(this.logger.fatal.bind(this.logger), value, ...args);
  }
}

export const createLogger = (
  moduleName: string,
  options?: LoggerOptions,
): Logger => {
  const logger = pino({
    level: options?.logLevel ?? process.env.LOG_LEVEL ?? LogLevel.INFO,
  }).child({
    module: moduleName,
  });

  return new PinoLoggerAdapter(logger);
};

export const loggerMiddleware = (logger: Logger): ExpressMiddleware => {
  if (!(logger instanceof PinoLoggerAdapter)) {
    throw new Error('Unsupported logger implementation');
  }

  return pinoHttp({
    logger: logger.toPinoLogger(),
  });
};
