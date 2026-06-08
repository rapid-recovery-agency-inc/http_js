# Logging

The logger factory returns a `Logger` instance scoped to a stream name, with optional JSON output and a Morgan middleware adapter for request logs.

## Why use it

- Returns a clean `Logger` interface — the underlying implementation (Winston) is not exposed to consumers.
- Logger instances are created with a stream `label` field for easier filtering.
- Logger instances are cached by stream name, so repeated calls with the same stream return the same logger instance.
- Log level comes from `LOG_LEVEL`, falling back to `debug`.
- `createLogger(streamName, true)` emits JSON logs, while `createLogger(streamName, false)` emits simple line logs.

## Creating a logger

```typescript
import { createLogger, type Logger } from 'http_js';

const logger: Logger = createLogger('my-service');

// Or switch to simple line output:
const textLogger = createLogger('my-service-text', false);
```

## Logging messages

```typescript
logger.debug('Starting up');
logger.info('Request received');
logger.warn('Slow query');
logger.error('Database error');
```

The default output is JSON:

```text
{
    "level": "info",
    "message": "Request received",
    "timestamp": "2026-06-02T00:00:00.000Z",
    "label": "my-service"
}
```

## API

| Export             | Description                                              |
| ------------------ | -------------------------------------------------------- |
| `createLogger`     | Returns a `Logger` with stream label formatting          |
| `Logger`           | Interface: `debug`, `info`, `warn`, `error` methods      |
| `LogLevel`         | Enum: `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL`    |
| `loggerMiddleware` | Creates a Morgan middleware that writes to `logger.info` |

The returned `Logger` exposes the standard `debug`, `info`, `warn`, and `error` methods, each accepting a message string and optional metadata arguments.
