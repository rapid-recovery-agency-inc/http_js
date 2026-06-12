import winston from 'winston';
import Transport from 'winston-transport';

import { createLogger, type Logger } from '../services';

/**
 * An in-memory Winston transport that captures log entries after the same
 * formatting pipeline as the Console transport (timestamp, label, errors
 * serialization, JSON).  Avoids all the pollution issues that come with
 * spying on process.stdout.write when Jest runs test files in parallel.
 */
class MemoryTransport extends Transport {
  public readonly entries: Record<string, unknown>[] = [];

  public constructor(streamName: string) {
    super({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.label({ label: streamName }),
        winston.format.errors({ stack: true }),
        winston.format.json(),
      ),
    });
  }

  public log(info: Record<string, unknown>, callback: () => void): void {
    this.entries.push(info);
    callback();
  }
}

/**
 * Create a logger that writes to a MemoryTransport instead of the console.
 * Returns both the `Logger` interface and the transport so tests can inspect
 * captured entries.
 */
const createTestLogger = (
  streamName: string,
): { logger: Logger; transport: MemoryTransport } => {
  const transport = new MemoryTransport(streamName);
  const logger = createLogger(streamName, true, [transport]);
  return { logger, transport };
};

describe('logging', () => {
  describe('logger lifecycle', () => {
    it('creates a logger that satisfies the Logger interface', () => {
      const { logger } = createTestLogger('interface-test');

      expect(logger).toBeDefined();
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
    });

    it('reuses cached loggers by stream name', () => {
      const { logger } = createTestLogger('shared-stream-name');
      const { logger: sameLogger } = createTestLogger('shared-stream-name');

      expect(sameLogger).toBe(logger);
    });

    it('creates distinct loggers for different stream names', () => {
      const { logger: loggerA } = createTestLogger('stream-a');
      const { logger: loggerB } = createTestLogger('stream-b');

      expect(loggerA).not.toBe(loggerB);
    });
  });

  describe('basic string messages', () => {
    it('produces correct output for all log levels', () => {
      const { logger, transport } = createTestLogger('no-throw-test');

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(transport.entries).toHaveLength(4);
      expect(transport.entries[0]!.message).toBe('debug message');
      expect(transport.entries[1]!.message).toBe('info message');
      expect(transport.entries[2]!.message).toBe('warn message');
      expect(transport.entries[3]!.message).toBe('error message');
    });
  });

  describe('log entry structure', () => {
    it('includes message, level, label, and timestamp in every log entry', () => {
      const { logger, transport } = createTestLogger('format-test');
      logger.info('hello');

      const entry = transport.entries[0]!;
      expect(entry.message).toBe('hello');
      expect(entry.level).toBe('info');
      expect(entry.label).toBe('format-test');
      expect(entry.timestamp).toEqual(expect.any(String));
    });

    it('preserves the label field across all log levels', () => {
      const { logger, transport } = createTestLogger('level-label-test');

      logger.debug('x');
      expect(transport.entries[0]!.label).toBe('level-label-test');

      logger.warn('y');
      expect(transport.entries[1]!.label).toBe('level-label-test');
    });
  });

  describe('error serialization', () => {
    it('serialises a direct Error arg with name, message, and stack', () => {
      const { logger, transport } = createTestLogger('direct-error');
      logger.error('with-error', { id: 1 }, new Error('test'));

      const entry = transport.entries[0]!;
      expect(entry.error).toMatchObject({
        name: 'Error',
        message: 'test',
        stack: expect.any(String),
      });
    });

    it('serialises an Error nested inside a meta object', () => {
      const { logger, transport } = createTestLogger('nested-error');
      logger.error('with-error', { error: new Error('test') });

      const entry = transport.entries[0]!;
      const args = (entry as any).args as Record<string, unknown>;
      expect((args['1'] as Record<string, unknown>).error).toMatchObject({
        name: 'Error',
        message: 'test',
        stack: expect.any(String),
      });
    });

    it('serialises an Error passed as the sole first argument', () => {
      const { logger, transport } = createTestLogger('error-first');
      logger.error(new Error('fail'));

      const entry = transport.entries[0]!;
      expect(entry.message).toBe('fail');
      expect(entry.error).toMatchObject({
        name: 'Error',
        message: 'fail',
        stack: expect.any(String),
      });
    });

    it('serialises an Error as first arg alongside additional meta', () => {
      const { logger, transport } = createTestLogger('error-first-meta');
      logger.error(new Error('fail'), { context: 'test' });

      const entry = transport.entries[0]!;
      expect(entry.message).toBe('fail');
      expect(entry.error).toMatchObject({
        name: 'Error',
        message: 'fail',
      });
      // The Error occupies position 0 in mergeMeta (→ top-level error),
      // so the additional meta is at position 1 → args['1']
      expect((entry as any).args['1']).toEqual({ context: 'test' });
    });
  });

  describe('meta argument handling', () => {
    it('includes a single meta object under args.1', () => {
      const { logger, transport } = createTestLogger('single-meta');
      logger.info('with-meta', { key: 'value', count: 42 });

      const entry = transport.entries[0]!;
      expect(entry.message).toBe('with-meta');
      const args = (entry as any).args as Record<string, unknown>;
      expect((args['1'] as Record<string, unknown>).key).toBe('value');
      expect((args['1'] as Record<string, unknown>).count).toBe(42);
    });

    it('attaches multiple meta arguments under args.1, args.2, etc', () => {
      const { logger, transport } = createTestLogger('multi-meta');
      logger.error('with-error', { id: 1 }, new Error('test'));

      const entry = transport.entries[0]!;
      expect(entry.message).toBe('with-error');
      const args = (entry as any).args as Record<string, unknown>;
      expect((args['1'] as Record<string, unknown>).id).toBe(1);
      // Direct Error arg is converted to plain object under entry.error
      expect(entry.error).toMatchObject({
        name: 'Error',
        message: 'test',
        stack: expect.any(String),
      });
    });

    it('preserves primitive meta args under positional keys', () => {
      const { logger, transport } = createTestLogger('primitive-meta');
      logger.warn('with-context', { attempt: 2 }, 'extra');

      const entry = transport.entries[0]!;
      expect((entry as any).args['1']).toEqual({ attempt: 2 });
      expect((entry as any).args['2']).toBe('extra');
    });

    it('accepts an object as the first argument', () => {
      const { logger, transport } = createTestLogger('object-first');
      logger.info({ key: 'value' });

      const entry = transport.entries[0]!;
      expect(entry.message).toBe('');
      expect((entry as any).args['1']).toEqual({ key: 'value' });
    });

    it('accepts an object as the first argument with additional meta', () => {
      const { logger, transport } = createTestLogger('object-first-meta');
      logger.info({ key: 'value' }, { extra: true });

      const entry = transport.entries[0]!;
      expect(entry.message).toBe('');
      expect((entry as any).args['1']).toEqual({ key: 'value' });
      expect((entry as any).args['2']).toEqual({ extra: true });
    });
  });
});
