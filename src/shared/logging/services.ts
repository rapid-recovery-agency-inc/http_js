import pino, { type Logger as PinoLogger } from 'pino';

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
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  critical(message: string, ...args: unknown[]): void;
}

class PinoLoggerAdapter implements Logger {
  private readonly logger: PinoLogger;

  public constructor(logger: PinoLogger) {
    this.logger = logger;
  }

  public debug(message: string, ...args: unknown[]): void {
    this.logger.debug(args, message);
  }

  public info(message: string, ...args: unknown[]): void {
    this.logger.info(args, message);
  }

  public warn(message: string, ...args: unknown[]): void {
    this.logger.warn(args, message);
  }

  public error(message: string, ...args: unknown[]): void {
    this.logger.error(args, message);
  }

  public critical(message: string, ...args: unknown[]): void {
    this.logger.fatal(args, message);
  }
}

export const createLogger = (
  moduleName: string,
  options?: LoggerOptions,
): Logger => {
  const logger = pino({
    level: options?.logLevel ?? process.env.LOG_LEVEL ?? LogLevel.INFO,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
      },
    },
  }).child({
    module: moduleName,
  });

  return new PinoLoggerAdapter(logger);
};
