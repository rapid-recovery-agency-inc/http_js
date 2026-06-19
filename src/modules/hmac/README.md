# HMAC

Request signature generation and verification using HMAC-SHA256. Protects internal service-to-service endpoints from unauthorised callers without adding a full authentication layer.

## Why use it

- Verifies that the caller knows a shared secret before processing the request — simple and lightweight.
- Supports secret rotation: pass multiple secrets and any one match is accepted.
- Timing-safe comparison prevents timing attacks on signature verification.
- Exposes `hmacMiddleware` for direct Express integration.
- Framework-agnostic core verifier: works with any request object that implements `HMACRequestLike`.

## Middleware usage

```typescript
import { hmacMiddleware } from 'http_js';

app.use(
  hmacMiddleware({
    HMAC_HEADER_NAME: 'X-Signature',
    SECRETS: [process.env.HMAC_SECRET!],
  }),
);
```

`hmacMiddleware` sends a 401 response for `HMACException` failures and forwards unexpected errors to `next(error)`.

## Manual middleware implementation

```typescript
import { requireHmacSignature, HMACException } from 'http_js';

const env = {
  HMAC_HEADER_NAME: 'X-Signature',
  SECRETS: [process.env.HMAC_SECRET!],
};

async function hmacMiddleware(request, next) {
  try {
    await requireHmacSignature(request, env);
  } catch (error) {
    if (error instanceof HMACException) {
      return { statusCode: error.statusCode, body: error.message };
    }
    throw error;
  }
  return next(request);
}
```

## Building a pre-wired dependency

Use `buildHmacFactoryDependency` to validate configuration eagerly at startup and get back a single-argument function:

```typescript
import { buildHmacFactoryDependency } from 'http_js';

// Throws at startup if HMAC_HEADER_NAME or SECRETS are invalid
const verifyHmac = buildHmacFactoryDependency(env);

// Later, in a route:
await verifyHmac(request); // throws HMACException if signature is wrong
```

## Signing a request (outbound calls)

```typescript
import { sign } from 'http_js';

const signature = sign(
  secretKey,
  'https://api.internal/endpoint',
  { product_name: 'myapp' }, // query params — sorted and concatenated
  bodyBuffer, // null for GET requests
);

// Add to outbound request header
headers['X-Signature'] = signature;
```

## Signature algorithm

The canonical message is:

```
url_path_percent_encoded + sorted_query_params + body_utf8
```

The message is signed with `HMAC-SHA256` and hex-encoded.

## Error constants

```typescript
import {
  HMAC_MISSING_SIGNATURE,
  HMAC_INVALID_SIGNATURE,
  HMAC_UNSUPPORTED_METHOD,
} from 'http_js';
```

## API

| Export                       | Description                                                       |
| ---------------------------- | ----------------------------------------------------------------- |
| `hmacMiddleware`             | Express middleware factory that verifies request signatures       |
| `requireHmacSignature`       | Verifies the HMAC signature on an incoming request                |
| `buildHmacFactoryDependency` | Validates config eagerly and returns a single-arg verify function |
| `sign`                       | Generates an HMAC-SHA256 hex signature for a request              |
| `HMACException`              | Thrown when verification fails (carries `statusCode`)             |
| `HMAC_MISSING_SIGNATURE`     | Error message constant — missing header                           |
| `HMAC_INVALID_SIGNATURE`     | Error message constant — signature mismatch                       |
| `HMAC_UNSUPPORTED_METHOD`    | Error message constant — method not GET or POST                   |
| `HMACEnvironment`            | `{ HMAC_HEADER_NAME, SECRETS }`                                   |
| `HMACRequestLike`            | Minimal request interface required by the module                  |
| `HMACFactoryDependency`      | Type of the function returned by `buildHmacFactoryDependency`     |
