jest.mock('pino', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('pino-http', () => ({
  __esModule: true,
  default: jest.fn(),
}));

import pino from 'pino';

import { createLogger, LogLevel } from '../services';

const mockedPino = jest.mocked(pino);

const childLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  fatal: jest.fn(),
};

const child = jest.fn(() => childLogger);

function setLogLevel(value: string | undefined): void {
  if (value === undefined) {
    delete process.env.LOG_LEVEL;
    return;
  }

  process.env.LOG_LEVEL = value;
}

describe('logging', () => {
  const originalLogLevel = process.env.LOG_LEVEL;

  beforeEach(() => {
    jest.resetAllMocks();
    setLogLevel(originalLogLevel);
    child.mockImplementation(() => childLogger);
    mockedPino.mockImplementation(
      () =>
        ({
          child,
        }) as never,
    );
  });

  afterEach(() => {
    setLogLevel(originalLogLevel);
  });

  it('creates a child logger bound to the module name', () => {
    createLogger('service-a');

    expect(mockedPino).toHaveBeenCalledWith(
      expect.objectContaining({
        level: LogLevel.INFO,
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
          },
        },
      }),
    );
    expect(child).toHaveBeenCalledWith({
      module: 'service-a',
    });
  });

  it('uses an explicit log level over the environment', () => {
    setLogLevel(LogLevel.ERROR);

    createLogger('service-b', { logLevel: LogLevel.DEBUG });

    expect(mockedPino).toHaveBeenCalledWith(
      expect.objectContaining({
        level: LogLevel.DEBUG,
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
          },
        },
      }),
    );
  });

  it('uses LOG_LEVEL when no explicit level is provided', () => {
    setLogLevel(LogLevel.WARNING);

    createLogger('service-c');

    expect(mockedPino).toHaveBeenCalledWith(
      expect.objectContaining({
        level: LogLevel.WARNING,
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
          },
        },
      }),
    );
  });

  it('forwards log calls to the underlying Pino logger', () => {
    const logger = createLogger('service-d', { logLevel: LogLevel.DEBUG });

    logger.debug('debug message', { requestId: 'req-1' });
    logger.info('info message');
    logger.warn('warn message', 'extra');
    logger.error('error message');
    logger.critical('critical message');

    expect(childLogger.debug).toHaveBeenCalledWith(
      [{ requestId: 'req-1' }],
      'debug message',
    );
    expect(childLogger.info).toHaveBeenCalledWith([], 'info message');
    expect(childLogger.warn).toHaveBeenCalledWith(['extra'], 'warn message');
    expect(childLogger.error).toHaveBeenCalledWith([], 'error message');
    expect(childLogger.fatal).toHaveBeenCalledWith([], 'critical message');
  });

  it('configures the pretty transport', () => {
    createLogger('service-e');

    expect(mockedPino).toHaveBeenCalledWith(
      expect.objectContaining({
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
          },
        },
      }),
    );
  });
});
