# Logging Module

## Purpose

This module provides shared logging primitives. It exposes a clean `Logger` interface (backed by Winston), log-level handling via `LOG_LEVEL`, and a Morgan adapter for request logging. It is a cross-cutting infrastructure primitive used by shared and module code.

## Architecture

```text
consumer
  -> createLogger() : Logger
	  -> Winston logger bound to stream label
		  -> Console transport

consumer
  -> loggerMiddleware(logger: Logger)
	  -> Morgan HTTP formatter
		  -> logger.info(message)
```

## File Structure

| File                        | Role                                           |
| --------------------------- | ---------------------------------------------- |
| `../../../index.ts`         | Root package export surface for this module    |
| `services.ts`               | `Logger` interface, factory, and Morgan bridge |
| `__tests__/logging.test.ts` | Logging unit tests                             |

## Key Responsibilities

- Define the `Logger` interface (`debug`, `info`, `warn`, `error`) so consumers are not coupled to Winston.
- Create stream-scoped logger instances with a `label` field (Winston under the hood).
- Cache loggers by stream name for reuse.
- Handle log-level selection from `LOG_LEVEL` with `debug` fallback.
- Emit JSON or simple line logs through Winston console transport.
- Bridge Morgan request logs into `logger.info`.

## First-argument flexibility

The `Logger` methods accept `message: unknown` as the first argument:

| Type     | Behaviour                                                                                                       |
| -------- | --------------------------------------------------------------------------------------------------------------- |
| `string` | Used as the log message directly.                                                                               |
| `Error`  | The Error's `.message` becomes the log message; the Error is also serialised under the top-level `"error"` key. |
| `object` | No log message emitted; the object becomes the first meta argument under `args["1"]`.                           |

## Meta-argument handling

Remaining `...meta: unknown[]` (splat args) are processed by a thin wrapper:

1. **Direct `Error` args** are converted to plain `{ name, message, stack }` objects via `errorsToPlain` and placed under a top-level `"error"` key.
2. **All other args** (objects, strings, numbers, etc.) are stored in a sub-object `"args"` keyed by 1-based position (`"1"`, `"2"`, …).
3. `winston.format.errors({ stack: true })` is included in the transport format chain so that any Error instances nested inside objects are also serialised correctly with enumerable properties.

## Design Rules

- **Do not expose Winston types** in the public API. The `Logger` interface is the contract.
- Add new methods to the `Logger` interface only when needed by consumers.
- Keep the implementation internal (Winston transports, formats, etc.) — consumers should not import Winston or `winston-transport`.
- The wrapper returned by `createLogger` (type `Logger`) is cached, not the raw `winston.Logger`.

## Dependencies

- Used across: [../](../), [../../shared/requests](../../shared/requests), [../../shared/utils/aws](../../shared/utils/aws)
- Parent guide: [../../../AGENTS.md](../../../AGENTS.md)
- Root README: [../../../README.md](../../../README.md)

## Navigation

- Public exports: [../../../index.ts](../../../index.ts)
- Main implementation: [services.ts](services.ts)
- Tests: [**tests**/logging.test.ts](__tests__/logging.test.ts)
