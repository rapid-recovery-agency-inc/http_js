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
| `core.ts`                | Canonicalization, signing, verification, and secret resolution |
| `client.ts`              | Public provider-agnostic client factory                        |
| `services.ts`            | Legacy verification helpers and Express middleware             |
| `utils.ts`               | Backward-compatible low-level signing helper                   |
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

## AWS-backed clients

`createAwsHmacClient({ secretName, signatureHeader?, customHeaders? })` adapts an AWS secret name to the core client. Keep SDK fetch/parsing in `src/shared/utils/aws/hmac-secrets.ts`. The adapter uses default AWS region/credential resolution, rejects non-object/empty/non-string payloads, preserves Object.values order and hides JSON parse contents. The first value signs and every value verifies. The core client alone owns lazy resolution, shared in-flight calls, caching and retry. Do not use the generic fetchAwsSecret helper here: its logging/parsing contract is different.

Adding the adapter must not change any existing HMAC export or canonicalization. Both ESM and CJS public entry points must expose the factory and its option type.
