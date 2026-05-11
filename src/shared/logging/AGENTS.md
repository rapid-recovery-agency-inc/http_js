# Shared Logging

## Purpose

This shared area provides the package logging primitives. It exposes a cached logger factory, structured log entry types, log-level handling, and a simple console writer implementation.

## Architecture

```text
consumer
  -> createLogger()
	  -> cached CustomLogger instance
		  -> writer
		  -> level filtering
```

## File Structure

| File                | Role                                                       |
| ------------------- | ---------------------------------------------------------- |
| `../../../index.ts` | Root package export surface for this shared area           |
| `services.ts`       | `CustomLogger`, log-level logic, and writer implementation |
| `logging.test.ts`   | Shared area tests                                          |

## Key Responsibilities

- Build and cache logger instances by name.
- Handle log-level parsing and filtering.
- Emit structured JSON log entries.
- Act as the common logging dependency for both modules and shared infrastructure.

## Dependencies

- Used across: [../../modules](../../modules), [../requests](../requests), [../postgres](../postgres)
- Parent guide: [../../../AGENTS.md](../../../AGENTS.md)
- Root README: [../../../README.md](../../../README.md)

## Navigation

- Public exports: [../../../index.ts](../../../index.ts)
- Main implementation: [services.ts](services.ts)
- Tests: [logging.test.ts](logging.test.ts)
