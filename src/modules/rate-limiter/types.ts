import type { ExtractedRequestData } from '../../shared/requests/services';

export interface RateLimiterRule {
  dailyLimit: number;
  hourlyLimit: number;
  monthlyLimit: number;
  path: string;
  productName: string;
}

export interface RateLimiterRequestCount {
  dailyCount: number;
  hourlyCount: number;
  monthlyCount: number;
  path: string;
  productName: string;
}

export interface RateLimiterRepositoryLike {
  fetchDailyCount(
    args: ExtractedRequestData,
    dayStart: string,
    tablePrefix?: string | null,
  ): Promise<number>;
  fetchHourlyCount(
    args: ExtractedRequestData,
    hourStart: string,
    tablePrefix?: string | null,
  ): Promise<number>;
  fetchMonthlyCount(
    args: ExtractedRequestData,
    monthStart: string,
    tablePrefix?: string | null,
  ): Promise<number>;
  fetchRule(
    args: ExtractedRequestData,
    tablePrefix?: string | null,
  ): Promise<RateLimiterRule | null>;
}

export class RateLimitException extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RateLimitException';
  }
}
