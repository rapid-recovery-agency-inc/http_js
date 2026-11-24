# http_js

TypeScript utilities for building HTTP APIs and microservices.

## Structure

```text
src/
├── index.ts
├── cli/
│   ├── setup-environment.ts
├── modules/
│   ├── cache/
│   ├── environment/
│   ├── hmac/
│   ├── prisma/
│   ├── prisma-retry/
│   ├── rate-limiter/
│   └── request-logger/
└── shared/
	├── context/
	├── express/
	├── logging/
	├── requests/
	└── utils/
		├── async/
		├── aws/
		├── protocols.ts
		├── async/timeout.ts
		├── aws/services.ts
		└── utils.test.ts
```

## Layout Rules

- Put first-class library features in `src/modules`.
- Put cross-cutting infrastructure primitives in `src/shared`.
- Keep the public package API stable through `src/index.ts`.
- Use `src/shared/utils/async` for timeout-style helpers.
- Use `src/shared/utils/aws` for AWS Secrets Manager helpers.

## Modules

- `cache`: in-memory, repository-backed SQL, and Redis cache implementations
- `Environment`: type-safe way to load, parse, and validate environment variables
- `hmac`: signing, signature verification, and Express middleware helpers
- `prisma`: schema-agnostic Prisma client and identifier helpers
- `prisma-retry`: Prisma extension factory for retrying transient query failures
- `request-logger`: console and repository-backed request logging
- `rate-limiter`: rule lookup, count aggregation, and middleware via repositories

## Shared

- `context`: request-scoped context factories and state attachment
- `express`: Express-compatible request/response adapter helpers
- `logging`: structured logger factory with level filtering and module binding
- `requests`: request extraction and validation
- `utils`: protocol helpers plus nested `async` and `aws` utilities

## Navigation

- See `AGENTS.md` at the repository root for the top-level map.
- Each folder under `src/modules` and `src/shared` now has its own `AGENTS.md` with local implementation notes and navigation links.

## Consumption

This package ships bundled output from `src/index.ts`:

| Consumer        | Entry               | Format           |
| --------------- | ------------------- | ---------------- |
| ESM (`import`)  | `dist/index.js`     | ES module bundle |
| CJS (`require`) | `dist/cjs/index.js` | CommonJS bundle  |

- **Always import from the package root** — `import { ... } from '@rapid-recovery-agency-inc/http_js'` or `require('@rapid-recovery-agency-inc/http_js')`.
- **Do not deep-import from `dist/`** — individual module files no longer exist in the published output. The only supported entry point is the package root via the `exports` field. TypeScript declarations (`.d.ts` files) are provided for editor support but do not imply a runtime import path.
- All `dependencies` and `peerDependencies` are external to the bundle — your runtime resolves them normally.
- The `setup-environment` CLI is bundled separately and invoked via `npx setup-environment` or the `bin` entry.

## Development

```bash
npm install
npm run lint
npm run type-check
npm run test
npm run build
```

### AWS-backed HMAC client

```ts
import { createAwsHmacClient } from '@rapid-recovery-agency-inc/http_js';

const hmac = createAwsHmacClient({
  secretName: 'development/hmac-keys',
  signatureHeader: 'X-RRA-Signature',
  customHeaders: [
    { name: 'X-Tenant-Id', validate: (value) => value.trim().length > 0 },
  ],
});
```

This adapter keeps `createHmacClient` provider-independent. It retrieves SecretString lazily with the default AWS SDK credentials/region and accepts only a non-empty JSON object whose values are non-empty strings. Values retain their existing order: the first signs, and all values verify during rotation. It does not sort date-like keys or modify key bytes. Malformed JSON produces a sanitized error without logging its contents.

The core client shares concurrent resolution, caches a successful result per client, and retries after a failed fetch or validation. Successful caches do not auto-refresh; recreate the client to reload rotated AWS keys. Existing injected-secret/resolver APIs and signature formats are unchanged.

Release the package containing this additive export before updating consumer imports and dependency locks. For local integration, build and pack this checkout and test the packed artifact without publishing it.
