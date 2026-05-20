# Exceptions Module

## Purpose

This module provides request-aware exception handling helpers. It maps errors to HTTP-style response payloads, enriches responses with request metadata, and supports custom content builders.

## Architecture

```text
error + request
  -> rule matching
	  -> content builder
		  -> response payload + status code
```

## File Structure

| File                 | Role                                                     |
| -------------------- | -------------------------------------------------------- |
| `../../../index.ts`  | Root package export surface for this module              |
| `services.ts`        | Rule matching, metadata extraction, and content builders |
| `exceptions.test.ts` | Module tests                                             |

## Key Responsibilities

- Extract request metadata for logging and error payloads.
- Create handler maps and ordered exception handlers.
- Support validation-style, client-style, and unexpected-error responses.
- Keep framework integration shallow by exposing plain functions.

## Dependencies

- Shared Context: [../../shared/context](../../shared/context)
- Logging module: [../logging](../logging)
- Parent guide: [../../../AGENTS.md](../../../AGENTS.md)
- Root README: [../../../README.md](../../../README.md)

## Navigation

- Public exports: [../../../index.ts](../../../index.ts)
- Main implementation: [services.ts](services.ts)
- Tests: [exceptions.test.ts](exceptions.test.ts)
