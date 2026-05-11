export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL',
}

const LOG_LEVEL_PRIORITIES: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 10,
  [LogLevel.INFO]: 20,
  [LogLevel.WARNING]: 30,
  [LogLevel.ERROR]: 40,
  [LogLevel.CRITICAL]: 50,
};

const LOG_LEVEL_STREAMS: Record<LogLevel, NodeJS.WriteStream> = {
  [LogLevel.DEBUG]: process.stdout,
  [LogLevel.INFO]: process.stdout,
  [LogLevel.WARNING]: process.stdout,
  [LogLevel.ERROR]: process.stderr,
  [LogLevel.CRITICAL]: process.stderr,
};

export type LogContext = Record<string, unknown>;

export interface LogEntry {
  timestamp: string;
  logger: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  args?: unknown[];
}

export interface LogWriter {
  write(entry: LogEntry): void;
}

interface CreateLoggerOptions {
  writer?: LogWriter;
  env?: NodeJS.ProcessEnv;
  logLevel?: LogLevel;
}

class ConsoleLogWriter implements LogWriter {
  write(entry: LogEntry): void {
    LOG_LEVEL_STREAMS[entry.level].write(`${JSON.stringify(entry)}\n`);
  }
}

const DEFAULT_LOG_WRITER = new ConsoleLogWriter();
const loggerCache = new Map<string, CustomLogger>();

function isLogLevel(value: string): value is LogLevel {
  return Object.values(LogLevel).includes(value as LogLevel);
}

function warnInvalidLogLevel(rawValue: string | undefined): void {
  const configuredValue = rawValue ?? '<missing>';
  process.emitWarning(
    `Invalid or missing LOG_LEVEL value '${configuredValue}'. Falling back to ${LogLevel.DEBUG}.`,
  );
}

export function loadLogLevel(env: NodeJS.ProcessEnv = process.env): LogLevel {
  const rawLogLevel = env.LOG_LEVEL?.toUpperCase();

  if (rawLogLevel === undefined) {
    warnInvalidLogLevel(undefined);
    return LogLevel.DEBUG;
  }

  if (!isLogLevel(rawLogLevel)) {
    warnInvalidLogLevel(rawLogLevel);
    return LogLevel.DEBUG;
  }

  return rawLogLevel;
}

export class CustomLogger {
  public readonly name: string;

  private readonly writer: LogWriter;
  private readonly logLevel: LogLevel;

  public constructor(name: string, writer: LogWriter, logLevel: LogLevel) {
    this.name = name;
    this.writer = writer;
    this.logLevel = logLevel;
  }

  public debug(
    message: string,
    context?: LogContext,
    ...args: unknown[]
  ): void {
    this.log(LogLevel.DEBUG, message, context, args);
  }

  public info(message: string, context?: LogContext, ...args: unknown[]): void {
    this.log(LogLevel.INFO, message, context, args);
  }

  public warning(
    message: string,
    context?: LogContext,
    ...args: unknown[]
  ): void {
    this.log(LogLevel.WARNING, message, context, args);
  }

  public warn(message: string, context?: LogContext, ...args: unknown[]): void {
    this.warning(message, context, ...args);
  }

  public error(
    message: string,
    context?: LogContext,
    ...args: unknown[]
  ): void {
    this.log(LogLevel.ERROR, message, context, args);
  }

  public critical(
    message: string,
    context?: LogContext,
    ...args: unknown[]
  ): void {
    this.log(LogLevel.CRITICAL, message, context, args);
  }

  public exception(message: string, error: Error, context?: LogContext): void {
    this.log(LogLevel.ERROR, message, {
      ...context,
      errorMessage: error.message,
      errorName: error.name,
      stack: error.stack,
    });
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITIES[level] >= LOG_LEVEL_PRIORITIES[this.logLevel];
  }

  private log(
    level: LogLevel,
    message: string,
    context?: LogContext,
    args?: unknown[],
  ): void {
    if (!this.shouldLog(level)) {
      return;
    }

    this.writer.write({
      timestamp: new Date().toISOString(),
      logger: this.name,
      level,
      message,
      ...(context === undefined ? {} : { context }),
      ...(args === undefined || args.length === 0 ? {} : { args }),
    });
  }
}

export function createLogger(
  name = 'root',
  options: CreateLoggerOptions = {},
): CustomLogger {
  const existingLogger = loggerCache.get(name);
  if (existingLogger !== undefined) {
    return existingLogger;
  }

  const logger = new CustomLogger(
    name,
    options.writer ?? DEFAULT_LOG_WRITER,
    options.logLevel ?? loadLogLevel(options.env),
  );
  loggerCache.set(name, logger);
  return logger;
}

export function resetLoggerCache(): void {
  loggerCache.clear();
}
