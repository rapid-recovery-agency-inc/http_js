export interface CacheItem<TValue = unknown> {
  expiresAt: number;
  value: TValue;
}
