# Environment Module

## Purpose

This module provides a robust, type-safe way to load, parse, and validate environment variables. It ensures that required configuration is present at application startup and converts raw strings into correct primitive types (booleans, numbers, arrays, etc.).

## Architecture

```text
config definition -> createEnvironment()
                       -> Env instance (singleton or transient)
                            -> load .env (optional)
                            -> validate required fields
                            -> parse values
                       -> return synchronized getter
```

## File Structure

| File                    | Role                                                                 |
| ----------------------- | -------------------------------------------------------------------- |
| `../../../index.ts`     | Root package export surface for this module                          |
| `create-environment.ts` | Factory function for building and initializing the `Env` instance    |
| `env.ts`                | Core `Env` class managing parsing, defaults, and validation state    |
| `dotenv-loader.ts`      | Helper for synchronous `.env` and `.env.local` file loading          |
| `types.ts`              | TypeScript config definitions, parsing callbacks, and type inference |
| `index.ts`              | Module barrel exports                                                |

## Key Responsibilities

- **Validation:** Fail fast at startup if required environment variables are missing.
- **Type Safety:** Extract string values into strictly typed primitives via custom `parse` functions.
- **Defaults:** Provide fallback values for missing optional variables.
- **Dotenv Integration:** Automatically load `.env` and `.env.local` files synchronously before resolving configuration.
- **Singleton Support:** Share a single validated configuration across the entire application to prevent multiple initializations.

## Dependencies

- External: `dotenv` package for `.env` loading.
- Parent guide: [../../../AGENTS.md](../../../AGENTS.md)
- Root README: [../../../README.md](../../../README.md)

## Navigation

- Public exports: [../../../index.ts](../../../index.ts)
- Factory: [create-environment.ts](create-environment.ts)
- Core class: [env.ts](env.ts)
- Types: [types.ts](types.ts)
