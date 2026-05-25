# Context

Shared context contracts for request-scoped dependencies.

## Why use it

- Keeps resource access consistent across modules through a single context shape: `{ writer, reader }`.
- Supports request-state attachment with `attachContextToRequest` when middleware needs `request.state.context`.
- Provides Prisma client construction and Express middleware helpers for `res.locals.ctx`.

## Service context contract

```typescript
import type { ServiceContext } from 'http_js';

type RepoContext = ServiceContext<RequestWriterRepo, RequestReaderRepo>;

const ctx: RepoContext = {
  writer: writerRepo,
  reader: readerRepo,
};
await ctx.writer.save({ path: '/events', fromCache: false });
const rule = await ctx.reader.fetchRule(requestData);
```

## Attaching context to request state

```typescript
import { attachContextToRequest } from 'http_js';

const ctx = { writer: writerRepo, reader: readerRepo };
attachContextToRequest(request, ctx);

// Later in the same request lifecycle, retrieve it from state:
const stored = request.state?.context;
```

## Prisma clients

For services that use Prisma, `buildPrismaClients` creates writer and reader clients with `prismaRetryExtension` applied at startup. `buildPrismaContextMiddleware` then wraps those clients in a per-request `PrismaServiceContext` stored on `res.locals.ctx`.

```typescript
import {
  buildPrismaClients,
  buildPrismaContextMiddleware,
  type PrismaRetryRuntime,
} from 'http_js';
import { Prisma, PrismaClient } from './prisma/generated/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prismaClients = buildPrismaClients({
  prismaRuntime: Prisma as unknown as PrismaRetryRuntime,
  createClient: (url: string) =>
    new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) }),
  writerUrl: getWriterConnectionString(),
  readerUrls: getReaderConnectionStrings(), // optional
});

// In Express bootstrap:
app.use(buildPrismaContextMiddleware(prismaClients));

// In a request handler:
const ctx = res.locals.ctx as PrismaServiceContext<PrismaClient>;
await ctx.writer.notification.create({ data: { ... } });
const row = await ctx.reader.notification.findFirst({ where: { id } });
```

If `readerUrls` is omitted or empty, `ctx.reader` falls back to the writer client.

## API

### Shared context

| Export                          | Description                                                        |
| ------------------------------- | ------------------------------------------------------------------ |
| `attachContextToRequest`        | Stores a service context on `request.state.context`                |
| `ServiceContext`                | Generic context shape (`{ writer, reader }`)                       |
| `ContextRequestLike`            | Minimal request interface required by this module                  |
| `ContextState`                  | Shape of `request.state` used by this module                       |

### Prisma context

| Export                          | Description                                                        |
| ------------------------------- | ------------------------------------------------------------------ |
| `buildPrismaClients`            | Creates writer + reader Prisma clients with retry extension applied |
| `buildPrismaContextFactory`     | Returns a factory `() => PrismaServiceContext`                     |
| `buildPrismaContextMiddleware`  | Express middleware that writes context to `res.locals.ctx`         |
| `PrismaContextBuildOptions`     | Options type for `buildPrismaClients`                              |
| `PrismaServiceContext`          | Shape of the per-request context (`{ writer, reader }`)            |
