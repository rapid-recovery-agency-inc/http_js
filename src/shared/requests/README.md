# Shared Requests

Framework-agnostic request interfaces and extraction helpers. Defines the minimal request shape used across the library and provides a single function to pull all relevant metadata out of an incoming request.

## Why use it

- Decouples the library from any specific HTTP framework — only a thin `RequestLike` interface is required.
- `extractRequestData` reads path, headers, body, and product-tracking fields (`product_name`, `product_module`, `product_feature`, `product_tenant`) in one call.
- `applyRequestDefaults` applies optional overrides and normalizes missing fields by assigning the default value `DEFAULT` before passing data to the rate-limiter or request-logger.

## Request interface

```typescript
import type { RequestLike, HeadersLike, QueryParamsLike, UrlLike } from 'http_js';

// Implement these on your framework's request object to use the library
class MyRequest implements RequestLike {
  headers: HeadersLike;
  method: string;
  queryParams: QueryParamsLike;
  url: UrlLike;
  text(): Promise<string> { ... }
}
```

## Extracting request data

```typescript
import { extractRequestData } from 'http_js';

const data = await extractRequestData(request);
// {
//   path: '/api/users',
//   requestHeaders: '{"content-type":"application/json"}',
//   requestBody: '{"product_name":"myapp",...}',
//   productName: 'myapp',
//   productModule: 'users',
//   productFeature: 'create',
//   productTenant: 'tenant-1',
// }
```

Product fields are read from the request body (POST) or query string (GET).

## Normalizing extracted data

```typescript
import { applyRequestDefaults } from 'http_js';

// Missing product fields are replaced with 'DEFAULT'
const normalized = applyRequestDefaults(data);

// Optional overrides are applied first, then fallback values are resolved
const normalizedWithOverride = applyRequestDefaults(data, {
  productName: 'api',
  productFeature: 'send',
});

Override fields are optional; when provided they must be strings.
```

## API

| Export                        | Description                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `extractRequestData`          | Reads path, headers, body, and product fields from a request                       |
| `applyRequestDefaults`        | Applies optional overrides and returns data with missing fields set to `'DEFAULT'` |
| `RequestLike`                 | Minimal request interface required by the library                                  |
| `HeadersLike`                 | Interface for request headers                                                      |
| `QueryParamsLike`             | Interface for query parameter access                                               |
| `UrlLike`                     | Interface for URL with a `path` property                                           |
| `ResponseLike`                | Minimal response shape `{ body, statusCode }`                                      |
| `StreamingResponseLike`       | Response shape with an async body iterator                                         |
| `NextCallable`                | Type for a non-streaming downstream handler                                        |
| `StreamingNextCallable`       | Type for a streaming downstream handler                                            |
| `ExtractedRequestData`        | Shape of the object returned by `extractRequestData`                               |
| `RequestDataDefaultsOverride` | Optional overrides accepted by `applyRequestDefaults`                              |
| `NormalizedRequestData`       | Shape returned by `applyRequestDefaults` with non-null string fields               |
