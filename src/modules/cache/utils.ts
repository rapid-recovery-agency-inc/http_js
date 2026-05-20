import type { CacheItem } from './models';

export function isCacheItemValid<TValue>(
  cacheItem: CacheItem<TValue> | null | undefined,
  nowInMilliseconds = Date.now(),
): boolean {
  if (cacheItem === null || cacheItem === undefined) {
    return false;
  }

  if (cacheItem.expiresAt === undefined || cacheItem.value === undefined) {
    return false;
  }

  return nowInMilliseconds < cacheItem.expiresAt;
}
