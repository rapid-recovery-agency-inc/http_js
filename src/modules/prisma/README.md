# Prisma

Schema-agnostic Prisma infrastructure helpers for shared modules. This module is intentionally decoupled from generated Prisma model delegates so consuming services can inject their own Prisma clients, runtime table names, and optional schema names.

## Why use it

- Keeps shared modules reusable across services with different Prisma schemas.
- Limits Prisma usage to connection management, client extensions, and raw SQL execution.
- Supports separate writer and reader clients without requiring PostgreSQL-specific pool types.
- Validates dynamic schema and table identifiers before they are interpolated into raw SQL.

## Usage

```typescript
import { Prisma, PrismaClient } from '@prisma/client';
import {
  cleanupPrismaClients,
  createPrismaClients,
  selectRandomPrismaReader,
  warmUpPrismaClients,
  type PrismaQueryableClient,
} from 'http_js';

const clients = createPrismaClients({
  writerUrl: process.env.DATABASE_URL!,
  readerUrls: process.env.DATABASE_READ_URLS?.split(','),
  createClient(url) {
    return new PrismaClient({ datasources: { db: { url } } });
  },
});

await warmUpPrismaClients(clients);

const reader = selectRandomPrismaReader(clients.readers);
const writer: PrismaQueryableClient<Prisma.Sql> = clients.writer;

await cleanupPrismaClients(clients);
```

## API

| Export                       | Description                                         |
| ---------------------------- | --------------------------------------------------- |
| `createPrismaClients`        | Creates writer and reader clients from runtime URLs |
| `warmUpPrismaClients`        | Connects all configured clients                     |
| `cleanupPrismaClients`       | Disconnects all configured clients                  |
| `selectRandomPrismaReader`   | Selects a random reader client                      |
| `normalizeIdentifier`        | Validates a schema or table identifier              |
| `resolveQualifiedTableName`  | Builds an optional-schema qualified table name      |
| `PrismaStatementFactory`     | Minimal SQL statement builder contract              |
| `PrismaQueryableClient`      | Minimal raw-query Prisma client contract            |
| `PrismaExtensibleClient`     | Prisma client contract with optional `$extends`     |
| `PrismaClients`              | Reader/writer client container                      |
| `PrismaClientFactoryOptions` | Runtime client factory settings                     |
