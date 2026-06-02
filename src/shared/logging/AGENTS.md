# Logging Module

## Purpose

This module provides shared logging primitives. It exposes a Winston-based logger factory, log-level handling via `LOG_LEVEL`, and a Morgan adapter for request logging. It is a cross-cutting infrastructure primitive used by shared and module code.

## Architecture

```text
consumer
  -> createLogger()
	  -> Winston logger bound to stream label
		  -> Console transport

consumer
  -> loggerMiddleware(logger)
	  -> Morgan HTTP formatter
		  -> logger.info(message)
```

## File Structure

| File                        | Role                                                |
| --------------------------- | --------------------------------------------------- |
| `../../../index.ts`         | Root package export surface for this module         |
| `services.ts`               | Winston logger factory and Morgan middleware bridge |
| `__tests__/logging.test.ts` | Logging unit tests                                  |

## Key Responsibilities

- Create stream-scoped Winston logger instances with a `label` field.
- Cache loggers by stream name for reuse.
- Handle log-level selection from `LOG_LEVEL` with `debug` fallback.
- Emit JSON or simple line logs through Winston console transport.
- Bridge Morgan request logs into `logger.info`.

## Dependencies

- Used across: [../](../), [../../shared/requests](../../shared/requests), [../../shared/utils/aws](../../shared/utils/aws)
- Parent guide: [../../../AGENTS.md](../../../AGENTS.md)
- Root README: [../../../README.md](../../../README.md)

## Navigation

- Public exports: [../../../index.ts](../../../index.ts)
- Main implementation: [services.ts](services.ts)
- Tests: [**tests**/logging.test.ts](__tests__/logging.test.ts)
