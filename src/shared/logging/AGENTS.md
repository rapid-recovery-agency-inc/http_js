# Logging Module

## Purpose

This module provides the package logging primitives. It exposes a Pino-backed logger factory, log-level handling, and a lightweight adapter for module-scoped logging with pretty console output. It is a first-class library feature consumed directly by application code and by other modules.

## Architecture

```text
consumer
  -> createLogger()
	  -> Pino logger child bound to module name
		  -> pino-pretty transport
```

## File Structure

| File                | Role                                                   |
| ------------------- | ------------------------------------------------------ |
| `../../../index.ts` | Root package export surface for this module            |
| `services.ts`       | Pino adapter, logger interface, and log-level handling |
| `logging.test.ts`   | Module tests                                           |

## Key Responsibilities

- Create module-scoped logger instances with a `module` field.
- Handle log-level selection from options or `LOG_LEVEL`.
- Emit readable pretty logs through Pino's transport layer.
- Expose `warn` as the warning-level method and `critical` as the fatal-level method.
- Act as the common logging dependency for both modules and shared infrastructure.

## Dependencies

- Used across: [../](../), [../../shared/requests](../../shared/requests), [../../shared/utils/aws](../../shared/utils/aws)
- Parent guide: [../../../AGENTS.md](../../../AGENTS.md)
- Root README: [../../../README.md](../../../README.md)

## Navigation

- Public exports: [../../../index.ts](../../../index.ts)
- Main implementation: [services.ts](services.ts)
- Tests: [logging.test.ts](logging.test.ts)
