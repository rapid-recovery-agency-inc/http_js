# Express Helpers Module

## Purpose

This shared module provides Express-compatible adapter types and helper functions used by middleware-oriented feature modules. It bridges Express request/response objects to the package's internal request abstractions without importing the `express` package directly.

## Architecture

```text
Express request/response
  -> createContextRequestFromExpress()
  -> normalizeExpressHeaders() / hasExpressHeader()
  -> middleware modules in request-logger and rate-limiter
```

## File Structure

| File          | Role                                            |
| ------------- | ----------------------------------------------- |
| `services.ts` | Express-like types and request/response helpers |
| `README.md`   | User-facing Express integration guide           |

## Key Responsibilities

- Define framework-light Express-compatible request, response, and next types.
- Adapt Express requests into the shared request contract used by feature modules.
- Normalize headers and bodies for middleware logging and persistence.

## Dependencies

- Shared context: [../context](../context)
- Shared requests: [../requests](../requests)
- Parent guide: [../../../AGENTS.md](../../../AGENTS.md)
- Root README: [../../../README.md](../../../README.md)

## Navigation

- Main implementation: [services.ts](services.ts)
- Module guide: [README.md](README.md)
