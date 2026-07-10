# AGENTS.md

## Purpose

This repository is a TypeScript utility library for HTTP APIs and microservices. It mirrors the module coverage of `http_py`, but the internal layout follows a `src/modules` and `src/shared` split similar to the notifications microservice reference.

## Architecture

```text
package consumer
	-> src/index.ts
		 -> src/modules/*   for first-class library features
		 -> src/shared/*    for cross-cutting infrastructure primitives
```

The design intent is:

- Put first-class library features in `src/modules` — these are capabilities consumers import and use directly.
- Put lightweight infrastructure primitives in `src/shared` — these are request/context plumbing reused by multiple modules but not primary features in their own right.
- Keep the public package surface stable through `src/index.ts` even when internals move.

## Repository Layout

### Public Entry Points

| Path           | Role                                          |
| -------------- | --------------------------------------------- |
| `src/index.ts` | Package-level public API barrel               |
| `README.md`    | User-facing overview and development commands |

### CLI

| Path                           | Role                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| `src/cli/setup-environment.ts` | fetches secrets, merges them into environment variables, and then executes your app command |

### Scripts

| Path                    | Role                                         |
| ----------------------- | -------------------------------------------- |
| `scripts/build.ts`      | esbuild bundling for ESM, CJS, and CLI       |
| `scripts/smoke-test.ts` | Post-build smoke tests on the bundled output |

### Feature Modules

| Path                         | Role                                                             |
| ---------------------------- | ---------------------------------------------------------------- |
| `src/modules/cache`          | Cache interfaces and cache backend implementations               |
| `src/modules/hmac`           | HMAC signing, signature verification, and Express middleware     |
| `src/modules/prisma`         | Schema-agnostic Prisma client and identifier helpers             |
| `src/modules/prisma-retry`   | Prisma extension factory for retrying transient failures         |
| `src/modules/rate-limiter`   | Rule lookup, count aggregation, and rate-limit enforcement       |
| `src/modules/request-logger` | Console/database request logging helpers                         |
| `src/modules/environment`    | Type-safe way to load, parse, and validate environment variables |

### Shared Infrastructure

| Path                  | Role                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------- |
| `src/shared/context`  | Request-scoped context creation, Prisma client construction, and Express context middleware |
| `src/shared/express`  | Express-compatible request and response adapters                                            |
| `src/shared/logging`  | Structured logger factory with level filtering                                              |
| `src/shared/requests` | Request extraction and request validation helpers                                           |
| `src/shared/utils`    | Protocol helpers and supporting utility areas                                               |

## Navigation

- README: [README.md](README.md)
- Public API: [src/index.ts](src/index.ts)
- Scripts: [scripts](scripts/)
- Modules root: [src/modules](src/modules)
- Shared root: [src/shared](src/shared)
- Cache: [src/modules/cache](src/modules/cache)
- Environment: [src/modules/environment](src/modules/environment/)
- HMAC: [src/modules/hmac](src/modules/hmac)
- Prisma: [src/modules/prisma](src/modules/prisma)
- Prisma retry: [src/modules/prisma-retry](src/modules/prisma-retry)
- Rate limiter: [src/modules/rate-limiter](src/modules/rate-limiter)
- Request logger: [src/modules/request-logger](src/modules/request-logger)
- Context: [src/shared/context](src/shared/context)
- Express: [src/shared/express](src/shared/express)
- Logging: [src/shared/logging](src/shared/logging)
- Requests: [src/shared/requests](src/shared/requests)
- Shared utils: [src/shared/utils](src/shared/utils)

## Working Rules

- Keep public exports stable through `src/index.ts`.
- Put first-class library features in `src/modules`.
- Put cross-cutting infrastructure primitives in `src/shared`.
- Keep AWS helpers in `src/shared/utils/aws`.
- Keep timeout-style helpers in `src/shared/utils/async`.
- Prefer colocated tests inside the owning folder.
- Keep all scripts in `scripts/` as TypeScript (`.ts`) files — run them via `tsx`.

## Build Output

The `build` script uses esbuild to produce bundled output from two entry points:

| Output           | Module format | Directory   | Entry point                    |
| ---------------- | ------------- | ----------- | ------------------------------ |
| ESM (primary)    | ES modules    | `dist/`     | `src/index.ts`                 |
| CJS (compatible) | CommonJS      | `dist/cjs/` | `src/index.ts`                 |
| CLI              | ES modules    | `dist/cli/` | `src/cli/setup-environment.ts` |

- esbuild bundles each entry point into a single file with all internal modules inlined. All `dependencies` and `peerDependencies` are marked external.
- Type declarations (`.d.ts` files) are generated separately via `tsc --emitDeclarationOnly`.
- The CJS output includes a `dist/cjs/package.json` with `{"type":"commonjs"}` so Node.js loads `.js` files under that tree as CommonJS regardless of the root `"type":"module"`.
- The `package.json` `exports` field maps `import` → `dist/index.js` and `require` → `dist/cjs/index.js`.
- Consumers using CJS (e.g. NestJS apps bundled with webpack) should use `require('@rapid-recovery-agency-inc/http_js')` — no special webpack `conditionNames` or externals wrappers are needed.

## Validation

- `npm run lint`
- `npm run type-check`
- `npm run test`
- `npm run build`
- `npm run smoke-test`
- `npm run validate-build`
- `npm run precommit`
