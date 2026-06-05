# Prisma Retry Module

## Purpose

This module provides a reusable Prisma extension factory for retrying transient database failures. It is designed to be consumed from different service stacks while relying on the caller's Prisma runtime rather than bundling Prisma inside this package.

## Architecture

```text
Prisma runtime + retry options
  -> prismaRetryExtension()
      -> Prisma query hooks
          -> executeWithRetry()
              -> shouldRetry()
              -> calculateDelay()
              -> optional timeout wrapper
```

## File Structure

| File                   | Role                                              |
| ---------------------- | ------------------------------------------------- |
| `../../../index.ts`    | Root package export surface for this module       |
| `services.ts`          | Retry policy, timeout helpers, and extension hook |
| `prisma-retry.test.ts` | Module tests                                      |

## Key Responsibilities

- Build a Prisma extension that wraps all operations (`$allModels.$allOperations` for model queries, `$allOperations` for raw queries) with retry behavior.
- Detect transient Prisma and network-style failures that are safe to retry.
- Apply exponential backoff with configurable jitter.
- Support optional per-operation timeouts.
- Stay decoupled from a pinned Prisma package version by accepting the consumer's runtime namespace.

## Dependencies

- Shared logging: [../../shared/logging](../../shared/logging)
- Shared sleep utility: [../../shared/utils](../../shared/utils)
- Parent guide: [../../../AGENTS.md](../../../AGENTS.md)
- Root README: [../../../README.md](../../../README.md)

## Consumer Integration

This module does not depend on `@prisma/client`. Consumers pass their own Prisma runtime via the `PrismaRetryRuntime` interface:

```ts
import { Prisma } from '@prisma/client';
import { prismaRetryExtension } from '@rapid-recovery-agency-inc/http_js';

const extension = prismaRetryExtension(Prisma, { maxAttempts: 3 });
const client = new PrismaClient().$extends(extension);
```

- **CJS consumers** (NestJS + webpack): use `require('@rapid-recovery-agency-inc/http_js')`. The package's dual ESM/CJS build provides a `require`-compatible entry point — no special webpack `conditionNames` or externals configuration is needed.
- **ESM consumers**: use `import { prismaRetryExtension } from '@rapid-recovery-agency-inc/http_js'`.

## Navigation

- Public exports: [../../../index.ts](../../../index.ts)
- Main implementation: [services.ts](services.ts)
- Tests: [**tests**/prisma-retry.test.ts](__tests__/prisma-retry.test.ts)
