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

export class RateLimitException extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RateLimitException';
  }
}
