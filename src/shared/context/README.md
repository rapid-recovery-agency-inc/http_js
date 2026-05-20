# Context

Request-scoped context factory that binds environment configuration, writer resources, and reader resources to a single request. Used internally by the rate-limiter, request-logger, and exceptions modules to access database pools and config without threading them through every function call.

## Why use it

- Keeps resource access consistent across modules — each module calls `ctx.writer` or `ctx.reader` rather than managing its own pool references.
- Reader selection is pluggable: the default picks a random replica; supply `selectReader` to customise (e.g. round-robin or affinity).
- Context enhancers allow middleware to augment the context with extra state (e.g. authenticated user) before handing it to downstream handlers.
- `attachContextToRequest` stores the context on `request.state` so it can be retrieved later without re-building it.

## Building a context factory

```typescript
import {
  buildContextFactory,
  buildContextDependencyFactory,
  type ContextOptions,
} from 'http_js';
import {
  getAsyncWriterConnectionPool,
  getRandomReaderConnectionPool,
} from 'http_js';

const options: ContextOptions<AppEnv, PostgresPool, PostgresPool, AppRequest> =
  {
    getWriterResource: (env) => getAsyncWriterConnectionPool(env),
    getReaderResources: (env) => getAsyncReadersConnectionPools(env),
  };

const createContext = buildContextFactory(appEnv, options);

// In a request handler:
const ctx = createContext(request);
await ctx.writer.query('INSERT INTO ...', []);
const row = await ctx.reader.query('SELECT ...', []);
```

## Using context enhancers

Enhancers run after the context is built and can attach extra state:

```typescript
import type { ContextEnhancer } from 'http_js';

const addUser: ContextEnhancer<
  AppEnv,
  PostgresPool,
  PostgresPool,
  AppRequest
> = (request, context) => {
  request.state ??= {};
  request.state.userId = extractUserIdFromJwt(request);
};

const options = { ...baseOptions, enhancers: [addUser] };
```

## Attaching context to request state

```typescript
import { attachContextToRequest } from 'http_js';

const ctx = createContext(request);
attachContextToRequest(request, ctx);

// Later in the same request lifecycle, retrieve it from state:
const stored = request.state?.context;
```

## API

| Export                          | Description                                                     |
| ------------------------------- | --------------------------------------------------------------- |
| `Context`                       | Class holding `env`, `writerPool`, `readerPools`, and `request` |
| `buildContextFactory`           | Returns a factory `(request) => Context`                        |
| `buildContextDependencyFactory` | Variant that injects env at factory-build time                  |
| `attachContextToRequest`        | Stores a `Context` instance on `request.state.context`          |
| `ContextEnhancer`               | Type for a function that augments a context after creation      |
| `ContextFactory`                | Type of the factory returned by `buildContextFactory`           |
| `ContextOptions`                | Options passed to `buildContextFactory`                         |
| `ContextRequestLike`            | Minimal request interface required by this module               |
| `ContextState`                  | Shape of `request.state` used by this module                    |
