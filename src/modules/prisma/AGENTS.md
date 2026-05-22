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

## Navigation

- Public exports: [../../../index.ts](../../../index.ts)
- Main implementation: [services.ts](services.ts)
- Module guide: [README.md](README.md)
