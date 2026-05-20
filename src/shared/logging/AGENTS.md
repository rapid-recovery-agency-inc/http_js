# Logging Module

## Purpose

This module provides the package logging primitives. It exposes a cached logger factory, structured log entry types, log-level handling, and a simple console writer implementation. It is a first-class library feature consumed directly by application code and by other modules.

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
| `../../../index.ts` | Root package export surface for this module                |
| `services.ts`       | `CustomLogger`, log-level logic, and writer implementation |
| `logging.test.ts`   | Module tests                                               |

## Key Responsibilities

- Build and cache logger instances by name.
- Handle log-level parsing and filtering.
- Emit structured JSON log entries.
- Act as the common logging dependency for both modules and shared infrastructure.

## Dependencies

- Used across: [../](../), [../../shared/requests](../../shared/requests), [../../shared/utils/aws](../../shared/utils/aws)
- Parent guide: [../../../AGENTS.md](../../../AGENTS.md)
- Root README: [../../../README.md](../../../README.md)

## Navigation

- Public exports: [../../../index.ts](../../../index.ts)
- Main implementation: [services.ts](services.ts)
- Tests: [logging.test.ts](logging.test.ts)
