# HMAC

Canonical HMAC-SHA256 signing and verification for internal HTTP requests.
The module supports outbound clients, framework-neutral verification, Express
middleware, secret rotation, custom signed headers, and lazy AWS Secrets
Manager resolution.

Node.js 24 or newer is required. Consumers on Node.js 22 must upgrade before
adopting this package release.

## Client API

The `createHmacClient` contract is compatible with the former
`@rapid-recovery-agency-inc/environment` HMAC client.

```typescript
import { createHmacClient } from '@rapid-recovery-agency-inc/http_js';

const hmac = createHmacClient({
  secretName: 'production/service-hmac',
  signatureHeader: 'X-HMAC-Signature',
  customHeaders: [
    {
      name: 'x-tenant-id',
      validate: (value) => value.trim().length > 0,
    },
  ],
});

const input = {
  method: 'PATCH',
  url: '/v1/users/42?ignored=true',
  params: { notify: true },
  body: JSON.stringify({ active: false }),
  headers: { 'x-tenant-id': 'acme' },
};

const signature = await hmac.sign(input);
await hmac.verify(signature, input);
```

The default signature header is `RRA-HMAC-Signature`.

## Secret sources

Choose exactly one source:

```typescript
const direct = createHmacClient({
  secrets: ['current-secret', 'previous-secret'],
});

const resolved = createHmacClient({
  resolveSecrets: async () => loadSecretsFromAnotherProvider(),
});

const aws = createHmacClient({
  secretName: 'production/service-hmac',
  awsRegion: 'us-east-1', // optional; the AWS provider chain is used otherwise
});
```

The first secret signs outbound requests. Verification checks every secret to
support rotation. Asynchronous resolution is lazy, shares one in-flight request,
caches successful values, and retries after failures.

AWS secret payload values are used in JSON property order. Put the current
signing secret first and previous rotation secrets afterward.

## Canonical message

The signed message concatenates these values without separators:

```text
percent_encoded_path + sorted_query_parameters + normalized_body + signed_headers
```

- GET, POST, PATCH, and DELETE are supported.
- GET ignores its body. POST, PATCH, and DELETE include string, Buffer, or
  Uint8Array bodies decoded as UTF-8.
- Relative and absolute URLs are accepted. URL query strings and fragments do
  not form part of the path; query data must be supplied through `params`.
- Paths are encoded from UTF-8 bytes. Alphanumerics, `-`, `.`, `_`, `~`, `/`,
  and `:` are preserved; other bytes use uppercase percent encoding.
- Query keys use deterministic code-point ordering and serialize as
  `key + String(value)`.
- Signed header names are lowercase and deterministically sorted. Values are
  trimmed and repeated values are joined with commas in encounter order.
- Only configured custom headers are included in the signed message.

Changing any of these rules is a wire-protocol change.

## Express middleware

Existing middleware configuration remains supported:

```typescript
import { hmacMiddleware } from '@rapid-recovery-agency-inc/http_js';

app.use(
  hmacMiddleware({
    HMAC_HEADER_NAME: 'X-HMAC-Signature',
    SECRETS: [process.env.HMAC_SECRET!, process.env.PREVIOUS_HMAC_SECRET!],
  }),
);
```

`requireHmacSignature`, `buildHmacFactoryDependency`, `hmacMiddleware`, and
the low-level `sign(secret, url, params, body)` helper now use the same
canonical protocol. Inbound GET and POST verification also accepts the former
`http_js` path encoding during migration.

## Errors and security

Verification failures use `HmacError` for the client and `HMACException` for
the legacy middleware surface. `HmacError` extends `HMACException`.

Available constants include `HMAC_MISSING_SIGNATURE`,
`HMAC_INVALID_SIGNATURE`, `HMAC_INVALID_HEADERS`,
`HMAC_UNSUPPORTED_METHOD`, and `HMAC_SIGNATURE_HEADER`.

- Never log secrets, request signatures, authorization headers, or sensitive
  signed bodies.
- Keep sender and receiver canonicalization inputs identical.
- Deploy communicating sender/receiver migrations together or retain the
  documented compatibility window.
