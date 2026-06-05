# Prisma Module

## Purpose

This module provides schema-agnostic Prisma infrastructure helpers for shared feature modules. It owns client lifecycle helpers, reader/writer client selection, extension application, and identifier validation without coupling the package to any generated Prisma schema.

## Architecture

```text
runtime URLs + client factory
  -> createPrismaClients()
      -> writer client
      -> reader clients
  -> warmUpPrismaClients() / cleanupPrismaClients()

runtime schema/table names
  -> normalizeIdentifier()
  -> resolveQualifiedTableName()
```

## File Structure

| File                | Role                                                 |
| ------------------- | ---------------------------------------------------- |
| `../../../index.ts` | Root package export surface for this module          |
| `services.ts`       | Client lifecycle, extension application, identifiers |
| `README.md`         | User-facing Prisma infrastructure guide              |

## Key Responsibilities

- Define minimal Prisma client and SQL-builder interfaces.
- Build writer/reader client groups from runtime URLs.
- Apply optional Prisma client extensions such as retry handling.
- Validate schema and table identifiers before raw SQL execution.

## Dependencies

- Shared logging: [../../shared/logging](../../shared/logging)
- Parent guide: [../../../AGENTS.md](../../../AGENTS.md)
- Root README: [../../../README.md](../../../README.md)

## Consumer Integration

This module is schema-agnostic and does not depend on `@prisma/client`. Consumers provide their own client factory and URLs:

```ts
import { PrismaClient } from '@prisma/client';
import {
  createPrismaClients,
  warmUpPrismaClients,
} from '@rapid-recovery-agency-inc/http_js';

const clients = createPrismaClients({
  createClient: (url) => new PrismaClient({ datasourceUrl: url }),
  writerUrl: process.env.DATABASE_URL,
  readerUrls: [process.env.READER_URL],
});
await warmUpPrismaClients(clients);
```

- **CJS consumers** (NestJS + webpack): use `require('@rapid-recovery-agency-inc/http_js')`. The dual ESM/CJS build provides a `require`-compatible entry point.
- **ESM consumers**: use `import { ... } from '@rapid-recovery-agency-inc/http_js'`.

## Navigation

- Public exports: [../../../index.ts](../../../index.ts)
- Main implementation: [services.ts](services.ts)
- Module guide: [README.md](README.md)
