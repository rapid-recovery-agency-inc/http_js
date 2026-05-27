import type { CacheItem } from './models';
import type { Cache } from './types';
import { isCacheItemValid } from './utils';

export const DEFAULT_EXPIRATION_IN_SECONDS = 300;

export class InMemoryCache<TValue = unknown> implements Cache<TValue> {
  private readonly cache = new Map<string, CacheItem<TValue>>();
  private readonly maxSize: number;

  public constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  public get itemsCount(): number {
    return this.cache.size;
  }

  public set(
    key: string,
    value: TValue,
    expirationInSeconds = DEFAULT_EXPIRATION_IN_SECONDS,
  ): void {
    if (value === null || value === undefined) {
      throw new Error('InMemoryCache: value cannot be null or undefined');
    }

    if (!this.cache.has(key) && this.cache.size >= this.maxSize) {
      this.clean();

      if (this.cache.size >= this.maxSize) {
        throw new Error('InMemoryCache: cache is full');
      }
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + expirationInSeconds * 1000,
    });
  }

  public get(key: string): TValue | null {
    const cacheItem = this.cache.get(key);

    if (cacheItem === undefined) {
      return null;
    }

    if (isCacheItemValid(cacheItem)) {
      return cacheItem.value;
    }

    this.cache.delete(key);
    return null;
  }

  public removeItem(key: string): void {
    this.cache.delete(key);
  }

  public exists(key: string): boolean {
    const cacheItem = this.cache.get(key);

    if (cacheItem === undefined) {
      return false;
    }

    if (isCacheItemValid(cacheItem)) {
      return true;
    }

    this.cache.delete(key);
    return false;
  }

  public clear(): void {
    this.cache.clear();
  }

  private clean(): void {
    for (const [key, item] of this.cache.entries()) {
      if (!isCacheItemValid(item)) {
        this.cache.delete(key);
      }
    }
  }
}
