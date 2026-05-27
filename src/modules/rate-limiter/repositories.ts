import type { ExtractedRequestData } from '../../shared/requests/services';
import {
  type PrismaQueryableClient,
  type PrismaStatementFactory,
  resolveQualifiedTableName,
} from '../prisma/services';
import { DEFAULT_REQUEST_TABLE } from '../request-logger/constants';
import { resolveRequestLoggerTableName } from '../request-logger/utils';

import type { RateLimiterRepositoryLike, RateLimiterRule } from './types';

const DEFAULT_RULE_TABLE = 'rate_limiter_rule';

interface RateLimiterRuleRow {
  daily_limit: number;
  hourly_limit: number;
  monthly_limit: number;
  path: string;
  product_name: string;
}

export interface PrismaRateLimiterRepositoryOptions<TStatement> {
  client: PrismaQueryableClient<TStatement>;
  requestTableName?: string;
  ruleTableName?: string;
  schemaName?: string | null;
  sql: PrismaStatementFactory<TStatement>;
}

export class PrismaRateLimiterRepository<
  TStatement = unknown,
> implements RateLimiterRepositoryLike {
  private readonly client: PrismaQueryableClient<TStatement>;
  private readonly requestTableName: string;
  private readonly ruleTableName: string;
  private readonly schemaName: string | null;
  private readonly sql: PrismaStatementFactory<TStatement>;

  public constructor(options: PrismaRateLimiterRepositoryOptions<TStatement>) {
    this.client = options.client;
    this.requestTableName = options.requestTableName ?? DEFAULT_REQUEST_TABLE;
    this.ruleTableName = options.ruleTableName ?? DEFAULT_RULE_TABLE;
    this.schemaName = options.schemaName ?? 'public';
    this.sql = options.sql;
  }

  public async fetchRule(
    args: ExtractedRequestData,
    tablePrefix: string | null = null,
  ): Promise<RateLimiterRule | null> {
    const rows = await this.client.$queryRaw<RateLimiterRuleRow[]>(
      this.sql.sql`
        SELECT path, product_name, daily_limit, monthly_limit, hourly_limit
        FROM ${this.sql.raw(this.getRuleTableName(tablePrefix))}
        WHERE path = ${args.path} AND product_name = ${args.productName}
        LIMIT 1
      `,
    );

    const row = rows[0];
    if (row === undefined) {
      return null;
    }

    return {
      path: row.path,
      productName: row.product_name,
      dailyLimit: row.daily_limit,
      monthlyLimit: row.monthly_limit,
      hourlyLimit: row.hourly_limit,
    };
  }

  public async fetchMonthlyCount(
    args: ExtractedRequestData,
    monthStart: string,
    tablePrefix: string | null = null,
  ): Promise<number> {
    return this.fetchRequestCount(monthStart, args, tablePrefix);
  }

  public async fetchDailyCount(
    args: ExtractedRequestData,
    dayStart: string,
    tablePrefix: string | null = null,
  ): Promise<number> {
    return this.fetchRequestCount(dayStart, args, tablePrefix);
  }

  public async fetchHourlyCount(
    args: ExtractedRequestData,
    hourStart: string,
    tablePrefix: string | null = null,
  ): Promise<number> {
    return this.fetchRequestCount(hourStart, args, tablePrefix);
  }

  private async fetchRequestCount(
    periodStart: string,
    args: ExtractedRequestData,
    tablePrefix: string | null,
  ): Promise<number> {
    const rows = await this.client.$queryRaw<Array<{ count: string }>>(
      this.sql.sql`
        SELECT COUNT(*)::text AS count
        FROM ${this.sql.raw(this.getRequestTableName(tablePrefix))}
        WHERE created_at >= ${periodStart}
          AND path = ${args.path}
          AND product_name = ${args.productName}
      `,
    );

    return Number(rows[0]?.count ?? '0');
  }

  private getRuleTableName(tablePrefix: string | null): string {
    return resolveQualifiedTableName(
      resolveRequestLoggerTableName(this.ruleTableName, tablePrefix),
      this.schemaName,
    );
  }

  private getRequestTableName(tablePrefix: string | null): string {
    return resolveQualifiedTableName(
      resolveRequestLoggerTableName(this.requestTableName, tablePrefix),
      this.schemaName,
    );
  }
}
