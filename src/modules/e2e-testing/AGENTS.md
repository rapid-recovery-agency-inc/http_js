# E2E Testing Module

## Purpose

This module provides the Jest-friendly end-to-end testing utilities for the library. Its main responsibility is to create isolated PostgreSQL databases for tests and apply SQL migrations before each test run.

## Architecture

```text
test case
	-> CustomAsyncTestCase
		 -> admin pool creates temp database
		 -> database pool opens isolated test DB
		 -> migrations are loaded and executed
```

## File Structure

| File                  | Role                                            |
| --------------------- | ----------------------------------------------- |
| `../../../index.ts`   | Root package export surface for this module     |
| `services.ts`         | Migration loading and isolated database harness |
| `e2e-testing.test.ts` | Module tests                                    |

## Key Responsibilities

- Load SQL migrations from a folder.
- Cache migration file reads for repeat test runs.
- Create and tear down isolated PostgreSQL databases.
- Provide a small, explicit harness instead of a framework-specific test runner abstraction.

## Dependencies

- Shared Logging: [../../shared/logging](../../shared/logging)
- Parent guide: [../../../AGENTS.md](../../../AGENTS.md)
- Root README: [../../../README.md](../../../README.md)

## Navigation

- Public exports: [../../../index.ts](../../../index.ts)
- Main implementation: [services.ts](services.ts)
- Tests: [e2e-testing.test.ts](e2e-testing.test.ts)
