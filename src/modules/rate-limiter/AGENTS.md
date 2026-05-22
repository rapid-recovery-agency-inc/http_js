# Rate Limiter Module

## Purpose

This module provides rate limiting helpers for HTTP-style requests. It looks up rate limit rules and request counts through an injected repository, aggregates request counts over hourly, daily, and monthly windows, and rejects requests when capacity is exhausted.

## Architecture

```text
request
  -> rateLimiterMiddleware()
	  -> adapt Express request
	  -> extract request data
	  -> assertCapacity()
		  -> fetch rule from repository
		  -> fetch counts from repository
		  -> compare counts against limits
```

The current implementation targets Express-compatible middleware while keeping the rate-limit decision logic framework-agnostic in the utility layer.

## File Structure

| File                   | Role                                                            |
| ---------------------- | --------------------------------------------------------------- |
| `../../../index.ts`    | Root package export surface for this module                     |
| `services.ts`          | Middleware-style entry point                                    |
| `utils.ts`             | Rule lookup, count composition, caching, and capacity assertion |
| `repositories.ts`      | Prisma-backed rule and count repository                         |
| `types.ts`             | Rule/count types and `RateLimitException`                       |
| `constants.ts`         | Cache TTL constant                                              |
| `rate-limiter.test.ts` | Module tests                                                    |

## Key Responsibilities

- Resolve rate limit rules per path and product.
- Aggregate monthly, daily, and hourly request counts.
- Cache rules and counts to avoid repeated database reads.
- Keep business logic free of raw SQL by delegating storage access to repositories.
- Send a 429 response directly from Express middleware when limits are exceeded.

## Dependencies

- Shared Context: [../../shared/context](../../shared/context)
- Shared Requests: [../../shared/requests](../../shared/requests)
- Logging module: [../logging](../logging)
- Prisma module: [../prisma](../prisma)
- Related module: [../request-logger](../request-logger)
- Parent guide: [../../../AGENTS.md](../../../AGENTS.md)
- Root README: [../../../README.md](../../../README.md)

## Navigation

- Public exports: [../../../index.ts](../../../index.ts)
- Middleware layer: [services.ts](services.ts)
- Query and cache logic: [utils.ts](utils.ts)
- Repository layer: [repositories.ts](repositories.ts)
- Tests: [rate-limiter.test.ts](rate-limiter.test.ts)
