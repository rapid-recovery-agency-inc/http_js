# http_js

TypeScript utilities for building HTTP APIs and microservices.

## Structure

```text
src/
├── index.ts
├── modules/
│   ├── cache/
│   ├── environment/
│   ├── exceptions/
│   ├── hmac/
│   ├── prisma/
│   ├── prisma-retry/
│   ├── rate-limiter/
│   └── request-logger/
└── shared/
	├── context/
	├── e2e-testing/
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
- `environment`: schema-based environment loading and coercion
- `exceptions`: request-aware exception handlers and content builders
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

## Development

```bash
npm install
npm run lint
npm run type-check
npm run test
npm run build
```
