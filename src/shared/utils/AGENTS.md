# Shared Utils

## Purpose

This shared area contains generic utility helpers that do not belong to a single feature module. It currently includes protocol conformance helpers plus nested utility areas for async timeout helpers and AWS Secrets Manager helpers.

## Architecture

```text
shared utility surface
	-> protocols.ts
	-> async/
	-> aws/
```

The goal here is to keep generic helpers centralized without turning `utils` into an unstructured dump of unrelated logic.

## File Structure

| File                | Role                                             |
| ------------------- | ------------------------------------------------ |
| `../../../index.ts` | Root package export surface for shared utilities |
| `protocols.ts`      | Protocol-definition and conformance helpers      |
| `utils.test.ts`     | Shared area tests                                |
| `async`             | Timeout-style helpers                            |
| `aws`               | AWS Secrets Manager helpers                      |

## Key Responsibilities

- Provide generic protocol conformance helpers.
- Group small cross-cutting utilities that do not justify their own top-level shared area.
- Host the `async` and `aws` subareas under one predictable location.

## Subareas

- Async helpers: [async](async)
- AWS helpers: [aws](aws)

## Dependencies

- Parent guide: [../../../AGENTS.md](../../../AGENTS.md)
- Root README: [../../../README.md](../../../README.md)

## Navigation

- Public exports: [../../../index.ts](../../../index.ts)
- Core implementation: [protocols.ts](protocols.ts)
- Tests: [utils.test.ts](utils.test.ts)
