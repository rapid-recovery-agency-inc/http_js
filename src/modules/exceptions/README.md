# Exceptions

Request-aware exception handling that maps errors to HTTP response payloads. Define handler rules per error type, attach log levels, and let the library build consistent error responses across all routes.

## Why use it

- Centralises error-to-status-code mapping in one place rather than scattering `try/catch` blocks across route handlers.
- Automatically logs the error at the configured level using the request context.
- Supports custom content builders for full control over the response body.
- Provides built-in builders for validation errors, client errors, and unexpected server errors.

## Defining exception handlers

```typescript
import {
  createExceptionHandler,
  createExceptionHandlers,
  buildValidationContent,
  buildClientErrorContent,
  buildUnexpectedContent,
} from 'http_js';

// Single handler for one error type
const notFoundHandler = createExceptionHandler({
  errorType: NotFoundError,
  statusCode: 404,
  logLevel: 'warning',
});

// Map of handlers for multiple error types
const handlers = createExceptionHandlers([
  {
    errorType: ValidationError,
    statusCode: 422,
    logLevel: 'warning',
    contentBuilder: buildValidationContent,
  },
  {
    errorType: ClientError,
    statusCode: 400,
    logLevel: 'warning',
    contentBuilder: buildClientErrorContent,
  },
  {
    errorType: Error,
    statusCode: 500,
    logLevel: 'error',
    contentBuilder: buildUnexpectedContent,
  },
]);
```

## Using in a route handler

```typescript
import { getRequestMetadata } from 'http_js';

async function handleRequest(request: ExceptionRequestLike) {
  try {
    return await processRequest(request);
  } catch (error) {
    for (const handler of handlers) {
      const match = handler(request, error as Error);
      if (match !== null) {
        return match; // { content, statusCode }
      }
    }
    throw error;
  }
}
```

## Extracting request metadata

```typescript
import { getRequestMetadata } from 'http_js';

const metadata = getRequestMetadata(request);
// { method: 'POST', path: '/api/users', requestId: 'abc-123' }
```

## Custom content builder

```typescript
import type { ContentBuilder } from 'http_js';

const myBuilder: ContentBuilder = async (request, error, metadata) => {
  const content = { detail: error.message, ...metadata };
  const logContext = { errorName: error.name };
  return [content, logContext] as const;
};
```

## API

| Export                     | Description                                            |
| -------------------------- | ------------------------------------------------------ |
| `createExceptionHandler`   | Creates a handler function for a single error type     |
| `createExceptionHandlers`  | Creates an ordered list of handlers from a rule array  |
| `getRequestMetadata`       | Extracts method, path, and requestId from a request    |
| `buildValidationContent`   | Content builder for validation errors (422)            |
| `buildClientErrorContent`  | Content builder for client / downstream errors (400)   |
| `buildUnexpectedContent`   | Content builder for unexpected server errors (500)     |
| `ContentBuilder`           | Type for a custom content builder function             |
| `ExceptionHandler`         | Type for a handler function                            |
| `ExceptionHandlerResponse` | `{ content, statusCode }` returned by a handler        |
| `HandlerRule`              | Rule shape passed to `createExceptionHandlers`         |
| `HandlerRuleMatch`         | Matched handler + rule pair                            |
| `LogLevelName`             | Union of log level strings (`'debug'`, `'info'`, etc.) |
| `RequestMetadata`          | `{ method, path, requestId }`                          |
| `ValidationErrorLike`      | Interface for errors that expose an `errors()` method  |
| `ExceptionRequestLike`     | Request shape required by exception handlers           |
