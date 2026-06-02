import winston from 'winston';

import { createLogger } from '../services';

const messageSymbol = Symbol.for('message');

function getFormattedMessage(logger: winston.Logger, message: string): string {
  const [transport] = logger.transports;

  if (!transport || !(transport instanceof winston.transports.Console)) {
    throw new Error('expected logger to use a winston console transport');
  }

  if (!transport.format) {
    throw new Error('expected logger transport to have a format');
  }

  const transformed = transport.format.transform(
    {
      level: 'info',
      message,
    },
    transport.format.options ?? {},
  );

  if (!transformed || typeof transformed !== 'object') {
    throw new Error('expected transformed log info to be an object');
  }

  const formattedMessage = Reflect.get(transformed, messageSymbol);
  if (typeof formattedMessage !== 'string') {
    throw new Error('expected formatted message to be a string');
  }

  return formattedMessage;
}

describe('logging', () => {
  it('creates a logger with a console transport and configured level', () => {
    const logger = createLogger('logging-level-test');
    const [transport] = logger.transports;

    expect(transport).toBeInstanceOf(winston.transports.Console);
    expect(transport?.level).toBe(process.env.LOG_LEVEL ?? 'debug');
    expect(logger.level).toBe(process.env.LOG_LEVEL ?? 'debug');
  });

  it('reuses cached loggers by stream name', () => {
    const logger = createLogger('shared-stream-name', true);
    const sameLogger = createLogger('shared-stream-name', false);

    expect(sameLogger).toBe(logger);
  });

  it('formats output as json when json logging is enabled', () => {
    const streamName = `json-stream-${Date.now()}`;
    const logger = createLogger(streamName, true);
    const formattedMessage = getFormattedMessage(logger, 'json-message');

    const parsedMessage = JSON.parse(formattedMessage) as {
      label?: string;
      level?: string;
      message?: string;
      timestamp?: string;
    };

    expect(parsedMessage.message).toBe('json-message');
    expect(parsedMessage.level).toBe('info');
    expect(parsedMessage.label).toBe(streamName);
    expect(parsedMessage.timestamp).toEqual(expect.any(String));
  });

  it('formats output as a simple line when json logging is disabled', () => {
    const streamName = `simple-stream-${Date.now()}`;
    const logger = createLogger(streamName, false);
    const formattedMessage = getFormattedMessage(logger, 'simple-message');

    expect(formattedMessage).toContain('info: simple-message');
    expect(formattedMessage).toContain(`"label":"${streamName}"`);
    expect(formattedMessage).toContain('"timestamp":"');
  });
});
