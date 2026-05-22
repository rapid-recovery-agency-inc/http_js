# Express Helpers

Minimal Express-compatible adapter types and helpers for shared HTTP modules. This layer keeps the package compatible with Express request/response middleware without taking a hard runtime dependency on the `express` package.

## Why use it

- Lets feature modules expose Express-compatible middleware while staying decoupled from concrete Express types.
- Adapts Express request objects into the existing `RequestLike` and `ContextRequestLike` contracts used elsewhere in the package.
- Normalizes headers and payloads for persistence-oriented modules such as request logging.

## Usage

```typescript
import type { ExpressRequestLike } from 'http_js';
import { createContextRequestFromExpress } from 'http_js';

function createServiceContext(request: ExpressRequestLike) {
  const contextRequest = createContextRequestFromExpress(request);
  return buildContextFactory(env, options)(contextRequest);
}
```

## API

| Export                            | Description                                              |
| --------------------------------- | -------------------------------------------------------- |
| `ExpressRequestLike`              | Minimal request contract expected from Express           |
| `ExpressResponseLike`             | Minimal response contract expected from Express          |
| `ExpressNextFunction`             | Minimal `next` callback signature                        |
| `ExpressMiddleware`               | Middleware function signature used by Express adapters   |
| `createContextRequestFromExpress` | Adapts an Express request to the shared request contract |
| `ensureExpressRequestState`       | Initializes `request.state` when needed                  |
| `normalizeExpressHeaders`         | Converts response headers to a string record             |
| `hasExpressHeader`                | Checks whether a response header is present              |
| `stringifyExpressBody`            | Serializes request or response bodies for logging        |
