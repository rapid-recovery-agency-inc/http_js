# Logging

The logger factory returns a lightweight adapter that binds a logger to a module name and forwards calls to the underlying Pino instance.

## Why use it

- Logger instances are created per call and are bound to a `module` field for easier filtering.
- Log level comes from the explicit option first, then `LOG_LEVEL`, then `info`.
- The adapter exposes `warn` for warning-level logs, and `critical` maps to Pino's `fatal` level.

## Creating a logger

```typescript
import { createLogger, LogLevel } from 'http_js';

const logger = createLogger('my-service');

// Or pin the level explicitly:
const verboseLogger = createLogger('my-service', {
  logLevel: LogLevel.DEBUG,
});
```

## Logging messages

```typescript
logger.debug('Starting up');
logger.info('Request received');
logger.warn('Slow query');
logger.error('Database error');
logger.critical('Out of memory');
```

Pino writes pretty-formatted log lines such as:

```text
[2026-05-25 10:00:00.000 +0000] INFO (12345): Request received
    module: "my-service"
```

## API

| Export         | Description                                           |
| -------------- | ----------------------------------------------------- |
| `createLogger` | Returns a module-bound logger adapter backed by Pino  |
| `LogLevel`     | Enum: `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL` |

The returned logger supports `debug`, `info`, `warn`, `error`, and `critical`.
