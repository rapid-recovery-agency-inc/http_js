import { InMemoryCache } from '../cache/in-memory-cache.js';
import type {
  Context,
  ContextRequestLike,
} from '../../shared/context/services.js';
import type { PostgresPool } from '../../shared/postgres/services.js';
import type { ExtractedRequestData } from '../../shared/requests/services.js';
import { DEFAULT_REQUEST_TABLE } from '../request-logger/constants.js';
import { resolveRequestLoggerTableName } from '../request-logger/utils.js';

import { RULE_CACHING_EXPIRATION_IN_SECONDS } from './constants.js';
import {
  RateLimitException,
  type RateLimiterRequestCount,
  type RateLimiterRule,
} from './types.js';

const RULE_CACHE = new InMemoryCache<
  RateLimiterRule | RateLimiterRequestCount
>();
const DEFAULT_RULE_TABLE = 'rate_limiter_rule';

interface QueryResult<TValue> {
  rowCount: number | null;
  rows: TValue[];
}

interface QueryablePool {
  query<TValue = unknown>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<TValue>>;
}

type RateLimiterContext = Context<
  unknown,
  PostgresPool,
  PostgresPool,
  ContextRequestLike
>;

function getReaderPool(ctx: RateLimiterContext): QueryablePool {
  return ctx.reader as unknown as QueryablePool;
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

  const table = resolveRequestLoggerTableName(DEFAULT_RULE_TABLE, tablePrefix);
  const result = await getReaderPool(ctx).query<{
    daily_limit: number;
    hourly_limit: number;
    monthly_limit: number;
    path: string;
    product_name: string;
  }>(
    `
      SELECT path, product_name, daily_limit, monthly_limit, hourly_limit
      FROM public.${table}
      WHERE path = $1 AND product_name = $2
      LIMIT 1
    `,
    [required.path, required.productName],
  );

  const row = result.rows[0];
  if (row === undefined) {
    return null;
  }

  const rule: RateLimiterRule = {
    path: row.path,
    productName: row.product_name,
    dailyLimit: row.daily_limit,
    monthlyLimit: row.monthly_limit,
    hourlyLimit: row.hourly_limit,
  };
  RULE_CACHE.set(cacheKey, rule, ruleCachingExpirationSeconds);
  return rule;
}

export async function fetchRateLimiterMonthlyCount(
  args: ExtractedRequestData,
  ctx: RateLimiterContext,
  tablePrefix: string | null = null,
): Promise<number> {
  const required = requireRateLimiterArgs(args);
  const table = resolveRequestLoggerTableName(
    DEFAULT_REQUEST_TABLE,
    tablePrefix,
  );
  const { monthStart } = getUtcBoundaries();
  const result = await getReaderPool(ctx).query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM public.${table}
      WHERE created_at >= $1 AND path = $2 AND product_name = $3
    `,
    [monthStart, required.path, required.productName],
  );
  return Number(result.rows[0]?.count ?? '0');
}

export async function fetchRateLimiterDailyCount(
  args: ExtractedRequestData,
  ctx: RateLimiterContext,
  tablePrefix: string | null = null,
): Promise<number> {
  const required = requireRateLimiterArgs(args);
  const table = resolveRequestLoggerTableName(
    DEFAULT_REQUEST_TABLE,
    tablePrefix,
  );
  const { dayStart } = getUtcBoundaries();
  const result = await getReaderPool(ctx).query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM public.${table}
      WHERE created_at >= $1 AND path = $2 AND product_name = $3
    `,
    [dayStart, required.path, required.productName],
  );
  return Number(result.rows[0]?.count ?? '0');
}

export async function fetchRateLimiterHourlyCount(
  args: ExtractedRequestData,
  ctx: RateLimiterContext,
  tablePrefix: string | null = null,
): Promise<number> {
  const required = requireRateLimiterArgs(args);
  const table = resolveRequestLoggerTableName(
    DEFAULT_REQUEST_TABLE,
    tablePrefix,
  );
  const { hourStart } = getUtcBoundaries();
  const result = await getReaderPool(ctx).query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM public.${table}
      WHERE created_at >= $1 AND path = $2 AND product_name = $3
    `,
    [hourStart, required.path, required.productName],
  );
  return Number(result.rows[0]?.count ?? '0');
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
