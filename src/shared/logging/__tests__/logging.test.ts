import {
  LogLevel,
  createLogger,
  loadLogLevel,
  resetLoggerCache,
  type LogEntry,
  type LogWriter,
} from '../services';

class MemoryLogWriter implements LogWriter {
  public readonly entries: LogEntry[] = [];

  public write(entry: LogEntry): void {
    this.entries.push(entry);
  }
}

describe('logging', () => {
  beforeEach(() => {
    resetLoggerCache();
    jest.restoreAllMocks();
  });

  it('caches loggers by name', () => {
    const firstLogger = createLogger('service-a', { logLevel: LogLevel.DEBUG });
    const secondLogger = createLogger('service-a');

    expect(firstLogger).toBe(secondLogger);
  });

  it('defaults to DEBUG when LOG_LEVEL is missing', () => {
    const warningSpy = jest
      .spyOn(process, 'emitWarning')
      .mockImplementation(() => undefined);

    expect(loadLogLevel({})).toBe(LogLevel.DEBUG);
    expect(warningSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to DEBUG when LOG_LEVEL is invalid', () => {
    const warningSpy = jest
      .spyOn(process, 'emitWarning')
      .mockImplementation(() => undefined);

    expect(loadLogLevel({ LOG_LEVEL: 'verbose' })).toBe(LogLevel.DEBUG);
    expect(warningSpy).toHaveBeenCalledTimes(1);
  });

  it('writes structured entries at or above the configured level', () => {
    const writer = new MemoryLogWriter();
    const logger = createLogger('service-b', {
      writer,
      logLevel: LogLevel.INFO,
    });

    logger.debug('debug message');
    logger.info('user logged in', { userId: 123 });
    logger.error('request failed', { requestId: 'req-1' }, 'extra');

    expect(writer.entries).toHaveLength(2);
    expect(writer.entries[0]).toMatchObject({
      logger: 'service-b',
      level: LogLevel.INFO,
      message: 'user logged in',
      context: { userId: 123 },
    });
    expect(writer.entries[1]).toMatchObject({
      logger: 'service-b',
      level: LogLevel.ERROR,
      message: 'request failed',
      context: { requestId: 'req-1' },
      args: ['extra'],
    });
  });

  it('captures exception details in error-level logs', () => {
    const writer = new MemoryLogWriter();
    const logger = createLogger('service-c', {
      writer,
      logLevel: LogLevel.DEBUG,
    });
    const error = new Error('boom');

    logger.exception('processing failed', error, { requestId: 'req-2' });

    expect(writer.entries).toHaveLength(1);
    expect(writer.entries[0]).toMatchObject({
      logger: 'service-c',
      level: LogLevel.ERROR,
      message: 'processing failed',
      context: expect.objectContaining({
        requestId: 'req-2',
        errorName: 'Error',
        errorMessage: 'boom',
      }),
    });
  });
});
