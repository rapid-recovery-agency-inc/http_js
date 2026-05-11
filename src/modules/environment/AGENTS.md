# Environment Module

## Purpose

This module provides schema-driven environment loading and coercion. It is the TypeScript equivalent of the Python environment helpers, adapted to explicit field builders and runtime parsing.

## Architecture

```text
field definitions
  -> defineEnvironment()
	  -> EnvironmentManager
		  -> parsed and validated environment object
```

## File Structure

| File                  | Role                                          |
| --------------------- | --------------------------------------------- |
| `../../../index.ts`   | Root package export surface for this module   |
| `services.ts`         | Environment manager and field implementations |
| `environment.test.ts` | Module tests                                  |

## Key Responsibilities

- Define environment fields with explicit coercion rules.
- Build schema-bound environment loaders.
- Support required/optional values and post-set hooks.
- Keep parsing logic isolated from the consumers that use environment values.

## Dependencies

- Related shared utilities: [../../shared/utils](../../shared/utils)
- Parent guide: [../../../AGENTS.md](../../../AGENTS.md)
- Root README: [../../../README.md](../../../README.md)

## Navigation

- Public exports: [../../../index.ts](../../../index.ts)
- Main implementation: [services.ts](services.ts)
- Tests: [environment.test.ts](environment.test.ts)
