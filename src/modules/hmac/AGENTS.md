# HMAC Module

## Purpose

This module provides HMAC signing, signature verification, and Express middleware helpers for HTTP requests. It is designed as a standalone security capability with explicit request abstractions and typed configuration.

## Architecture

```text
request
  -> hmacMiddleware() [optional]
  -> signature extraction
	  -> canonical message signing
		  -> verification or HMACException
```

## File Structure

| File                     | Role                                                           |
| ------------------------ | -------------------------------------------------------------- |
| `../../../index.ts`      | Root package export surface for this module                    |
| `services.ts`            | Verification logic, dependency helpers, and Express middleware |
| `utils.ts`               | Low-level signing helper                                       |
| `types.ts`               | HMAC request and environment types                             |
| `constants.ts`           | Error message constants                                        |
| `exceptions.ts`          | HMAC-specific exception type                                   |
| `__tests__/hmac.test.ts` | Module tests                                                   |

## Key Responsibilities

- Generate HMAC signatures.
- Validate request signatures.
- Support key rotation-style configuration through secret arrays.
- Provide Express middleware factory for direct request-pipeline integration.
- Keep core signature behavior framework-agnostic for non-Express callers.

## Dependencies

- Related shared utilities: [../../shared/utils](../../shared/utils)
- Parent guide: [../../../AGENTS.md](../../../AGENTS.md)
- Root README: [../../../README.md](../../../README.md)

## Navigation

- Public exports: [../../../index.ts](../../../index.ts)
- Core implementation: [services.ts](services.ts)
- Low-level helper: [utils.ts](utils.ts)
- Tests: [**tests**/hmac.test.ts](__tests__/hmac.test.ts)
