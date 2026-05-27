import { DEFAULT_EXPIRATION_IN_SECONDS } from './in-memory-cache';
import {
  type CacheRepository,
  PrismaCacheRepository,
  type PrismaCacheRepositoryOptions,
} from './repositories';
import type { AsyncCache } from './types';

function parseCachedValue(rawValue: string): unknown {
  try {
    return JSON.parse(rawValue) as unknown;
  } catch {
    return rawValue;
  }
}

export class DatabaseCache<TValue = unknown> implements AsyncCache<TValue> {
  private readonly repository: CacheRepository<TValue>;

  public constructor(
    dependency: CacheRepository<TValue> | PrismaCacheRepositoryOptions<unknown>,
  ) {
    this.repository = isCacheRepository<TValue>(dependency)
      ? dependency
      : new PrismaCacheRepository<TValue, unknown>(dependency);
  }

  public async get(key: string): Promise<TValue | null> {
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const row = await this.repository.find(key);
    if (row === null) {
      return null;
    }

    if (row.expiresAt !== null && nowInSeconds >= row.expiresAt) {
      await this.removeItem(key);
      return null;
    }

    return parseCachedValue(row.value) as TValue;
  }

  public async set(
    key: string,
    value: TValue,
    expirationInSeconds = DEFAULT_EXPIRATION_IN_SECONDS,
  ): Promise<void> {
    if (value === null || value === undefined) {
      throw new Error('DatabaseCache: value cannot be null or undefined');
    }

    await this.repository.upsert(key, value, expirationInSeconds);
  }

  public async removeItem(key: string): Promise<void> {
    await this.repository.remove(key);
  }

  public async exists(key: string): Promise<boolean> {
    return this.repository.exists(key);
  }

  public async clear(): Promise<void> {
    await this.repository.clear();
  }

  public async cleanupExpired(): Promise<number> {
    return this.repository.cleanupExpired();
  }
}

function isCacheRepository<TValue>(
  dependency: unknown,
): dependency is CacheRepository<TValue> {
  if (typeof dependency !== 'object' || dependency === null) {
    return false;
  }

  return (
    'cleanupExpired' in dependency &&
    typeof dependency.cleanupExpired === 'function' &&
    'clear' in dependency &&
    typeof dependency.clear === 'function' &&
    'exists' in dependency &&
    typeof dependency.exists === 'function' &&
    'find' in dependency &&
    typeof dependency.find === 'function' &&
    'remove' in dependency &&
    typeof dependency.remove === 'function' &&
    'upsert' in dependency &&
    typeof dependency.upsert === 'function'
  );
}
