# Shared Context

## Purpose

This shared area provides request-scoped context contracts and attachment helpers. It gives higher-level modules a common `{ writer, reader }` shape for repositories or Prisma clients, plus a Prisma-specific integration layer that creates writer/reader Prisma clients with the prisma-retry extension applied and exposes an Express middleware that stores the resulting context on `res.locals.ctx`.

## Architecture

```text
# Shared context contract
ServiceContext<TWriter, TReader>
    -> { writer, reader }
    -> attachContextToRequest(request, ctx)
            -> request.state.context

# Prisma path
buildPrismaClients(options)
  -> PrismaClients (writer + readers, retry extension applied)
      -> buildPrismaContextFactory(clients)
          -> per-request PrismaServiceContext
      -> buildPrismaContextMiddleware(clients)
          -> Express middleware -> res.locals.ctx
```

## File Structure

| File                      | Role                                                             |
| ------------------------- | ---------------------------------------------------------------- |
| `../../../index.ts`       | Root package export surface for this shared area                 |
| `services.ts`             | Shared context types and request-state attachment helper         |
| `prisma-context.ts`       | Prisma-specific context factory, client builder, and Express middleware |
| `context.test.ts`         | Shared context helper tests                                      |
| `prisma-context.test.ts`  | Prisma context and middleware tests                              |

## Key Responsibilities

- Define the shared service context contract (`{ writer, reader }`).
- Create Prisma writer/reader clients with `prismaRetryExtension` applied.
- Expose an Express middleware that writes `PrismaServiceContext` to `res.locals.ctx`.
- Attach context to request state in a framework-agnostic way.
- Act as the common dependency boundary for request-aware modules.

## Dependencies

- Prisma module: [../../modules/prisma](../../modules/prisma)
- Prisma retry module: [../../modules/prisma-retry](../../modules/prisma-retry)
- Related shared area: [../requests](../requests)
- Parent guide: [../../../AGENTS.md](../../../AGENTS.md)
- Root README: [../../../README.md](../../../README.md)

## Navigation

- Public exports: [../../../index.ts](../../../index.ts)
- Shared context types: [services.ts](services.ts)
- Prisma implementation: [prisma-context.ts](prisma-context.ts)
- Shared context tests: [context.test.ts](__tests__/context.test.ts)
- Prisma tests: [prisma-context.test.ts](__tests__/prisma-context.test.ts)
