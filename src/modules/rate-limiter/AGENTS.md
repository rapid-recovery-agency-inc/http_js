# Rate Limiter Module

## Purpose

This module provides rate limiting helpers for HTTP-style requests. It looks up rate limit rules from PostgreSQL, aggregates request counts over hourly, daily, and monthly windows, and rejects requests when capacity is exhausted.

## Architecture

```text
request
  -> rateLimiterMiddleware()
	  -> extract request data
	  -> assertCapacity()
		  -> fetch rule
		  -> fetch counts
		  -> compare counts against limits
```

The current implementation is library-oriented rather than framework-specific middleware, but the control flow mirrors the Python reference closely.

## File Structure

| File                   | Role                                                        |
| ---------------------- | ----------------------------------------------------------- |
| `../../../index.ts`    | Root package export surface for this module                 |
| `services.ts`          | Middleware-style entry point                                |
| `utils.ts`             | Rule lookup, count queries, caching, and capacity assertion |
| `types.ts`             | Rule/count types and `RateLimitException`                   |
| `constants.ts`         | Cache TTL constant                                          |
| `rate-limiter.test.ts` | Module tests                                                |

## Key Responsibilities

- Resolve rate limit rules per path and product.
- Aggregate monthly, daily, and hourly request counts.
- Cache rules and counts to avoid repeated database reads.
- Return a 429-style response when limits are exceeded.

## Dependencies

- Shared Context: [../../shared/context](../../shared/context)
- Shared Requests: [../../shared/requests](../../shared/requests)
- Logging module: [../logging](../logging)
- Postgres module: [../postgres](../postgres)
- Related module: [../request-logger](../request-logger)
- Parent guide: [../../../AGENTS.md](../../../AGENTS.md)
- Root README: [../../../README.md](../../../README.md)

## Navigation

- Public exports: [../../../index.ts](../../../index.ts)
- Middleware layer: [services.ts](services.ts)
- Query and cache logic: [utils.ts](utils.ts)
- Tests: [rate-limiter.test.ts](rate-limiter.test.ts)
