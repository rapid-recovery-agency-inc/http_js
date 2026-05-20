# Logging

Structured JSON logger with configurable log levels, output stream routing, and a cached instance factory. Designed to emit machine-readable log lines suitable for log aggregation pipelines.

## Why use it

- Outputs structured JSON on every log call — no log parsing required downstream.
- Routes `DEBUG` / `INFO` / `WARNING` to `stdout`; `ERROR` / `CRITICAL` to `stderr`.
- Logger instances are cached by name so the same logger is returned on repeated calls without re-configuring the level.
- Log level is read from `LOG_LEVEL` env var with a safe fallback and a `process.emitWarning` if the value is missing or invalid.
- Custom `LogWriter` implementations let you redirect log output in tests or send to a remote sink.

## Creating a logger

```typescript
import { createLogger, LogLevel } from 'http_js';

const logger = createLogger('my-service');
// Level defaults to process.env.LOG_LEVEL (falls back to DEBUG if missing)

// Or pin the level explicitly (useful in module-scope loggers):
const logger = createLogger('my-service', { logLevel: LogLevel.INFO });
```

## Logging messages

```typescript
logger.debug('Starting up', { port: 3000 });
logger.info('Request received', { path: '/api/users', method: 'GET' });
logger.warning('Slow query', { durationMs: 4200 });
logger.error('Database error', { error: err.message });
logger.critical('Out of memory');
```

Each call emits a JSON line:

```json
{
  "timestamp": "2026-05-20T10:00:00.000Z",
  "logger": "my-service",
  "level": "INFO",
  "message": "Request received",
  "context": { "path": "/api/users", "method": "GET" }
}
```

## Reading the log level from the environment

```typescript
import { loadLogLevel } from 'http_js';

const level = loadLogLevel(process.env);
// Returns LogLevel.DEBUG if LOG_LEVEL is missing or invalid (and emits a warning)
```

## Custom log writer (e.g. for tests)

```typescript
import { createLogger, type LogWriter, type LogEntry } from 'http_js';

class ArrayLogWriter implements LogWriter {
  public entries: LogEntry[] = [];
  write(entry: LogEntry) {
    this.entries.push(entry);
  }
}

const writer = new ArrayLogWriter();
const logger = createLogger('test', { writer });
logger.info('hello');
console.log(writer.entries);
```

## Resetting the logger cache

Useful in tests where you want a fresh logger with a different writer:

```typescript
import { resetLoggerCache } from 'http_js';

beforeEach(() => resetLoggerCache());
```

## API

| Export             | Description                                                       |
| ------------------ | ----------------------------------------------------------------- |
| `createLogger`     | Returns a cached `CustomLogger` for the given name                |
| `loadLogLevel`     | Reads `LOG_LEVEL` from env and coerces it to a `LogLevel` value   |
| `resetLoggerCache` | Clears the internal logger cache (testing)                        |
| `CustomLogger`     | Logger class — `debug`, `info`, `warning`, `error`, `critical`    |
| `LogLevel`         | Enum: `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL`             |
| `LogContext`       | `Record<string, unknown>` — extra context attached to a log entry |
| `LogEntry`         | Shape of a single structured log line                             |
| `LogWriter`        | Interface for a custom log output target                          |
