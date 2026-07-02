# Shared Requests

## Purpose

This shared area provides framework-agnostic request extraction and request normalization helpers. It defines the request-shaped interfaces used by higher-level modules without binding the library to a specific server framework.

## Architecture

```text
request-like object
  -> extractRequestData()
	  -> ExtractedRequestData
		  -> applyRequestDefaults() with optional overrides and DEFAULT fallbacks
```

## File Structure

| File                         | Role                                             |
| ---------------------------- | ------------------------------------------------ |
| `../../../index.ts`          | Root package export surface for this shared area |
| `services.ts`                | Request extraction and normalization logic       |
| `__tests__/requests.test.ts` | Shared area tests                                |

## Key Responsibilities

- Define the minimal request interfaces needed by the package.
- Extract request metadata, headers, and body into one typed structure.
- Normalize missing product-related fields to `DEFAULT` for downstream modules.
- Serve as the shared HTTP-shape abstraction across the library.

## Dependencies

- Related shared area: [../context](../context)
- Logging shared area: [../logging](../logging)
- Parent guide: [../../../AGENTS.md](../../../AGENTS.md)
- Root README: [../../../README.md](../../../README.md)

## Navigation

- Public exports: [../../../index.ts](../../../index.ts)
- Main implementation: [services.ts](services.ts)
- Tests: [tests/requests.test.ts (**tests**)](__tests__/requests.test.ts)
