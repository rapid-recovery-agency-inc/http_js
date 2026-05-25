import { InMemoryCache } from '../cache/in-memory-cache';
import type {
  ServiceContext,
} from '../../shared/context/services';
import type { ExtractedRequestData } from '../../shared/requests/services';

import { RULE_CACHING_EXPIRATION_IN_SECONDS } from './constants';
import {
  RateLimitException,
  type RateLimiterRequestCount,
  type RateLimiterRepositoryLike,
  type RateLimiterRule,
} from './types';

const RULE_CACHE = new InMemoryCache<
  RateLimiterRule | RateLimiterRequestCount
>();

type RateLimiterContext = ServiceContext<
  RateLimiterRepositoryLike,
  RateLimiterRepositoryLike
>;

function getReaderRepository(
  ctx: RateLimiterContext,
): RateLimiterRepositoryLike {
  return ctx.reader;
}

function requireRateLimiterArgs(args: ExtractedRequestData): {
  path: string;
  productName: string;
} {
  if (args.path.length === 0) {
    throw new Error("rateLimiter: 'path' is required");
  }
  if (args.productName === null) {
    throw new Error("rateLimiter: 'productName' is required");
  }

  return {
    path: args.path,
    productName: args.productName,
  };
}

function getUtcBoundaries(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const date = now.getUTCDate();
  const hour = now.getUTCHours();

  return {
    monthStart: new Date(Date.UTC(year, month, 1)).toISOString(),
    dayStart: new Date(Date.UTC(year, month, date)).toISOString(),
    hourStart: new Date(Date.UTC(year, month, date, hour)).toISOString(),
  };
}

export function resetRateLimiterCache(): void {
  RULE_CACHE.clear();
}

export async function fetchRateLimiterRule(
  args: ExtractedRequestData,
  ctx: RateLimiterContext,
  ruleCachingExpirationSeconds = RULE_CACHING_EXPIRATION_IN_SECONDS,
  tablePrefix: string | null = null,
): Promise<RateLimiterRule | null> {
  const required = requireRateLimiterArgs(args);
  const cacheKey = `rule:${required.path}:${required.productName}`;
  const cached = RULE_CACHE.get(cacheKey);
  if (cached !== null) {
    return cached as RateLimiterRule;
  }

  const rule = await getReaderRepository(ctx).fetchRule(args, tablePrefix);
  if (rule === null) {
    return null;
  }

  RULE_CACHE.set(cacheKey, rule, ruleCachingExpirationSeconds);
  return rule;
}

export async function fetchRateLimiterMonthlyCount(
  args: ExtractedRequestData,
  ctx: RateLimiterContext,
  tablePrefix: string | null = null,
): Promise<number> {
  const required = requireRateLimiterArgs(args);
  const { monthStart } = getUtcBoundaries();
  return getReaderRepository(ctx).fetchMonthlyCount(
    {
      ...args,
      path: required.path,
      productName: required.productName,
    },
    monthStart,
    tablePrefix,
  );
}

export async function fetchRateLimiterDailyCount(
  args: ExtractedRequestData,
  ctx: RateLimiterContext,
  tablePrefix: string | null = null,
): Promise<number> {
  const required = requireRateLimiterArgs(args);
  const { dayStart } = getUtcBoundaries();
  return getReaderRepository(ctx).fetchDailyCount(
    {
      ...args,
      path: required.path,
      productName: required.productName,
    },
    dayStart,
    tablePrefix,
  );
}

export async function fetchRateLimiterHourlyCount(
  args: ExtractedRequestData,
  ctx: RateLimiterContext,
  tablePrefix: string | null = null,
): Promise<number> {
  const required = requireRateLimiterArgs(args);
  const { hourStart } = getUtcBoundaries();
  return getReaderRepository(ctx).fetchHourlyCount(
    {
      ...args,
      path: required.path,
      productName: required.productName,
    },
    hourStart,
    tablePrefix,
  );
}

export async function fetchRateLimiterCount(
  args: ExtractedRequestData,
  ctx: RateLimiterContext,
  ruleCachingExpirationSeconds = RULE_CACHING_EXPIRATION_IN_SECONDS,
  tablePrefix: string | null = null,
): Promise<RateLimiterRequestCount> {
  const required = requireRateLimiterArgs(args);
  const cacheKey = `count:${required.path}:${required.productName}`;
  const cached = RULE_CACHE.get(cacheKey);
  if (cached !== null) {
    return cached as RateLimiterRequestCount;
  }

  const [monthlyCount, dailyCount, hourlyCount] = await Promise.all([
    fetchRateLimiterMonthlyCount(args, ctx, tablePrefix),
    fetchRateLimiterDailyCount(args, ctx, tablePrefix),
    fetchRateLimiterHourlyCount(args, ctx, tablePrefix),
  ]);

  const count: RateLimiterRequestCount = {
    path: required.path,
    productName: required.productName,
    monthlyCount,
    dailyCount,
    hourlyCount,
  };
  RULE_CACHE.set(cacheKey, count, ruleCachingExpirationSeconds);
  return count;
}

export async function assertCapacity(
  args: ExtractedRequestData,
  ctx: RateLimiterContext,
  ruleCachingExpirationSeconds = RULE_CACHING_EXPIRATION_IN_SECONDS,
  tablePrefix: string | null = null,
): Promise<void> {
  const [rule, count] = await Promise.all([
    fetchRateLimiterRule(args, ctx, ruleCachingExpirationSeconds, tablePrefix),
    fetchRateLimiterCount(args, ctx, ruleCachingExpirationSeconds, tablePrefix),
  ]);

  if (rule === null) {
    throw new RateLimitException(
      `Rate limiter rule not found for: ${args.path} - ${args.productName}`,
    );
  }

  if (count.monthlyCount >= rule.monthlyLimit) {
    throw new RateLimitException(
      `Monthly limit exceeded for: ${args.path} - ${args.productName}`,
    );
  }
  if (count.dailyCount >= rule.dailyLimit) {
    throw new RateLimitException(
      `Daily limit exceeded for: ${args.path} - ${args.productName}`,
    );
  }
  if (count.hourlyCount >= rule.hourlyLimit) {
    throw new RateLimitException(
      `Hourly limit exceeded for: ${args.path} - ${args.productName}`,
    );
  }
}
