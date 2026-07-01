# Shared Requests

Framework-agnostic request interfaces and extraction helpers. Defines the minimal request shape used across the library and provides a single function to pull all relevant metadata out of an incoming request.

## Why use it

- Decouples the library from any specific HTTP framework — only a thin `RequestLike` interface is required.
- `extractRequestData` reads path, headers, body, and product-tracking fields (`product_name`, `product_module`, `product_feature`, `product_tenant`) in one call.

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

## API

| Export                  | Description                                                  |
| ----------------------- | ------------------------------------------------------------ |
| `extractRequestData`    | Reads path, headers, body, and product fields from a request |
| `RequestLike`           | Minimal request interface required by the library            |
| `HeadersLike`           | Interface for request headers                                |
| `QueryParamsLike`       | Interface for query parameter access                         |
| `UrlLike`               | Interface for URL with a `path` property                     |
| `ResponseLike`          | Minimal response shape `{ body, statusCode }`                |
| `StreamingResponseLike` | Response shape with an async body iterator                   |
| `NextCallable`          | Type for a non-streaming downstream handler                  |
| `StreamingNextCallable` | Type for a streaming downstream handler                      |
| `ExtractedRequestData`  | Shape of the object returned by `extractRequestData`         |
